-- ============================================================
-- Harbor Finance — Withdrawal Codes (WC + FSAC)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS withdrawal_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_type   TEXT NOT NULL CHECK (code_type IN ('wc', 'fsac')),
  code        TEXT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_codes_user ON withdrawal_codes(user_id);

ALTER TABLE withdrawal_codes ENABLE ROW LEVEL SECURITY;

-- Settings to enable/disable WC and FSAC codes
INSERT INTO site_settings (key, value) VALUES
  ('wc_code_enabled', 'true'),
  ('fsac_code_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
