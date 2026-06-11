const express  = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/wallets — user's wallet balances
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: 'Failed to fetch wallets' });
  res.json({ wallets: data });
});

// GET /api/wallets/transactions — all wallet transactions
router.get('/transactions', requireAuth, async (req, res) => {
  const { currency, limit = 50 } = req.query;
  let query = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (currency) query = query.eq('currency', currency.toUpperCase());
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch transactions' });
  res.json({ transactions: data });
});

// GET /api/wallets/deposit-address/:currency
router.get('/deposit-address/:currency', requireAuth, async (req, res) => {
  const currency = req.params.currency.toUpperCase();
  const STATIC_ADDRESSES = {
    BTC:  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    ETH:  '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    USDT: 'TRx9XtVQ7XHThv5ZPiHgVuQ3gQc9maDwNx',
  };
  const address = STATIC_ADDRESSES[currency];
  if (!address) return res.status(400).json({ error: 'Unsupported currency' });
  // In production: generate unique deposit address per user via payment provider API
  res.json({ currency, address, network: currency === 'USDT' ? 'TRC-20' : currency });
});

module.exports = router;
