const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');
const { z }    = require('zod');

const supabase = require('../lib/supabase');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/mailer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  firstName:    z.string().min(1).max(60),
  lastName:     z.string().min(1).max(60),
  username:     z.string().min(3).max(30).regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'),
  email:        z.string().email(),
  password:     z.string().min(8).max(100),
  phone:        z.string().min(7, 'Phone number is required').max(20),
  country:      z.string().min(1, 'Country is required').max(60),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
  }

  const { firstName, lastName, username, email, password, phone, country, referralCode } = parsed.data;
  const emailLower = email.toLowerCase().trim();
  const usernameLower = username.toLowerCase().trim();

  // Check existing email
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', emailLower)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  // Check existing username
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('username', usernameLower)
    .maybeSingle();

  if (existingUser) {
    return res.status(409).json({ error: 'This username is already taken' });
  }

  // Resolve referrer
  let referredBy = null;
  if (referralCode) {
    const { data: referrer } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', referralCode.toUpperCase())
      .maybeSingle();
    if (referrer) referredBy = referrer.id;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate unique referral code for this new user
  const myReferralCode = 'HBR-' + uuidv4().slice(0, 8).toUpperCase();

  // Create user
  const { data: user, error: insertErr } = await supabase
    .from('users')
    .insert({
      first_name:    firstName,
      last_name:     lastName,
      username:      usernameLower,
      email:         emailLower,
      password_hash: passwordHash,
      phone:         phone || null,
      country:       country || null,
      referred_by:   referredBy,
      referral_code: myReferralCode,
      status:        'active',
      role:          'user',
      email_verified: false,
      kyc_status:    'unverified',
      balance:       0,
      signal_strength: 0,
      account_status_text: 'Account Active',
    })
    .select('id, email, first_name')
    .single();

  if (insertErr) {
    console.error('[REGISTER]', insertErr);
    if (insertErr.code === '23505' && insertErr.message?.includes('username')) {
      return res.status(409).json({ error: 'This username is already taken' });
    }
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }

  // Credit $15 referral bonus to the referrer
  if (referredBy) {
    const REFERRAL_BONUS = 15;
    const { data: referrer } = await supabase
      .from('users').select('balance').eq('id', referredBy).single();
    if (referrer) {
      await supabase.from('users').update({
        balance: Number(referrer.balance) + REFERRAL_BONUS,
      }).eq('id', referredBy);

      await supabase.from('referral_earnings').insert({
        beneficiary_id: referredBy,
        referral_id:    user.id,
        amount:         REFERRAL_BONUS,
        level:          1,
      });

      await supabase.from('notifications').insert({
        user_id: referredBy,
        title:   'Referral Bonus!',
        body:    `You earned $${REFERRAL_BONUS} because ${firstName} joined using your referral link!`,
        type:    'success',
      });
    }
  }

  // Generate & store OTP
  const otp     = generateOTP();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await supabase.from('email_otp').insert({
    user_id:    user.id,
    email:      emailLower,
    code:       otp,
    type:       'email_verify',
    expires_at: expires.toISOString(),
    used:       false,
  });

  // Send verification email
  let emailSent = true;
  try {
    await sendVerificationEmail(emailLower, otp, firstName);
  } catch (mailErr) {
    emailSent = false;
    console.error('[MAILER] Failed to send verification email:', mailErr.message);
  }

  res.status(201).json({
    message: emailSent
      ? 'Account created. Check your email for a 6-digit verification code.'
      : 'Account created but we could not send the verification email. Please use "Resend Code" on the verification page.',
    userId:    user.id,
    email:     emailLower,
    emailSent,
  });
});

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: 'userId and code are required' });

  // Find valid OTP
  const { data: otp, error } = await supabase
    .from('email_otp')
    .select('*')
    .eq('user_id', userId)
    .eq('code', String(code).trim())
    .eq('type', 'email_verify')
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !otp) {
    return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
  }

  // Mark OTP used + verify user
  await Promise.all([
    supabase.from('email_otp').update({ used: true }).eq('id', otp.id),
    supabase.from('users').update({ email_verified: true }).eq('id', userId),
  ]);

  const token = signToken(userId);
  res.json({ message: 'Email verified successfully', token });
});

