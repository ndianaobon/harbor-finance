const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { sendVerificationEmail } = require('../lib/mailer');

const router = express.Router();

// GET /api/notifications — user's notifications
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: 'Failed to fetch notifications' });
  res.json({ notifications: data });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req, res) => {
  await supabase.from('notifications').update({ read: true })
    .eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ message: 'Marked as read' });
});

// POST /api/notifications/admin/broadcast — admin email blast
router.post('/admin/broadcast', requireAuth, requireAdmin, async (req, res) => {
  const { subject, message, recipientGroup = 'all' } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  let query = supabase.from('users').select('id, email, first_name').eq('status', 'active');
  if (recipientGroup === 'verified') query = query.eq('kyc_status', 'verified');
  if (recipientGroup === 'investors') query = query.not('balance', 'eq', 0);

  const { data: users, error } = await query;
  if (error) return res.status(500).json({ error: 'Failed to fetch recipients' });

  // Log the broadcast
  supabase.from('activity_logs').insert({
    user_id: req.user.id,
    action:  'email_broadcast',
    meta:    { subject, recipient_count: users.length, group: recipientGroup },
  }).then(null, () => {});

  // In production: queue these via a job system (Bull, etc.)
  // For now: return recipient count and note to wire up async sending
  res.json({
    message:        `Broadcast queued for ${users.length} users`,
    recipientCount: users.length,
    note:           'Wire up an async job queue (e.g. BullMQ) to send at scale',
  });
});

module.exports = router;
