const express  = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const supabase = require('../lib/supabase');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

// POST /api/support/messages — user sends a message
router.post('/messages', requireAuth, async (req, res) => {
  const { message, fileUrl, fileName } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const insertData = {
    user_id: req.user.id,
    sender: 'user',
    message: message.trim(),
  };
  if (fileUrl) insertData.file_url = fileUrl;
  if (fileName) insertData.file_name = fileName;

  const { data, error } = await supabase.from('support_messages').insert(insertData).select().single();
  if (error) return res.status(500).json({ error: 'Failed to send message' });

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    sendMail({
      to: adminEmail,
      subject: 'New support message from ' + (req.user.first_name || req.user.email),
      html: '<div style="font-family:Arial;padding:16px;background:#161b22;color:#e6edf3;border-radius:8px"><h3 style="color:#2ea043;margin:0 0 8px">New Support Message</h3><p><strong>' + (req.user.first_name || '') + ' ' + (req.user.last_name || '') + '</strong> (' + req.user.email + ')</p><div style="background:#0d1117;padding:12px;border-radius:6px;margin:8px 0">' + message.trim() + '</div></div>',
      text: 'New support message from ' + req.user.email + ': ' + message.trim(),
    }).catch(() => {});
  }

  res.status(201).json({ message: data });
});

// GET /api/support/messages — user gets their chat history
router.get('/messages', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch messages' });

  await supabase
    .from('support_messages')
    .update({ read: true })
    .eq('user_id', req.user.id)
    .eq('sender', 'admin')
    .eq('read', false);

  res.json({ messages: data });
});

// GET /api/support/unread — user checks unread count
router.get('/unread', requireAuth, async (req, res) => {
  const { count } = await supabase
    .from('support_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('sender', 'admin')
    .eq('read', false);
  res.json({ unread: count || 0 });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

// GET /api/support/admin/conversations — all users with messages
router.get('/admin/conversations', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase.rpc('get_support_conversations').catch(() => ({ data: null, error: true }));

  if (error || !data) {
    const { data: msgs } = await supabase
      .from('support_messages')
      .select('user_id, message, sender, read, created_at, users(first_name, last_name, email)')
      .order('created_at', { ascending: false });

    const convos = {};
    (msgs || []).forEach(m => {
      if (!convos[m.user_id]) {
        convos[m.user_id] = {
          user_id: m.user_id,
          user: m.users,
          last_message: m.message,
          last_sender: m.sender,
          last_at: m.created_at,
          unread: 0,
        };
      }
      if (m.sender === 'user' && !m.read) convos[m.user_id].unread++;
    });
    return res.json({ conversations: Object.values(convos) });
  }
  res.json({ conversations: data });
});

// GET /api/support/admin/messages/:userId — get chat with a user
router.get('/admin/messages/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch messages' });

  await supabase
    .from('support_messages')
    .update({ read: true })
    .eq('user_id', req.params.userId)
    .eq('sender', 'user')
    .eq('read', false);

  res.json({ messages: data });
});

// POST /api/support/admin/messages/:userId — admin replies
router.post('/admin/messages/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  const { data, error } = await supabase.from('support_messages').insert({
    user_id: req.params.userId,
    sender: 'admin',
    message: message.trim(),
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to send message' });
  res.status(201).json({ message: data });
});

module.exports = router;
