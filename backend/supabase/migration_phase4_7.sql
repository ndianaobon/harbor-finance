-- ============================================================
-- Harbor Finance — Phase 4-7 Migrations
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- KYC: Add personal details columns
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS country TEXT;

-- Support chat: Add file attachment columns
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Deposits: Add screenshot column
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
