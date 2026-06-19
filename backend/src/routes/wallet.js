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

// GET /api/wallets/deposit-addresses — all deposit wallet addresses
router.get('/deposit-addresses', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .like('key', 'wallet_%');
  if (error) return res.status(500).json({ error: 'Failed to fetch deposit addresses' });
  const addresses = {};
  (data || []).forEach(row => {
    addresses[row.key.replace('wallet_', '').toUpperCase()] = row.value;
  });
  res.json({ addresses });
});

// GET /api/wallets/deposit-address/:currency
router.get('/deposit-address/:currency', requireAuth, async (req, res) => {
  const currency = req.params.currency.toUpperCase();
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'wallet_' + currency.toLowerCase())
    .single();
  if (!data) return res.status(400).json({ error: 'Unsupported currency' });
  res.json({ currency, address: data.value, network: currency === 'USDT' ? 'TRC-20' : currency });
});

module.exports = router;
