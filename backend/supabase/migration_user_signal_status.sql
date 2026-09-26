-- ============================================================
-- Harbor Finance — Add signal_strength & account_status_text to users
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS signal_strength INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status_text TEXT NOT NULL DEFAULT 'Account Active';
