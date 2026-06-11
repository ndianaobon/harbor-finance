# Harbor Finance Platform

A full-stack investment platform with fixed hourly returns, live trading, multi-wallet support, KYC verification, and a comprehensive admin dashboard.

## Project Structure

```
HARBOR/
├── index.html          ← Landing page
├── auth.html           ← Authentication (Login, Register, 2FA, Email Verify)
├── dashboard.html      ← User dashboard (SPA)
├── admin.html          ← Admin panel (SPA)
└── backend/
    ├── src/
    │   ├── index.js            ← Express server entry point
    │   ├── lib/
    │   │   ├── supabase.js     ← Supabase client
    │   │   └── mailer.js       ← Nodemailer (email OTP, password reset)
    │   ├── middleware/
    │   │   └── auth.js         ← JWT verification middleware
    │   └── routes/
    │       ├── auth.js         ← Register, login, verify-email, 2FA, reset password
    │       ├── user.js         ← Profile, password change, activity logs
    │       ├── deposit.js      ← Deposit requests + admin approval
    │       ├── withdrawal.js   ← Withdrawal requests + admin approval
    │       ├── investment.js   ← Plans, purchase, profit history
    │       ├── wallet.js       ← Multi-wallet, deposit addresses, transactions
    │       ├── referral.js     ← Referral stats and earnings
    │       ├── kyc.js          ← KYC document submission + admin review
    │       └── notification.js ← User notifications, admin broadcast
    └── supabase/
        └── schema.sql          ← Complete database schema (run in Supabase SQL Editor)
```

## Quick Start

### 1. Clone and install backend dependencies

```bash
cd backend
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → Create a new project
2. Go to **SQL Editor** → paste the contents of `backend/supabase/schema.sql` → Run
3. Go to **Project Settings → API** and copy your keys

### 3. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_random_secret_here
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
FRONTEND_URL=http://localhost:3000
PORT=4000
```

> **Gmail setup**: Go to Google Account → Security → 2-Step Verification → App Passwords → generate one for "Mail"

### 4. Run the backend

```bash
# Development (auto-restart on changes)
cd backend && npm run dev

# Production
cd backend && npm start
```

Server starts at `http://localhost:4000`

### 5. Open the frontend

Double-click `auth.html` to open locally, or serve with:

```bash
npx serve . -p 3000
```

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account (sends OTP email) |
| POST | `/api/auth/verify-email` | Verify 6-digit email OTP |
| POST | `/api/auth/resend-otp` | Resend verification code |
| POST | `/api/auth/login` | Login (returns JWT or 2FA challenge) |
| POST | `/api/auth/verify-2fa` | Verify 2FA code after login |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Set new password with token |
| GET  | `/api/auth/me` | Get current user (requires Bearer token) |
| POST | `/api/auth/setup-2fa` | Get QR code for 2FA setup |
| POST | `/api/auth/confirm-2fa` | Confirm and enable 2FA |
| POST | `/api/auth/disable-2fa` | Disable 2FA |

### User

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/user/dashboard` | Dashboard stats |
| PATCH | `/api/user/profile` | Update profile |
| PATCH | `/api/user/password` | Change password |

### Finance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/deposits` | Submit deposit request |
| GET  | `/api/deposits` | Deposit history |
| GET  | `/api/withdrawals` | Withdrawal history |
| POST | `/api/withdrawals` | Submit withdrawal request |
| GET  | `/api/investments/plans` | List active plans |
| POST | `/api/investments` | Purchase a plan |
| GET  | `/api/investments/mine` | My active investments |
| GET  | `/api/investments/profit-history` | Profit history |
| GET  | `/api/wallets` | Wallet balances |
| GET  | `/api/wallets/deposit-address/:currency` | Crypto deposit address |

### KYC

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/kyc/submit` | Submit KYC documents |
| GET  | `/api/kyc/status` | Check KYC status |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | JWT + bcrypt |
| Email | Nodemailer (Gmail / Resend) |
| 2FA | speakeasy (TOTP) |
| File Storage | Supabase Storage (for KYC docs) |

## Deployment

- **Backend**: Deploy to [Railway](https://railway.app), [Render](https://render.com), or [Fly.io](https://fly.io)
- **Frontend**: Deploy to [Vercel](https://vercel.com), [Netlify](https://netlify.com), or [GitHub Pages](https://pages.github.com)
- Set `FRONTEND_URL` in your backend env to your deployed frontend domain
