const nodemailer = require('nodemailer');

const RESEND_KEY = process.env.RESEND_API_KEY;
const USE_RESEND = !!RESEND_KEY;

// SMTP transporter (fallback for local dev when RESEND_API_KEY is not set)
let transporter = null;
if (!USE_RESEND) {
  const port = parseInt(process.env.EMAIL_PORT || '465');
  transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: (process.env.EMAIL_PASS || '').replace(/\s/g, ''),
    },
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });
  transporter.verify((err) => {
    if (err) console.warn('[MAILER] SMTP warning:', err.message);
    else     console.log('[MAILER] SMTP ready on port ' + port);
  });
} else {
  console.log('[MAILER] Using Resend API');
}

function getSenderAddress() {
  if (USE_RESEND) return process.env.EMAIL_FROM || 'Harbor Finance <onboarding@resend.dev>';
  const user = process.env.EMAIL_USER;
  const from = process.env.EMAIL_FROM || '';
  const nameMatch = from.match(/^([^<]+)</);
  const displayName = nameMatch ? nameMatch[1].trim() : 'Harbor Finance';
  return `${displayName} <${user}>`;
}

async function sendMail({ to, subject, html, text }) {
  if (USE_RESEND) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: getSenderAddress(), to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend API error: ${res.status}`);
    }
    return res.json();
  }
  return transporter.sendMail({ from: getSenderAddress(), to, subject, html, text });
}

async function sendVerificationEmail(to, code, firstName = '') {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#0d1117;font-family:'Inter',Arial,sans-serif;color:#e6edf3}
  .wrap{max-width:560px;margin:40px auto;background:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden}
  .head{background:#161b22;padding:32px 40px 24px;border-bottom:1px solid #21262d;text-align:center}
  .logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:8px}
  .logo-icon{width:40px;height:40px;background:#2ea043;border-radius:10px;display:flex;align-items:center;justify-content:center}
  .logo-text{font-size:18px;font-weight:700;color:#e6edf3}
  .body{padding:32px 40px}
  .greeting{font-size:16px;font-weight:600;margin-bottom:8px}
  .msg{font-size:14px;color:#8b949e;line-height:1.7;margin-bottom:28px}
  .code-box{background:#0d1117;border:2px solid #2ea043;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px}
  .code{font-size:40px;font-weight:800;letter-spacing:12px;color:#2ea043;font-family:monospace}
  .code-note{font-size:12px;color:#6e7681;margin-top:8px}
  .warn{background:rgba(227,179,65,.08);border:1px solid rgba(227,179,65,.25);border-radius:8px;padding:12px 16px;font-size:12px;color:#e3b341;margin-bottom:24px;line-height:1.6}
  .foot{padding:20px 40px;border-top:1px solid #21262d;font-size:11px;color:#6e7681;text-align:center;line-height:1.8}
  .foot a{color:#8b949e;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="logo">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M3 18l5-8 5 5 5-9 3 5"/></svg>
      </div>
      <span class="logo-text">Harbor Finance</span>
    </div>
  </div>
  <div class="body">
    <div class="greeting">Hi${firstName ? ' ' + firstName : ''}! 👋</div>
    <p class="msg">
      Thanks for creating your Harbor Finance account. To complete your registration,
      please enter the 6-digit verification code below on the verification page.
    </p>
    <div class="code-box">
      <div class="code">${code}</div>
      <div class="code-note">This code expires in <strong>10 minutes</strong></div>
    </div>
    <div class="warn">
      🔒 Never share this code with anyone. Harbor Finance staff will never ask for it.
      If you didn't create an account, you can safely ignore this email.
    </div>
    <p style="font-size:13px;color:#8b949e">
      If the code doesn't work, request a new one from the verification page.
    </p>
  </div>
  <div class="foot">
    © ${new Date().getFullYear()} Harbor Finance · All rights reserved<br>
    <a href="#">Privacy Policy</a> · <a href="#">Terms of Service</a> · <a href="#">Help Center</a>
  </div>
</div>
</body>
</html>`;

  return sendMail({
    to,
    subject: `${code} is your Harbor Finance verification code`,
    html,
    text: `Your Harbor Finance verification code is: ${code}\n\nThis code expires in 10 minutes.\nIf you didn't create an account, ignore this email.`,
  });
}

async function sendPasswordResetEmail(to, resetUrl, firstName = '') {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#0d1117;font-family:Arial,sans-serif;color:#e6edf3}
  .wrap{max-width:560px;margin:40px auto;background:#161b22;border:1px solid #30363d;border-radius:16px;overflow:hidden}
  .head{padding:32px 40px 24px;border-bottom:1px solid #21262d;text-align:center}
  .body{padding:32px 40px}
  .btn{display:inline-block;background:#2ea043;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;margin:20px 0}
  .foot{padding:20px 40px;border-top:1px solid #21262d;font-size:11px;color:#6e7681;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="head"><h2 style="margin:0;color:#e6edf3">Reset Your Password</h2></div>
  <div class="body">
    <p>Hi${firstName ? ' ' + firstName : ''},</p>
    <p style="color:#8b949e;line-height:1.7">We received a request to reset your Harbor Finance password. Click the button below to create a new password. This link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p style="font-size:12px;color:#6e7681">If you didn't request a reset, ignore this email — your password won't change.<br>Link: ${resetUrl}</p>
  </div>
  <div class="foot">© ${new Date().getFullYear()} Harbor Finance</div>
</div>
</body>
</html>`;

  return sendMail({
    to,
    subject: 'Reset your Harbor Finance password',
    html,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail };
