-- ============================================================
-- Harbor Finance — OAuth Support Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Allow NULL password_hash for OAuth users (they have no password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Track how the user signed up
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'
  CHECK (auth_provider IN ('email', 'google'));
