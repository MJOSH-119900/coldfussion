ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "receipt_confirmation_token_hash" TEXT,
ADD COLUMN IF NOT EXISTS "receipt_confirmation_expires_at" TEXT,
ADD COLUMN IF NOT EXISTS "receipt_confirmation_sent_at" TEXT,
ADD COLUMN IF NOT EXISTS "customer_received_at" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_receipt_confirmation_token_hash_key"
ON "orders"("receipt_confirmation_token_hash");
