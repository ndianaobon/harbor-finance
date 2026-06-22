-- ============================================================
-- Harbor Finance — Split USDT wallet into TRC20/ERC20/BEP20
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Copy existing USDT address to TRC20 (was the default network)
INSERT INTO site_settings (key, value)
SELECT 'wallet_usdt_trc20', value FROM site_settings WHERE key = 'wallet_usdt'
ON CONFLICT (key) DO NOTHING;

-- Add ERC20 and BEP20 entries
INSERT INTO site_settings (key, value) VALUES
  ('wallet_usdt_erc20', ''),
  ('wallet_usdt_bep20', '')
ON CONFLICT (key) DO NOTHING;