// ── POST /api/auth/resend-otp ─────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  const { userId, type = 'email_verify' } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name')
    .eq('id', userId)
    .single();

  if (!user) return res.status(404).json({ error: 'User not found' });

  // Invalidate old OTPs
  await supabase
    .from('email_otp')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('type', type);

  const otp     = generateOTP();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await supabase.from('email_otp').insert({
    user_id:    userId,
    email:      user.email,
    code:       otp,
    type,
    expires_at: expires.toISOString(),
    used:       false,
  });

  try {
    await sendVerificationEmail(user.email, otp, user.first_name);
  } catch (mailErr) {
    console.error('[MAILER] Resend OTP failed:', mailErr.message);
    return res.status(500).json({ error: 'Failed to send email. Please check your email address or try again later.' });
  }

  res.json({ message: 'A new verification code has been sent to your email.' });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password format' });

  const { email, password } = parsed.data;

  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, password_hash, status, email_verified, tfa_enabled, tfa_secret, role')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (!user) {
    // Timing-safe: still hash before returning
    await bcrypt.hash(password, 12);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.password_hash) {
    return res.status(401).json({ error: 'This account uses Google sign-in. Please use the "Continue with Google" button.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'banned')    return res.status(403).json({ error: 'Account banned' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });

  // Email not verified — resend OTP and ask them to verify
  if (!user.email_verified) {
    const otp     = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await supabase.from('email_otp').insert({
      user_id: user.id, email: user.email, code: otp,
      type: 'email_verify', expires_at: expires.toISOString(), used: false,
    });
    await sendVerificationEmail(user.email, otp, user.first_name).catch(() => {});
    return res.status(403).json({
      error:           'email_not_verified',
      message:         'Please verify your email. A new code has been sent.',
      userId:          user.id,
      requiresVerify:  true,
    });
  }

  // 2FA enabled — send challenge instead of token
  if (user.tfa_enabled) {
    return res.json({
      requires2FA: true,
      userId:      user.id,
      message:     'Enter your 2FA code to continue.',
    });
  }

  // Log the login
  supabase.from('activity_logs').insert({
    user_id: user.id,
    action:  'login',
    ip:      req.ip,
    meta:    { user_agent: req.headers['user-agent'] },
  }).then(null, () => {});

  const token = signToken(user.id);
  res.json({
    token,
    user: {
      id:         user.id,
      email:      user.email,
      firstName:  user.first_name,
      lastName:   user.last_name,
      role:       user.role,
    },
  });
});

// ── POST /api/auth/verify-2fa ─────────────────────────────────────────────────
router.post('/verify-2fa', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: 'userId and code are required' });

  const { data: user } = await supabase
    .from('users')
    .select('id, tfa_secret, tfa_method, email, first_name')
    .eq('id', userId)
    .single();

  if (!user) return res.status(404).json({ error: 'User not found' });

  let valid = false;

  if (user.tfa_method === 'app') {
    // TOTP verify via speakeasy
    valid = speakeasy.totp.verify({
      secret:   user.tfa_secret,
      encoding: 'base32',
      token:    String(code).trim(),
      window:   1,
    });
  } else {
    // SMS/email OTP
    const { data: otp } = await supabase
      .from('email_otp')
      .select('*')
      .eq('user_id', userId)
      .eq('code', String(code).trim())
      .eq('type', '2fa')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otp) {
      valid = true;
      await supabase.from('email_otp').update({ used: true }).eq('id', otp.id);
    }
  }

  if (!valid) return res.status(400).json({ error: 'Invalid 2FA code' });

  const token = signToken(userId);
  res.json({ token, message: '2FA verified' });
});

// ── POST /api/auth/setup-2fa ──────────────────────────────────────────────────
router.post('/setup-2fa', requireAuth, async (req, res) => {
  const { method = 'app' } = req.body;

  if (method === 'app') {
    const secret = speakeasy.generateSecret({ name: `Harbor Finance (${req.user.email})`, length: 20 });
    // Temporarily store secret until confirmed
    await supabase.from('users').update({ tfa_secret_pending: secret.base32 }).eq('id', req.user.id);
    return res.json({
      secret:     secret.base32,
      otpauthUrl: secret.otpauth_url,
    });
  }

  // SMS method — send OTP to phone (stub: same email flow)
  res.json({ message: 'SMS 2FA: wire up Twilio in production' });
});

// ── POST /api/auth/confirm-2fa ────────────────────────────────────────────────
router.post('/confirm-2fa', requireAuth, async (req, res) => {
  const { code } = req.body;
  const { data: user } = await supabase
    .from('users')
    .select('tfa_secret_pending')
    .eq('id', req.user.id)
    .single();

  if (!user?.tfa_secret_pending) return res.status(400).json({ error: 'No pending 2FA setup found' });

  const valid = speakeasy.totp.verify({
    secret:   user.tfa_secret_pending,
    encoding: 'base32',
    token:    String(code).trim(),
    window:   1,
  });

  if (!valid) return res.status(400).json({ error: 'Invalid code. Try again.' });

  await supabase.from('users').update({
    tfa_enabled:        true,
    tfa_method:         'app',
    tfa_secret:         user.tfa_secret_pending,
    tfa_secret_pending: null,
  }).eq('id', req.user.id);

  res.json({ message: '2FA enabled successfully' });
});

