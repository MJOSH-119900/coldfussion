ALTER TABLE public.vendor_requests
  ADD COLUMN IF NOT EXISTS setup_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS setup_token_expires_at TEXT,
  ADD COLUMN IF NOT EXISTS setup_token_used_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_requests_setup_token_hash_key
  ON public.vendor_requests (setup_token_hash)
  WHERE setup_token_hash IS NOT NULL;
