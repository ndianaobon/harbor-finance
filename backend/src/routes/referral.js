const express  = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/referrals — user's referral stats & list
router.get('/', requireAuth, async (req, res) => {
  const { data: directReferrals } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, created_at, status')
    .eq('referred_by', req.user.id)
    .order('created_at', { ascending: false });

  const { data: earnings } = await supabase
    .from('referral_earnings')
    .select('amount, level, created_at')
    .eq('beneficiary_id', req.user.id)
    .order('created_at', { ascending: false });

  const totalEarnings = (earnings || []).reduce((s, e) => s + Number(e.amount), 0);

  res.json({
    referralCode:    req.user.referral_code,
    referralUrl:     `${process.env.FRONTEND_URL}/auth.html?ref=${req.user.referral_code}`,
    directReferrals: directReferrals || [],
    earnings:        earnings || [],
    totalEarnings,
    level1Count:     (directReferrals || []).length,
  });
});

module.exports = router;