// ── POST /api/auth/disable-2fa ────────────────────────────────────────────────
router.post('/disable-2fa', requireAuth, async (req, res) => {
  await supabase.from('users').update({
    tfa_enabled: false,
    tfa_secret:  null,
    tfa_method:  null,
  }).eq('id', req.user.id);

  res.json({ message: '2FA disabled' });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const { data: user } = await supabase
    .from('users')
    .select('id, first_name')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  // Always return same response for security (don't reveal if email exists)
  if (!user) {
    return res.json({ message: 'If an account exists, a reset link has been sent.' });
  }

  const resetToken = uuidv4();
  const expires    = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await supabase.from('password_resets').insert({
    user_id:    user.id,
    token:      resetToken,
    expires_at: expires.toISOString(),
    used:       false,
  });

  const resetUrl = `${process.env.FRONTEND_URL}/auth.html?mode=reset&token=${resetToken}`;
  await sendPasswordResetEmail(email, resetUrl, user.first_name).catch(console.error);

  res.json({ message: 'If an account exists, a reset link has been sent.' });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { data: reset } = await supabase
    .from('password_resets')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!reset) return res.status(400).json({ error: 'Invalid or expired reset link' });

  const passwordHash = await bcrypt.hash(password, 12);

  await Promise.all([
    supabase.from('users').update({ password_hash: passwordHash }).eq('id', reset.user_id),
    supabase.from('password_resets').update({ used: true }).eq('id', reset.id),
  ]);

  res.json({ message: 'Password updated successfully. You can now log in.' });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: user } = await supabase
    .from('users')
    .select('id, email, username, first_name, last_name, phone, country, role, status, email_verified, kyc_status, referral_code, referred_by, balance, tfa_enabled, created_at, signal_strength, account_status_text')
    .eq('id', req.user.id)
    .single();

  res.json({ user });
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req, res) => {
  const { firstName, lastName, phone, country } = req.body;
  const updates = {};
  if (firstName) updates.first_name = firstName.trim();
  if (lastName)  updates.last_name  = lastName.trim();
  if (phone)     updates.phone      = phone.trim();
  if (country)   updates.country    = country.trim();

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  const { error } = await supabase.from('users').update(updates).eq('id', req.user.id);
  if (error) return res.status(500).json({ error: 'Failed to update profile' });

  res.json({ message: 'Profile updated successfully' });
});

// ── POST /api/auth/oauth/complete ─────────────────────────────────────────────
// Frontend sends the Supabase access_token after Google/Apple OAuth succeeds.
// Backend verifies it, upserts user in custom users table, returns a custom JWT.
router.post('/oauth/complete', async (req, res) => {
  const { access_token, provider } = req.body;
  if (!access_token || !provider) {
    return res.status(400).json({ error: 'access_token and provider are required' });
  }
  if (provider !== 'google') {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  // Verify the Supabase access token and get the OAuth user
  const { data: { user: oauthUser }, error: authErr } = await supabase.auth.getUser(access_token);
  if (authErr || !oauthUser) {
    return res.status(401).json({ error: 'Invalid or expired OAuth token' });
  }

  const email = (oauthUser.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ error: 'No email returned from OAuth provider' });
  }

  const meta = oauthUser.user_metadata || {};
  let firstName = meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '';
  let lastName  = meta.full_name?.split(' ').slice(1).join(' ') || meta.name?.split(' ').slice(1).join(' ') || '';
  if (!firstName) firstName = email.split('@')[0];
  if (!lastName) lastName = '.';

  // Check if user already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role, status')
    .eq('email', email)
    .maybeSingle();

  let userId;

  if (existing) {
    if (existing.status === 'banned')    return res.status(403).json({ error: 'Account banned' });
    if (existing.status === 'suspended') return res.status(403).json({ error: 'Account suspended' });
    userId = existing.id;
  } else {
    const myReferralCode = 'HBR-' + uuidv4().slice(0, 8).toUpperCase();

    const { data: newUser, error: insertErr } = await supabase
      .from('users')
      .insert({
        first_name:     firstName,
        last_name:      lastName,
        email,
        password_hash:  null,
        phone:          null,
        referral_code:  myReferralCode,
        status:         'active',
        role:           'user',
        email_verified: true,
        kyc_status:     'unverified',
        balance:        0,
        auth_provider:  provider,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[OAUTH]', insertErr);
      return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
    userId = newUser.id;
  }

  // Log the login
  supabase.from('activity_logs').insert({
    user_id: userId,
    action:  `oauth_login_${provider}`,
    ip:      req.ip,
    meta:    { user_agent: req.headers['user-agent'], provider },
  }).then(null, () => {});

  const token = signToken(userId);

  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, role')
    .eq('id', userId)
    .single();

  res.json({
    token,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
      role:      user.role,
    },
    isNew: !existing,
  });
});

module.exports = router;
