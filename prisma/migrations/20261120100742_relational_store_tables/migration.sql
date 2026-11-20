-- AlterTable
ALTER TABLE "store_documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "store_records" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "vendor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "compare_at_price" DOUBLE PRECISION,
    "size_prices" JSONB,
    "giveaway" BOOLEAN NOT NULL DEFAULT false,
    "giveaway_announcement" TEXT,
    "available_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'Other',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "vendor_whatsapp" TEXT NOT NULL DEFAULT '',
    "vendor_business_name" TEXT,
    "location" TEXT,
    "condition" TEXT,
    "detail_gallery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "is_top_selling" BOOLEAN NOT NULL DEFAULT false,
    "related_products_mode" TEXT,
    "related_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "vendor_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "business_address" TEXT NOT NULL,
    "business_category" TEXT NOT NULL,
    "business_description" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "vendor_requests" (
    "request_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "supabase_uid" TEXT,
    "whatsapp_number" TEXT NOT NULL,
    "business_address" TEXT NOT NULL,
    "business_category" TEXT NOT NULL,
    "business_description" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT '',
    "vendor_id" TEXT,
    "created_at" TEXT NOT NULL,
    "approved_at" TEXT,
    "rejected_at" TEXT,
    "rejection_id" TEXT,

    CONSTRAINT "vendor_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "checkout_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "total" DOUBLE PRECISION NOT NULL,
    "checkout_method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "whatsapp_handoff_at" TEXT,
    "vendor_whatsapp" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "selected_size" TEXT,
    "product_image" TEXT,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id","sort_order")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "actor" TEXT NOT NULL,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("order_id","sort_order")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "event_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "product_id" TEXT,
    "vendor_id" TEXT,
    "visitor_id" TEXT,
    "timestamp" TEXT NOT NULL,
    "order_id" TEXT,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "product_likes" (
    "product_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "product_likes_pkey" PRIMARY KEY ("product_id","visitor_id")
);

-- CreateTable
CREATE TABLE "customer_inquiries" (
    "id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "whatsapp" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "customer_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_feedback" (
    "id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "product_id" TEXT NOT NULL,
    "product_title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "product_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_vendor_id_idx" ON "products"("vendor_id");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_is_available_idx" ON "products"("is_available");

-- CreateIndex
CREATE INDEX "vendors_email_idx" ON "vendors"("email");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendor_requests_email_idx" ON "vendor_requests"("email");

-- CreateIndex
CREATE INDEX "vendor_requests_status_idx" ON "vendor_requests"("status");

-- CreateIndex
CREATE INDEX "orders_vendor_id_idx" ON "orders"("vendor_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_checkout_id_idx" ON "orders"("checkout_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_vendor_id_idx" ON "order_items"("vendor_id");

-- CreateIndex
CREATE INDEX "analytics_events_type_idx" ON "analytics_events"("type");

-- CreateIndex
CREATE INDEX "analytics_events_product_id_idx" ON "analytics_events"("product_id");

-- CreateIndex
CREATE INDEX "analytics_events_vendor_id_idx" ON "analytics_events"("vendor_id");

-- CreateIndex
CREATE INDEX "customer_inquiries_status_idx" ON "customer_inquiries"("status");

-- CreateIndex
CREATE INDEX "customer_inquiries_created_at_idx" ON "customer_inquiries"("created_at");

-- CreateIndex
CREATE INDEX "product_feedback_product_id_idx" ON "product_feedback"("product_id");

-- CreateIndex
CREATE INDEX "product_feedback_status_idx" ON "product_feedback"("status");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
