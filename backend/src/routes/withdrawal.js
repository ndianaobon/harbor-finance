const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

const MIN_WITHDRAWAL = 50;
const FEE_RATE = 0.01; // 1%

// POST /api/withdrawals
router.post('/', requireAuth, async (req, res) => {
  const { method, walletAddress, amount } = req.body;
  if (!method || !walletAddress || !amount) {
    return res.status(400).json({ error: 'Method, wallet address, and amount are required' });
  }

  const amt = Number(amount);
  if (amt < MIN_WITHDRAWAL) return res.status(400).json({ error: `Minimum withdrawal is $${MIN_WITHDRAWAL}` });

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
