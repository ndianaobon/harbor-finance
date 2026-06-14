const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// POST /api/deposits — user submits deposit request
router.post('/', requireAuth, async (req, res) => {
  const { method, amount, txHash, notes } = req.body;
  if (!method || !amount) return res.status(400).json({ error: 'Method and amount are required' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

  const { data, error } = await supabase.from('deposits').insert({
    user_id:  req.user.id,
    method,
    amount:   Number(amount),
    tx_hash:  txHash || null,
    notes:    notes || null,
    status:   'pending',
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to submit deposit' });
  res.status(201).json({ message: 'Deposit submitted and pending admin approval', deposit: data });
});

// GET /api/deposits — user's deposit history
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch deposits' });
  res.json({ deposits: data });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET /api/deposits/admin/all
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('deposits')
    .select('*, users(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch deposits' });
  res.json({ deposits: data });
});

// PATCH /api/deposits/admin/:id — approve or reject
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  const { action, note } = req.body; // action: 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
  }

  const { data: deposit } = await supabase
    .from('deposits').select('*').eq('id', req.params.id).single();
  if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
  if (deposit.status !== 'pending') return res.status(400).json({ error: 'Deposit already actioned' });

  const updates = { status: action === 'approve' ? 'approved' : 'rejected', admin_note: note || null };

  if (action === 'approve') {
    // Credit user balance
    const { data: user } = await supabase.from('users').select('balance').eq('id', deposit.user_id).single();
    const newBal = Number(user.balance) + Number(deposit.amount);
    await supabase.from('users').update({ balance: newBal }).eq('id', deposit.user_id);
  }

  await supabase.from('deposits').update(updates).eq('id', deposit.id);

  supabase.from('activity_logs').insert({
    user_id: req.user.id,
    action:  `deposit_${action}`,
    meta:    { deposit_id: deposit.id, amount: deposit.amount },
  }).then(null, () => {});

  res.json({ message: `Deposit ${action}d successfully` });
});

module.exports = router;
