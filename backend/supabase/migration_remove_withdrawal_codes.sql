-- ============================================================
-- Harbor Finance — Remove withdrawal codes and admin-set display fields
-- Withdrawals no longer require WC/FSAC codes or any payment.
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

DROP TABLE IF EXISTS withdrawal_codes;

DELETE FROM site_settings WHERE key IN ('wc_code_enabled', 'fsac_code_enabled');

ALTER TABLE users DROP COLUMN IF EXISTS signal_strength;
ALTER TABLE users DROP COLUMN IF EXISTS account_status_text;
