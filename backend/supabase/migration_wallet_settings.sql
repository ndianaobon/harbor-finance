-- ============================================================
-- Harbor Finance — Wallet Address Settings Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Site-wide settings (key-value store for admin-configurable values)
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default deposit wallet addresses
INSERT INTO site_settings (key, value) VALUES
  ('wallet_btc',  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'),
  ('wallet_eth',  '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
  ('wallet_usdt', 'TRx9XtVQ7XHThv5ZPiHgVuQ3gQc9maDwNx')
ON CONFLICT (key) DO NOTHING;

-- RLS: block direct anon access (service_role bypasses this)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
