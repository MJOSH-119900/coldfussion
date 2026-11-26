ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "discovery_fingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS "subscription_status" TEXT,
  ADD COLUMN IF NOT EXISTS "subscription_expires_at" TEXT;

-- Keep existing approved vendors visible while moving them onto the explicit
-- subscription columns. Vendors that previously had no expiry retain access.
UPDATE public.vendors
SET "subscription_status" = CASE
      WHEN "status" IN ('approved', 'active')
        AND (NULLIF("access_expires_at", '') IS NULL
          OR ("access_expires_at" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            AND "access_expires_at"::timestamptz > now()))
      THEN 'active' ELSE 'expired' END,
    "subscription_expires_at" = COALESCE(
      NULLIF("subscription_expires_at", ''),
      CASE WHEN "access_expires_at" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN "access_expires_at"
        ELSE to_char(now() + interval '100 years', 'YYYY-MM-DD"T"HH24:MI:SS.USOF') END
    )
WHERE "subscription_status" IS NULL;

CREATE TABLE IF NOT EXISTS public.product_discovery_history (
  vendor_id TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  first_published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, content_fingerprint)
);
ALTER TABLE public.product_discovery_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_discovery_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_product_discovery_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.discovery_fingerprint := md5(concat_ws('|',
    NEW.vendor_id,
    lower(regexp_replace(trim(NEW.title), '[[:space:]]+', ' ', 'g')),
    lower(trim(NEW.category)),
    lower(trim(COALESCE(NEW.subcategory, ''))),
    lower(regexp_replace(trim(COALESCE(NEW.brand, 'Unbranded')), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(trim(NEW.description), '[[:space:]]+', ' ', 'g'))
  ));
  INSERT INTO public.product_discovery_history (vendor_id, content_fingerprint, first_published_at)
  VALUES (NEW.vendor_id, NEW.discovery_fingerprint, COALESCE(NEW.created_at, now()))
  ON CONFLICT (vendor_id, content_fingerprint) DO NOTHING;
  RETURN NEW;
END; $$;

UPDATE public.products AS p
SET discovery_fingerprint = md5(concat_ws('|',
  p.vendor_id,
  lower(regexp_replace(trim(p.title), '[[:space:]]+', ' ', 'g')),
  lower(trim(p.category)),
  lower(trim(COALESCE(p.subcategory, ''))),
  lower(regexp_replace(trim(COALESCE(p.brand, 'Unbranded')), '[[:space:]]+', ' ', 'g')),
  lower(regexp_replace(trim(p.description), '[[:space:]]+', ' ', 'g'))
))
WHERE p.discovery_fingerprint = '';
INSERT INTO public.product_discovery_history (vendor_id, content_fingerprint, first_published_at)
SELECT vendor_id, discovery_fingerprint, min(created_at)
FROM public.products
GROUP BY vendor_id, discovery_fingerprint
ON CONFLICT (vendor_id, content_fingerprint) DO NOTHING;

DROP TRIGGER IF EXISTS capture_product_discovery_identity_insert ON public.products;
CREATE TRIGGER capture_product_discovery_identity_insert
  BEFORE INSERT ON public.products FOR EACH ROW
  EXECUTE FUNCTION public.capture_product_discovery_identity();
DROP TRIGGER IF EXISTS capture_product_discovery_identity_update ON public.products;
CREATE TRIGGER capture_product_discovery_identity_update
  BEFORE UPDATE OF vendor_id, title, description, category, subcategory, brand ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.capture_product_discovery_identity();

CREATE INDEX IF NOT EXISTS "products_category_brand_vendor_featured_idx"
  ON public.products (category, brand, vendor_id, featured_until);
CREATE INDEX IF NOT EXISTS "products_vendor_created_at_idx"
  ON public.products (vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "products_featured_until_idx"
  ON public.products (featured_until);
CREATE INDEX IF NOT EXISTS "vendors_subscription_status_idx"
  ON public.vendors (subscription_status);
CREATE INDEX IF NOT EXISTS "product_discovery_history_first_published_idx"
  ON public.product_discovery_history (vendor_id, first_published_at DESC);

CREATE OR REPLACE FUNCTION public.get_fair_products(
  filter_category TEXT DEFAULT NULL,
  filter_brand TEXT DEFAULT NULL,
  search_query TEXT DEFAULT NULL,
  page_limit INTEGER DEFAULT 20,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  vendor_id TEXT,
  title TEXT,
  description TEXT,
  price DOUBLE PRECISION,
  compare_at_price DOUBLE PRECISION,
  size_prices JSONB,
  giveaway BOOLEAN,
  giveaway_announcement TEXT,
  available_quantity INTEGER,
  is_available BOOLEAN,
  images TEXT[],
  category TEXT,
  subcategory TEXT,
  brand TEXT,
  tags TEXT[],
  likes_count INTEGER,
  vendor_whatsapp TEXT,
  vendor_business_name TEXT,
  location TEXT,
  condition TEXT,
  detail_gallery_enabled BOOLEAN,
  is_latest BOOLEAN,
  is_top_selling BOOLEAN,
  is_featured BOOLEAN,
  featured_until TEXT,
  related_products_mode TEXT,
  related_product_ids TEXT[],
  created_at TIMESTAMPTZ,
  store_name TEXT,
  whatsapp_number TEXT,
  vendor_item_rank BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS (
    SELECT p.*, v.business_name AS joined_store_name,
      v.whatsapp_number AS joined_whatsapp_number,
      COALESCE(h.first_published_at, p.created_at) AS stable_published_at,
      (p.is_featured AND p.featured_until IS NOT NULL
        AND p.featured_until::timestamptz > now()) AS has_paid_boost
    FROM public.products AS p
    JOIN public.vendors AS v ON v.vendor_id = p.vendor_id
    LEFT JOIN public.product_discovery_history AS h
      ON h.vendor_id = p.vendor_id AND h.content_fingerprint = p.discovery_fingerprint
    WHERE v.subscription_status = 'active'
      AND v.status IN ('approved', 'active')
      AND v.subscription_expires_at IS NOT NULL
      AND v.subscription_expires_at::timestamptz > now()
      AND (filter_category IS NULL OR filter_category = '' OR p.category = filter_category
        OR (filter_category = 'Fashion and Apparel' AND lower(p.category) = 'fashion')
        OR (filter_category = 'Electronics and Technology' AND lower(p.category) IN ('electronics', 'tech'))
        OR (filter_category = 'Food and Beverage' AND lower(p.category) = 'food')
        OR (filter_category = 'Home and Garden' AND lower(p.category) = 'home')
        OR (filter_category = 'Health and Beauty' AND lower(p.category) = 'beauty')
        OR (filter_category = 'Pet Supplies' AND lower(p.category) = 'pets')
        OR (filter_category = 'Other Categories' AND lower(p.category) = 'other'))
      AND (filter_brand IS NULL OR filter_brand = '' OR p.brand = filter_brand)
      AND (search_query IS NULL OR trim(search_query) = '' OR
        concat_ws(' ', p.title, p.description, p.category, p.subcategory, p.brand,
          v.business_name, p.location, array_to_string(p.tags, ' '))
          ILIKE '%' || trim(search_query) || '%')
  ), boost_slots AS (
    SELECT e.*,
      row_number() OVER (
        PARTITION BY e.vendor_id
        ORDER BY e.has_paid_boost DESC, e.featured_until DESC NULLS LAST,
          md5(e.discovery_fingerprint || current_date::text)
      ) AS boost_vendor_rank
    FROM eligible AS e
  ), vendor_rounds AS (
    SELECT b.*,
      (b.has_paid_boost AND b.boost_vendor_rank = 1) AS is_top_featured,
      row_number() OVER (
        PARTITION BY b.vendor_id
        ORDER BY (b.has_paid_boost AND b.boost_vendor_rank = 1) DESC,
          b.stable_published_at DESC,
          b.created_at DESC,
          md5(b.discovery_fingerprint || current_date::text),
          b.id
      ) AS vendor_item_rank
    FROM boost_slots AS b
  )
  SELECT r.id, r.vendor_id, r.title, r.description, r.price, r.compare_at_price,
    r.size_prices, r.giveaway, r.giveaway_announcement, r.available_quantity,
    r.is_available, r.images, r.category, r.subcategory, r.brand, r.tags,
    r.likes_count, COALESCE(NULLIF(r.vendor_whatsapp, ''), r.joined_whatsapp_number),
    r.joined_store_name, r.location, r.condition, r.detail_gallery_enabled,
    r.is_latest, r.is_top_selling, r.is_top_featured,
    r.featured_until, r.related_products_mode, r.related_product_ids,
    r.created_at, r.joined_store_name, r.joined_whatsapp_number, r.vendor_item_rank
  FROM vendor_rounds AS r
  ORDER BY r.vendor_item_rank ASC, r.is_top_featured DESC,
    md5(r.discovery_fingerprint || current_date::text), r.id
  LIMIT LEAST(GREATEST(COALESCE(page_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(page_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.get_fair_products(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fair_products(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;

