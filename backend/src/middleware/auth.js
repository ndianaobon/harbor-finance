const jwt      = require('jsonwebtoken');
const supabase = require('../lib/supabase');

/**
 * Verify JWT and attach user to req.user
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Fetch fresh user from DB
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, status, email_verified, kyc_status, referral_code, balance, tfa_enabled, phone, country')
    .eq('id', payload.sub)
    .single();

  if (error || !user) return res.status(401).json({ error: 'User not found' });
  if (user.status === 'banned')    return res.status(403).json({ error: 'Account banned' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });

  req.user = user;
  next();
}

/**
 * Require admin role (super / admin / mod)
 */
function requireAdmin(req, res, next) {
  if (!req.user || !['super', 'admin', 'mod'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
