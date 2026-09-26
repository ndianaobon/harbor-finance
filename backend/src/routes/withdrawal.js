const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

const MIN_WITHDRAWAL = 50;
const FEE_RATE = 0.01; // 1%

// GET /api/withdrawals/settings — check if WC/FSAC codes are required
router.get('/settings', requireAuth, async (req, res) => {
  const { data } = await supabase.from('site_settings').select('key, value').in('key', ['wc_code_enabled', 'fsac_code_enabled']);
  const s = {};
  (data || []).forEach(r => { s[r.key] = r.value === 'true'; });
  res.json({ wcRequired: s.wc_code_enabled ?? false, fsacRequired: s.fsac_code_enabled ?? false });
});

// POST /api/withdrawals
router.post('/', requireAuth, async (req, res) => {
  const { method, walletAddress, amount, wcCode, fsacCode } = req.body;
  if (!method || !walletAddress || !amount) {
    return res.status(400).json({ error: 'Method, wallet address, and amount are required' });
  }

  const amt = Number(amount);
  if (amt < MIN_WITHDRAWAL) return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL}` });

  // Check WC/FSAC code requirements
  const { data: settings } = await supabase.from('site_settings').select('key, value').in('key', ['wc_code_enabled', 'fsac_code_enabled']);
  const cfg = {};
  (settings || []).forEach(r => { cfg[r.key] = r.value === 'true'; });

  if (cfg.wc_code_enabled) {
    if (!wcCode) return res.status(400).json({ error: 'Withdrawal Confirmation (WC) code is required. Contact support to get your code.' });
    const { data: wc } = await supabase.from('withdrawal_codes').select('*').eq('user_id', req.user.id).eq('code_type', 'wc').eq('code', wcCode.trim()).eq('used', false).maybeSingle();
    if (!wc) return res.status(400).json({ error: 'Invalid WC code. Please contact support to purchase a valid code.' });
    await supabase.from('withdrawal_codes').update({ used: true }).eq('id', wc.id);
  }
  if (cfg.fsac_code_enabled) {
    if (!fsacCode) return res.status(400).json({ error: 'FSAC code is required. Contact support to get your code.' });
    const { data: fsac } = await supabase.from('withdrawal_codes').select('*').eq('user_id', req.user.id).eq('code_type', 'fsac').eq('code', fsacCode.trim()).eq('used', false).maybeSingle();
    if (!fsac) return res.status(400).json({ error: 'Invalid FSAC code. Please contact support to purchase a valid code.' });
    await supabase.from('withdrawal_codes').update({ used: true }).eq('id', fsac.id);
  }

  const { data: user } = await supabase.from('users').select('balance').eq('id', req.user.id).single();
  if (Number(user.balance) < amt) return res.status(400).json({ error: 'Insufficient balance' });

  const fee = parseFloat((amt * FEE_RATE).toFixed(2));
  const net = parseFloat((amt - fee).toFixed(2));

  // Deduct from balance immediately (hold)
  await supabase.from('users').update({ balance: Number(user.balance) - amt }).eq('id', req.user.id);

  const { data, error } = await supabase.from('withdrawals').insert({
    user_id:        req.user.id,
    method,
    wallet_address: walletAddress,
    amount:         amt,
    fee,
    net,
    status:         'pending',
  }).select().single();

  if (error) {
    // Rollback balance
    await supabase.from('users').update({ balance: Number(user.balance) }).eq('id', req.user.id);
    return res.status(500).json({ error: 'Failed to submit withdrawal' });
  }

  res.status(201).json({ message: 'Withdrawal request submitted. Processing within 24 hours.', withdrawal: data });
});

// GET /api/withdrawals
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch withdrawals' });
  res.json({ withdrawals: data });
});

// GET /api/withdrawals/admin/all
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('withdrawals')
    .select('*, users(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch withdrawals' });
  res.json({ withdrawals: data });
});

// PATCH /api/withdrawals/admin/:id
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  const { action, note } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
  }

  const { data: wd } = await supabase.from('withdrawals').select('*').eq('id', req.params.id).single();
  if (!wd) return res.status(404).json({ error: 'Withdrawal not found' });
  if (wd.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already actioned' });

  if (action === 'reject') {
    // Refund balance
    const { data: user } = await supabase.from('users').select('balance').eq('id', wd.user_id).single();
    await supabase.from('users').update({ balance: Number(user.balance) + Number(wd.amount) }).eq('id', wd.user_id);
  }

  await supabase.from('withdrawals').update({ status: action === 'approve' ? 'approved' : 'rejected', admin_note: note || null }).eq('id', wd.id);

  res.json({ message: `Withdrawal ${action}d successfully` });
});

module.exports = router;
