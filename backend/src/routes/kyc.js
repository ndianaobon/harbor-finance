const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');

const router = express.Router();

// POST /api/kyc/submit — user submits KYC documents (URLs from Supabase Storage)
router.post('/submit', requireAuth, async (req, res) => {
  const { documentType, frontUrl, backUrl, selfieUrl, poaUrl, dob, addressLine, city, state, country } = req.body;
  if (!documentType || !frontUrl) {
    return res.status(400).json({ error: 'Document type and front image are required' });
  }

  // Check existing submission
  const { data: existing } = await supabase
    .from('kyc_submissions')
    .select('id, status')
    .eq('user_id', req.user.id)
    .in('status', ['pending', 'approved'])
    .maybeSingle();

  if (existing?.status === 'approved') {
    return res.status(400).json({ error: 'KYC already approved for this account' });
  }
  if (existing?.status === 'pending') {
    return res.status(400).json({ error: 'A KYC submission is already under review' });
  }

  const insertData = {
    user_id:       req.user.id,
    document_type: documentType,
    front_url:     frontUrl,
    back_url:      backUrl || null,
    selfie_url:    selfieUrl || frontUrl,
    poa_url:       poaUrl || null,
    status:        'pending',
  };
  if (dob) insertData.dob = dob;
  if (addressLine) insertData.address_line = addressLine;
  if (city) insertData.city = city;
  if (state) insertData.state = state;
  if (country) insertData.country = country;

  const { data, error } = await supabase.from('kyc_submissions').insert(insertData).select().single();

  if (error) return res.status(500).json({ error: 'Failed to submit KYC' });

  // Update user kyc_status
  await supabase.from('users').update({ kyc_status: 'pending' }).eq('id', req.user.id);

  res.status(201).json({ message: 'KYC submitted for review. Approval takes 1–3 business days.', submission: data });
});

// GET /api/kyc/status
router.get('/status', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({ submission: data || null, kycStatus: req.user.kyc_status });
});

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('kyc_submissions')
    .select('*, users(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch KYC queue' });
  res.json({ submissions: data });
});

router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  const { action, rejectionReason } = req.body;
  if (!['approve', 'reject', 'resubmit'].includes(action)) {
    return res.status(400).json({ error: "Action must be 'approve', 'reject', or 'resubmit'" });
  }

  const { data: sub } = await supabase.from('kyc_submissions').select('*').eq('id', req.params.id).single();
  if (!sub) return res.status(404).json({ error: 'Submission not found' });

  const statusMap = { approve: 'approved', reject: 'rejected', resubmit: 'resubmit_requested' };
  const kycStatusMap = { approve: 'verified', reject: 'rejected', resubmit: 'unverified' };

  await Promise.all([
    supabase.from('kyc_submissions').update({
      status:           statusMap[action],
      rejection_reason: rejectionReason || null,
      reviewed_at:      new Date().toISOString(),
    }).eq('id', sub.id),
    supabase.from('users').update({ kyc_status: kycStatusMap[action] }).eq('id', sub.user_id),
  ]);

  res.json({ message: `KYC ${action}d successfully` });
});

module.exports = router;
