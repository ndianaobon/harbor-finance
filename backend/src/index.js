require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const adminRoutes        = require('./routes/admin');
const userRoutes         = require('./routes/user');
const depositRoutes      = require('./routes/deposit');
const withdrawalRoutes   = require('./routes/withdrawal');
const investmentRoutes   = require('./routes/investment');
const walletRoutes       = require('./routes/wallet');
const referralRoutes     = require('./routes/referral');
const kycRoutes          = require('./routes/kyc');
const notificationRoutes = require('./routes/notification');
const supportRoutes      = require('./routes/support');
const uploadRoutes       = require('./routes/upload');

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 4000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'https://harborfinance.net',
    'https://www.harborfinance.net',
    'http://harborfinance.net',
    'http://www.harborfinance.net',
    'http://localhost:3000',
    'http://localhost:4000',
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
});
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts. Please wait 15 minutes.' },
});
app.use(globalLimit);
app.use('/api/auth', authLimit);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Harbor Finance API' });
});

app.get('/health/email', async (_req, res) => {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': 'Bearer ' + resendKey },
      });
      const ok = r.status === 200;
      res.json({ status: ok ? 'ok' : 'error', provider: 'resend', api: ok ? 'connected' : 'invalid key (status ' + r.status + ')' });
    } catch (err) {
      res.json({ status: 'error', provider: 'resend', api: err.message });
    }
    return;
  }
  res.json({ status: 'error', provider: 'none', message: 'RESEND_API_KEY is not set. Add it to Railway environment variables.' });
});

app.get('/health/email-test', async (_req, res) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.json({ error: 'RESEND_API_KEY not set' });
  const from = process.env.EMAIL_FROM || 'Harbor Finance <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: ['ndianaobongsunday3@gmail.com'], subject: 'Harbor Finance Test', html: '<h2>Email is working!</h2><p>If you see this, Resend is configured correctly.</p>' }),
    });
    const data = await r.json();
    res.json({ status: r.ok ? 'sent' : 'failed', from, response: data });
  } catch (err) {
    res.json({ status: 'error', from, message: err.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/user',          userRoutes);
app.use('/api/deposits',      depositRoutes);
app.use('/api/withdrawals',   withdrawalRoutes);
app.use('/api/investments',   investmentRoutes);
app.use('/api/wallets',       walletRoutes);
app.use('/api/referrals',     referralRoutes);
app.use('/api/kyc',           kycRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support',       supportRoutes);
app.use('/api/upload',        uploadRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀  Harbor Finance API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health\n`);
});
