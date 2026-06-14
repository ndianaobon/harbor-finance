const express  = require('express');
const bcrypt   = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  const [
    { count: totalUsers },
    { count: pendingDeposits },
    { count: pendingWithdrawals },
    { count: pendingKyc },
    { data: balanceData },
    { data: investData },
    { data: profitData },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('kyc_submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('balance'),
    supabase.from('investments').select('amount').eq('status', 'active'),
    supabase.from('profit_history').select('amount'),
  ]);

  const totalBalance    = (balanceData || []).reduce((s, u) => s + Number(u.balance), 0);
  const activeInvested  = (investData  || []).reduce((s, i) => s + Number(i.amount), 0);
  const totalPayouts    = (profitData  || []).reduce((s, p) => s + Number(p.amount), 0);

  res.json({ totalUsers, pendingDeposits, pendingWithdrawals, pendingKyc, totalBalance, activeInvested, totalPayouts });
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const from = (Number(page) - 1) * Number(limit);
  const to   = from + Number(limit) - 1;

  let query = supabase
    .from('users')
    .select('id, email, first_name, last_name, country, balance, role, status, kyc_status, email_verified, referral_code, referred_by, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch users' });
  res.json({ users: data, total: count });
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, country, phone, balance, role, status, kyc_status, email_verified, referral_code, referred_by, created_at, tfa_enabled')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json({ user: data });
});

// PATCH /api/admin/users/:id — update status, role, balance
router.patch('/users/:id', async (req, res) => {
  const { status, role, balance, note } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (role)   updates.role   = role;
  if (balance !== undefined) updates.balance = Number(balance);

  const { error } = await supabase.from('users').update(updates).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to update user' });

  supabase.from('activity_logs').insert({
    user_id: req.user.id,
    action: 'admin_user_update',
    meta: { target_user: req.params.id, updates, note },
  }).then(null, () => {});

  res.json({ message: 'User updated successfully' });
});

// GET /api/admin/logs
router.get('/logs', async (req, res) => {
  const { limit = 100 } = req.query;
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, users(first_name, last_name, email, role)')
    .order('created_at', { ascending: false })
    .limit(Number(limit));
  if (error) return res.status(500).json({ error: 'Failed to fetch logs' });
  res.json({ logs: data });
});

module.exports = router;
