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

const app  = express();
const PORT = parseInt(process.env.PORT) || 8080;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'https://harborfinance.net',
    'https://www.harborfinance.net',
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
