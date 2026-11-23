ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "subcategory" TEXT;

ALTER TABLE "vendor_requests"
ADD COLUMN IF NOT EXISTS "product_main_category" TEXT NOT NULL DEFAULT 'Other Categories',
ADD COLUMN IF NOT EXISTS "product_subcategory" TEXT NOT NULL DEFAULT 'Other';

CREATE TABLE IF NOT EXISTS "vendor_product_policies" (
    "vendor_id" TEXT NOT NULL,
    "main_category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "initial_product_id" TEXT,
    "initial_product_published_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "vendor_product_policies_pkey" PRIMARY KEY ("vendor_id"),
    CONSTRAINT "vendor_product_policies_initial_product_id_key" UNIQUE ("initial_product_id"),
    CONSTRAINT "vendor_product_policies_vendor_id_fkey"
        FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "vendor_product_requests" (
    "request_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "main_category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_description" TEXT NOT NULL,
    "product_image" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_comment" TEXT,
    "reviewed_by" TEXT,
    "created_at" TEXT NOT NULL,
    "reviewed_at" TEXT,
    "published_product_id" TEXT,
    "fulfilled_at" TEXT,
    CONSTRAINT "vendor_product_requests_pkey" PRIMARY KEY ("request_id"),
    CONSTRAINT "vendor_product_requests_published_product_id_key" UNIQUE ("published_product_id"),
    CONSTRAINT "vendor_product_requests_vendor_id_fkey"
        FOREIGN KEY ("vendor_id") REFERENCES "vendors"("vendor_id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vendor_product_requests_vendor_id_status_idx"
ON "vendor_product_requests"("vendor_id", "status");

CREATE INDEX IF NOT EXISTS "vendor_product_requests_status_created_at_idx"
ON "vendor_product_requests"("status", "created_at");

INSERT INTO "vendor_product_policies" (
    "vendor_id",
    "main_category",
    "subcategory",
    "initial_product_id",
    "initial_product_published_at",
    "created_at"
)
SELECT
    v."vendor_id",
    COALESCE(
        CASE LOWER(BTRIM(p."category"))
            WHEN 'fashion' THEN 'Fashion and Apparel'
            WHEN 'electronics' THEN 'Electronics and Technology'
            WHEN 'tech' THEN 'Electronics and Technology'
            WHEN 'food' THEN 'Food and Beverage'
            WHEN 'home' THEN 'Home and Garden'
            WHEN 'beauty' THEN 'Health and Beauty'
            WHEN 'pets' THEN 'Pet Supplies'
            WHEN 'other' THEN 'Other Categories'
            WHEN 'fashion and apparel' THEN 'Fashion and Apparel'
            WHEN 'electronics and technology' THEN 'Electronics and Technology'
            WHEN 'food and beverage' THEN 'Food and Beverage'
            WHEN 'home and garden' THEN 'Home and Garden'
            WHEN 'health and beauty' THEN 'Health and Beauty'
            WHEN 'pet supplies' THEN 'Pet Supplies'
            WHEN 'other categories' THEN 'Other Categories'
            ELSE NULL
        END,
        'Other Categories'
    ),
    'Other',
    p."id",
    CASE WHEN p."id" IS NULL THEN NULL ELSE CURRENT_TIMESTAMP::TEXT END,
    CURRENT_TIMESTAMP::TEXT
FROM "vendors" v
LEFT JOIN LATERAL (
    SELECT product."id", product."category"
    FROM "products" product
    WHERE product."vendor_id" = v."vendor_id"
    ORDER BY product."sort_order", product."id"
    LIMIT 1
) p ON TRUE
ON CONFLICT ("vendor_id") DO NOTHING;
