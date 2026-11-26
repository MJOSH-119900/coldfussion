ALTER TABLE "vendors"
    ADD COLUMN IF NOT EXISTS "username" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "access_days" INTEGER,
    ADD COLUMN IF NOT EXISTS "access_expires_at" TEXT,
    ADD COLUMN IF NOT EXISTS "payment_authorized_at" TEXT,
    ADD COLUMN IF NOT EXISTS "payment_authorized_by" TEXT;

ALTER TABLE "vendor_requests"
    ADD COLUMN IF NOT EXISTS "username" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "verification_doc_type" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "verification_doc_path" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "payment_receipt_path" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "payment_required" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "payment_amount" INTEGER,
    ADD COLUMN IF NOT EXISTS "payment_instructions" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS "review_due_at" TEXT,
    ADD COLUMN IF NOT EXISTS "access_days" INTEGER;
