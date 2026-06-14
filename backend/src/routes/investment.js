const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// GET /api/investments/plans — public list of active plans
router.get('/plans', async (_req, res) => {
  const { data, error } = await supabase
    .from('investment_plans')
    .select('*')
    .eq('active', true)
    .order('min_amount', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch plans' });
  res.json({ plans: data });
});

// POST /api/investments — purchase a plan
router.post('/', requireAuth, async (req, res) => {
  const { planId, amount } = req.body;
  if (!planId || !amount) return res.status(400).json({ error: 'planId and amount are required' });

  const { data: plan } = await supabase
    .from('investment_plans').select('*').eq('id', planId).eq('active', true).single();
  if (!plan) return res.status(404).json({ error: 'Investment plan not found or inactive' });

  const amt = Number(amount);
  if (amt < plan.min_amount) return res.status(400).json({ error: `Minimum investment is $${plan.min_amount}` });
  if (plan.max_amount && amt > plan.max_amount) return res.status(400).json({ error: `Maximum investment is $${plan.max_amount}` });

  const { data: user } = await supabase.from('users').select('balance').eq('id', req.user.id).single();
  if (Number(user.balance) < amt) return res.status(400).json({ error: 'Insufficient balance' });

  const maturesAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000);

  // Deduct balance
  await supabase.from('users').update({ balance: Number(user.balance) - amt }).eq('id', req.user.id);

  const { data: inv, error } = await supabase.from('investments').insert({
    user_id:    req.user.id,
    plan_id:    planId,
    amount:     amt,
    roi_rate:   plan.roi_rate,
    roi_period: plan.roi_period,
    status:     'active',
    matures_at: maturesAt.toISOString(),
  }).select().single();

  if (error) {
    await supabase.from('users').update({ balance: Number(user.balance) }).eq('id', req.user.id);
    return res.status(500).json({ error: 'Failed to activate investment' });
  }

  res.status(201).json({ message: `Investment activated! Earning ${plan.roi_rate}% ${plan.roi_period}.`, investment: inv });
});

// GET /api/investments/mine
router.get('/mine', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('investments')
    .select('*, investment_plans(name)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch investments' });
  res.json({ investments: data });
});

// GET /api/investments/profit-history
router.get('/profit-history', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profit_history')
    .select('*, investments(investment_plans(name))')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: 'Failed to fetch profit history' });
  res.json({ history: data });
});

// GET /api/investments/plans/admin — all plans including inactive (admin only)
router.get('/plans/admin', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('investment_plans')
    .select('*')
    .order('min_amount', { ascending: true });
  if (error) return res.status(500).json({ error: 'Failed to fetch plans' });
  res.json({ plans: data });
});

// ── Admin: manage plans ───────────────────────────────────────────────────────
router.post('/plans', requireAuth, requireAdmin, async (req, res) => {
  const { name, minAmount, maxAmount, roiRate, roiPeriod, durationDays } = req.body;
  const { data, error } = await supabase.from('investment_plans').insert({
    name, min_amount: minAmount, max_amount: maxAmount,
    roi_rate: roiRate, roi_period: roiPeriod, duration_days: durationDays, active: true,
  }).select().single();
  if (error) return res.status(500).json({ error: 'Failed to create plan' });
  res.status(201).json({ plan: data });
});

router.patch('/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, minAmount, maxAmount, roiRate, roiPeriod, durationDays, active } = req.body;
  const { error } = await supabase.from('investment_plans').update({
    name, min_amount: minAmount, max_amount: maxAmount,
    roi_rate: roiRate, roi_period: roiPeriod, duration_days: durationDays, active,
  }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to update plan' });
  res.json({ message: 'Plan updated' });
});

module.exports = router;
