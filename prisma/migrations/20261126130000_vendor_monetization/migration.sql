ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "brand" TEXT NOT NULL DEFAULT 'Unbranded',
  ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "featured_until" TEXT;

ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "max_products" INTEGER,
  ADD COLUMN IF NOT EXISTS "allowed_categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "allowed_brands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "category_brands" JSONB,
  ADD COLUMN IF NOT EXISTS "subscription_status" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_expires_at" TEXT;

ALTER TABLE "vendor_requests"
  ADD COLUMN IF NOT EXISTS "requested_brand" TEXT NOT NULL DEFAULT 'Unbranded';

CREATE TABLE IF NOT EXISTS "vendor_upgrade_requests" (
  "id" TEXT PRIMARY KEY,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("vendor_id") ON DELETE CASCADE,
  "request_type" TEXT NOT NULL,
  "requested_value" TEXT NOT NULL DEFAULT '',
  "amount_naira" INTEGER NOT NULL,
  "reference_code" TEXT NOT NULL UNIQUE,
  "receipt_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TEXT NOT NULL,
  "reviewed_at" TEXT,
  "reviewed_by" TEXT,
  "admin_note" TEXT,
  CONSTRAINT "vendor_upgrade_requests_type_check" CHECK ("request_type" IN ('extra_brand', 'extra_category', 'extra_slots', 'featured_boost', 'monthly_renewal')),
  CONSTRAINT "vendor_upgrade_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS "vendor_upgrade_requests_vendor_id_status_idx" ON "vendor_upgrade_requests"("vendor_id", "status");
CREATE INDEX IF NOT EXISTS "vendor_upgrade_requests_status_created_at_idx" ON "vendor_upgrade_requests"("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_upgrade_requests_one_pending_per_item_idx"
  ON "vendor_upgrade_requests"("vendor_id", "request_type", "requested_value") WHERE "status" = 'pending';

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
DROP POLICY IF EXISTS "Public reads product catalog" ON public.products;
CREATE POLICY "Public reads product catalog" ON public.products
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Vendors and admins create products" ON public.products;
CREATE POLICY "Vendors and admins create products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor'
      AND vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id'))
  );
DROP POLICY IF EXISTS "Vendors and admins update products" ON public.products;
CREATE POLICY "Vendors and admins update products" ON public.products
  FOR UPDATE TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor'
      AND vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id'))
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor'
      AND vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id'))
  );
DROP POLICY IF EXISTS "Vendors and admins delete products" ON public.products;
CREATE POLICY "Vendors and admins delete products" ON public.products
  FOR DELETE TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor'
      AND vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id'))
  );

-- RLS protects direct authenticated Supabase access. The app's Prisma server
-- connection uses the database role and still enforces these same checks in actions.
ALTER TABLE public.vendor_upgrade_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.vendor_upgrade_requests TO authenticated;
DROP POLICY IF EXISTS "Vendor reads own upgrade requests" ON public.vendor_upgrade_requests;
CREATE POLICY "Vendor reads own upgrade requests" ON public.vendor_upgrade_requests
  FOR SELECT TO authenticated USING (
    vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id')
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );
DROP POLICY IF EXISTS "Vendor creates own upgrade requests" ON public.vendor_upgrade_requests;
CREATE POLICY "Vendor creates own upgrade requests" ON public.vendor_upgrade_requests
  FOR INSERT TO authenticated WITH CHECK (
    vendor_id = (auth.jwt() -> 'app_metadata' ->> 'vendor_id')
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor'
    AND status = 'pending'
  );
DROP POLICY IF EXISTS "Admins review upgrade requests" ON public.vendor_upgrade_requests;
CREATE POLICY "Admins review upgrade requests" ON public.vendor_upgrade_requests
  FOR UPDATE TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

CREATE OR REPLACE FUNCTION public.validate_vendor_upgrade_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role TEXT := auth.jwt() -> 'app_metadata' ->> 'role';
  actor_vendor_id TEXT := auth.jwt() -> 'app_metadata' ->> 'vendor_id';
  vendor_row public.vendors%ROWTYPE;
  expected_amount INTEGER;
  parsed_value JSONB;
BEGIN
  IF actor_role IS DISTINCT FROM 'vendor' THEN RETURN NEW; END IF;
  IF NEW.vendor_id <> actor_vendor_id OR NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Vendors can only create pending requests for their own account.';
  END IF;
  expected_amount := CASE NEW.request_type
    WHEN 'monthly_renewal' THEN 1000 WHEN 'extra_brand' THEN 500
    WHEN 'extra_category' THEN 1000 WHEN 'extra_slots' THEN 300
    WHEN 'featured_boost' THEN 500 ELSE NULL END;
  IF expected_amount IS NULL OR NEW.amount_naira <> expected_amount THEN
    RAISE EXCEPTION 'Invalid upgrade type or amount.';
  END IF;
  SELECT * INTO vendor_row FROM public.vendors WHERE vendor_id = actor_vendor_id;
  IF NEW.request_type = 'extra_category' AND (vendor_row.allowed_categories IS NULL OR NEW.requested_value = ANY(vendor_row.allowed_categories)) THEN
    RAISE EXCEPTION 'Category is already unlocked or vendor entitlements are missing.';
  ELSIF NEW.request_type = 'extra_brand' THEN
    parsed_value := NEW.requested_value::jsonb;
    IF NOT (parsed_value ? 'category' AND parsed_value ? 'brand')
      OR NOT (parsed_value ->> 'category' = ANY(COALESCE(vendor_row.allowed_categories, ARRAY[]::TEXT[]))) THEN
      RAISE EXCEPTION 'Brand unlock requires an already unlocked category.';
    END IF;
  ELSIF NEW.request_type = 'featured_boost' AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = NEW.requested_value AND vendor_id = actor_vendor_id
  ) THEN RAISE EXCEPTION 'Featured product must belong to the requesting vendor.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS validate_vendor_upgrade_request_before_insert ON public.vendor_upgrade_requests;
