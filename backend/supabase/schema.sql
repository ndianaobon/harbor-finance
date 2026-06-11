-- ============================================================
-- Harbor Finance — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               TEXT UNIQUE NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  phone               TEXT,
  country             TEXT,
  role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'mod', 'admin', 'super')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_status          TEXT NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN ('unverified', 'pending', 'verified', 'rejected')),
  referral_code       TEXT UNIQUE,
  referred_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  balance             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  tfa_method          TEXT CHECK (tfa_method IN ('app', 'sms', NULL)),
  tfa_secret          TEXT,
  tfa_secret_pending  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email        ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_referred_by   ON users(referred_by);

-- ── EMAIL OTP ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_otp (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('email_verify', '2fa', 'phone_verify')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_otp_user_id ON email_otp(user_id);
CREATE INDEX idx_email_otp_code    ON email_otp(code);

-- ── PASSWORD RESETS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INVESTMENT PLANS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  min_amount    NUMERIC(18, 2) NOT NULL,
  max_amount    NUMERIC(18, 2),
  roi_rate      NUMERIC(6, 4) NOT NULL,   -- e.g. 0.5 = 0.5%
  roi_period    TEXT NOT NULL DEFAULT 'hourly' CHECK (roi_period IN ('hourly', 'daily', 'weekly')),
  duration_days INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans
INSERT INTO investment_plans (name, min_amount, max_amount, roi_rate, roi_period, duration_days) VALUES
  ('Basic',    100,    4999,   0.5,  'hourly', 30),
  ('Silver',   5000,   19999,  0.8,  'hourly', 60),
  ('Gold',     20000,  99999,  1.2,  'hourly', 90),
  ('Platinum', 100000, NULL,   1.5,  'hourly', 180);

-- ── INVESTMENTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id     UUID NOT NULL REFERENCES investment_plans(id),
  amount      NUMERIC(18, 2) NOT NULL,
  roi_rate    NUMERIC(6, 4) NOT NULL,
  roi_period  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  matures_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investments_user_id ON investments(user_id);

-- ── PROFIT HISTORY ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profit_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  investment_id  UUID REFERENCES investments(id) ON DELETE SET NULL,
  amount         NUMERIC(18, 2) NOT NULL,
  type           TEXT NOT NULL DEFAULT 'roi' CHECK (type IN ('roi', 'referral', 'bonus')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profit_user_id ON profit_history(user_id);

-- ── DEPOSITS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposits (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method      TEXT NOT NULL,
  amount      NUMERIC(18, 2) NOT NULL,
  tx_hash     TEXT,
  receipt_url TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_status  ON deposits(status);

-- ── WITHDRAWALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method          TEXT NOT NULL,
  wallet_address  TEXT NOT NULL,
  amount          NUMERIC(18, 2) NOT NULL,
  fee             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net             NUMERIC(18, 2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status  ON withdrawals(status);

-- ── WALLETS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency    TEXT NOT NULL,
  balance     NUMERIC(28, 8) NOT NULL DEFAULT 0,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency    TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer_in', 'transfer_out')),
  amount      NUMERIC(28, 8) NOT NULL,
  tx_hash     TEXT,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'confirmed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── KYC ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type     TEXT NOT NULL,
  front_url         TEXT NOT NULL,
  back_url          TEXT,
  selfie_url        TEXT NOT NULL,
  poa_url           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','resubmit_requested')),
  rejection_reason  TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_user_id ON kyc_submissions(user_id);
CREATE INDEX idx_kyc_status  ON kyc_submissions(status);

-- ── REFERRAL EARNINGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_earnings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_id     UUID NOT NULL REFERENCES users(id),
  investment_id   UUID REFERENCES investments(id),
  amount          NUMERIC(18, 2) NOT NULL,
  level           INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ref_earnings_beneficiary ON referral_earnings(beneficiary_id);

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- ── ACTIVITY LOGS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  ip          TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);

-- ── Auto-update updated_at on users ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security (basic) ────────────────────────────────────────────────
-- We use service_role key in backend so RLS is bypassed server-side.
-- Enable RLS on tables so direct anon access is blocked.
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_otp          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_earnings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Public read on investment_plans (no auth needed to browse plans)
ALTER TABLE investment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investment_plans_public_read" ON investment_plans
  FOR SELECT USING (active = TRUE);
