const express  = require('express');
const bcrypt   = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/user/dashboard — overview stats
router.get('/dashboard', requireAuth, async (req, res) => {
  const uid = req.user.id;

  const [
    { data: user },
    { data: investments },
    { data: deposits },
    { data: withdrawals },
    { data: referrals },
    { data: profits },
  ] = await Promise.all([
    supabase.from('users').select('balance, referral_code, kyc_status').eq('id', uid).single(),
    supabase.from('investments').select('amount, status').eq('user_id', uid),
    supabase.from('deposits').select('amount, status').eq('user_id', uid),
    supabase.from('withdrawals').select('amount, status').eq('user_id', uid),
    supabase.from('users').select('id').eq('referred_by', uid),
    supabase.from('profit_history').select('amount').eq('user_id', uid),
  ]);

  const activeInvestments = (investments || []).filter(i => i.status === 'active');
  const totalInvested     = activeInvestments.reduce((s, i) => s + Number(i.amount), 0);
  const totalProfit       = (profits || []).reduce((s, p) => s + Number(p.amount), 0);

  res.json({
    balance:         Number(user?.balance || 0),
    totalInvested,
    totalProfit,
    referralCount:   (referrals || []).length,
    kycStatus:       user?.kyc_status || 'unverified',
    referralCode:    user?.referral_code,
  });
});

// PATCH /api/user/profile — update personal info
router.patch('/profile', requireAuth, async (req, res) => {
  const { firstName, lastName, phone, country } = req.body;
  const { error } = await supabase
    .from('users')
    .update({
      first_name: firstName,
      last_name:  lastName,
      phone:      phone || null,
      country:    country || null,
    })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: 'Failed to update profile' });
  res.json({ message: 'Profile updated successfully' });
});

// PATCH /api/user/password — change password
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const { data: user } = await supabase
    .from('users').select('password_hash').eq('id', req.user.id).single();

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 12);
  await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);

  res.json({ message: 'Password changed successfully' });
});

// GET /api/user/activity — recent activity log
router.get('/activity', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: 'Failed to fetch activity' });
  res.json({ logs: data });
});

module.exports = router;