CREATE TRIGGER validate_vendor_upgrade_request_before_insert
  BEFORE INSERT ON public.vendor_upgrade_requests FOR EACH ROW EXECUTE FUNCTION public.validate_vendor_upgrade_request();

-- The app's vendor actions enforce this through Prisma. This trigger also
-- protects direct Supabase inserts where the caller has a vendor JWT.
CREATE OR REPLACE FUNCTION public.enforce_vendor_product_entitlements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role TEXT := auth.jwt() -> 'app_metadata' ->> 'role';
  actor_vendor_id TEXT := auth.jwt() -> 'app_metadata' ->> 'vendor_id';
  vendor_row public.vendors%ROWTYPE;
  current_count INTEGER;
BEGIN
  IF actor_role IS DISTINCT FROM 'vendor' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id = NEW.id) THEN RETURN NEW; END IF;
  NEW.is_featured := FALSE;
  NEW.featured_until := NULL;
  IF actor_vendor_id IS NULL OR NEW.vendor_id <> actor_vendor_id THEN
    RAISE EXCEPTION 'A vendor can only publish products for their own account.';
  END IF;
  SELECT * INTO vendor_row FROM public.vendors WHERE vendor_id = actor_vendor_id;
  IF NOT FOUND OR vendor_row.status NOT IN ('approved', 'active') THEN
    RAISE EXCEPTION 'Vendor account is not active.';
  END IF;
  IF vendor_row.subscription_status IS NOT NULL AND vendor_row.subscription_status <> 'active' THEN
    RAISE EXCEPTION 'Vendor subscription is not active.';
  END IF;
  IF vendor_row.subscription_expires_at IS NOT NULL AND vendor_row.subscription_expires_at::timestamptz <= now() THEN
    RAISE EXCEPTION 'Vendor subscription has expired.';
  END IF;
  IF vendor_row.max_products IS NOT NULL THEN
    SELECT count(*) INTO current_count FROM public.products WHERE vendor_id = actor_vendor_id;
    IF current_count >= vendor_row.max_products THEN RAISE EXCEPTION 'Product slot limit reached.'; END IF;
  END IF;
  IF vendor_row.max_products IS NOT NULL AND NOT (NEW.category = ANY(vendor_row.allowed_categories)) THEN
    RAISE EXCEPTION 'Product category is not unlocked for this vendor.';
  END IF;
  IF vendor_row.max_products IS NOT NULL AND NOT (NEW.brand = ANY(vendor_row.allowed_brands)) THEN
    RAISE EXCEPTION 'Product brand is not unlocked for this vendor.';
  END IF;
  IF vendor_row.category_brands IS NOT NULL AND vendor_row.category_brands ? NEW.category
    AND NOT (vendor_row.category_brands -> NEW.category ? NEW.brand) THEN
    RAISE EXCEPTION 'Product brand is not unlocked within this category.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enforce_vendor_product_entitlements_before_insert ON public.products;
CREATE TRIGGER enforce_vendor_product_entitlements_before_insert
  BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_vendor_product_entitlements();

CREATE OR REPLACE FUNCTION public.protect_vendor_product_entitlements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role TEXT := auth.jwt() -> 'app_metadata' ->> 'role';
  actor_vendor_id TEXT := auth.jwt() -> 'app_metadata' ->> 'vendor_id';
  vendor_row public.vendors%ROWTYPE;
BEGIN
  IF actor_role IS DISTINCT FROM 'vendor' THEN RETURN NEW; END IF;
  IF OLD.vendor_id <> actor_vendor_id OR NEW.vendor_id <> actor_vendor_id THEN
    RAISE EXCEPTION 'A vendor can only update their own products.';
  END IF;
  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured OR NEW.featured_until IS DISTINCT FROM OLD.featured_until THEN
    RAISE EXCEPTION 'Featured placement can only be changed by an administrator.';
  END IF;
  SELECT * INTO vendor_row FROM public.vendors WHERE vendor_id = actor_vendor_id;
  IF vendor_row.max_products IS NOT NULL THEN
    IF NOT (NEW.category = ANY(vendor_row.allowed_categories)) THEN RAISE EXCEPTION 'Product category is not unlocked for this vendor.'; END IF;
    IF NOT (NEW.brand = ANY(vendor_row.allowed_brands)) THEN RAISE EXCEPTION 'Product brand is not unlocked for this vendor.'; END IF;
    IF vendor_row.category_brands IS NOT NULL AND vendor_row.category_brands ? NEW.category
      AND NOT (vendor_row.category_brands -> NEW.category ? NEW.brand) THEN
      RAISE EXCEPTION 'Product brand is not unlocked within this category.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS protect_vendor_product_entitlements_before_update ON public.products;
CREATE TRIGGER protect_vendor_product_entitlements_before_update
  BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_product_entitlements();

