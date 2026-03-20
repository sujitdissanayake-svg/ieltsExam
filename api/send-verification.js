const crypto = require('crypto');
const { sha256Hex, signToken, readJsonBody } = require('./_shared');
const nodemailer = require('nodemailer');

const isValidEmail = (email) => {
  const value = String(email || '').trim();
  if (!value) return false;
  // Intentionally simple: just prevent obvious garbage.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err && err.message ? err.message : 'Invalid request.' }));
    return;
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();

  if (!isValidEmail(email)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Please enter a valid email address.' }));
    return;
  }

  const tokenSecret = process.env.VERIFICATION_TOKEN_SECRET;
  if (!tokenSecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server not configured (missing VERIFICATION_TOKEN_SECRET).' }));
    return;
  }

  const smtpUser = String(process.env.ZOHO_SMTP_USER || '').trim();
  const smtpPass = String(process.env.ZOHO_SMTP_PASS || '').trim();
  const smtpHost = String(process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.com').trim();
  const smtpPort = Number.parseInt(String(process.env.ZOHO_SMTP_PORT || '465'), 10);
  const smtpSecure = String(process.env.ZOHO_SMTP_SECURE || '').trim();

  if (!smtpUser || !smtpPass) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Email service not configured (missing ZOHO_SMTP_USER / ZOHO_SMTP_PASS).',
      })
    );
    return;
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresInSeconds = 10 * 60;
  const now = Math.floor(Date.now() / 1000);

  const codeHash = sha256Hex(`${code}:${tokenSecret}`);
  const token = signToken(
    {
      email,
      codeHash,
      iat: now,
      exp: now + expiresInSeconds,
    },
    tokenSecret
  );

  const defaultFrom = smtpUser || 'info@ieltscambridge.com';
  const from = String(process.env.SENDER_EMAIL || defaultFrom).trim() || defaultFrom;
  const replyTo = String(process.env.REPLY_TO_EMAIL || from).trim() || from;

  const subject = 'Your registration verification code';
  const textLines = [
    name ? `Hello ${name},` : 'Hello,',
    '',
    'Use this 6-digit code to verify your email address and complete registration:',
    '',
    code,
    '',
    `This code expires in ${Math.round(expiresInSeconds / 60)} minutes.`,
    '',
    'If you did not request this, you can ignore this email.',
  ];

  const html = `<!doctype html>
  <html>
    <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Your registration verification code</h2>
        <p style="margin:0 0 14px;">${name ? `Hello ${escapeHtml(name)},` : 'Hello,'}</p>
        <p style="margin:0 0 14px;">Use this 6-digit code to verify your email address and complete registration:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;display:inline-block;">${code}</div>
        <p style="margin:14px 0 0;color:#475569;">This code expires in ${Math.round(expiresInSeconds / 60)} minutes.</p>
        <p style="margin:10px 0 0;color:#475569;">If you did not request this, you can ignore this email.</p>
      </div>
    </body>
  </html>`;

  try {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 465,
      secure:
        smtpSecure === 'true'
          ? true
          : smtpSecure === 'false'
            ? false
            : (Number.isFinite(smtpPort) ? smtpPort : 465) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transport.sendMail({
      from,
      to: email,
      subject,
      text: textLines.join('\n'),
      html,
      replyTo,
    });
  } catch (err) {
    const hint = classifyEmailSendError(err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Failed to send email.',
        hint,
        code: err && err.code ? String(err.code) : undefined,
        message: err && err.message ? String(err.message) : String(err),
      })
    );
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ token, expiresInSeconds }));
};

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classifyEmailSendError(err) {
  const code = err && err.code ? String(err.code) : '';
  const message = err && err.message ? String(err.message) : '';
  const lower = message.toLowerCase();

  if (code === 'EAUTH' || lower.includes('auth') || lower.includes('login')) {
    return 'SMTP authentication failed. Check ZOHO_SMTP_USER and ZOHO_SMTP_PASS (and that the account allows SMTP/app passwords).';
  }

  if (
    code === 'EENVELOPE' ||
    lower.includes('sender address rejected') ||
    lower.includes('from address') ||
    lower.includes('mail from')
  ) {
    return 'Sender address rejected. Ensure SENDER_EMAIL matches the authenticated mailbox/domain (or omit SENDER_EMAIL to default to ZOHO_SMTP_USER).';
  }

  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || lower.includes('timeout') || lower.includes('connect')) {
    return 'SMTP connection failed. Check ZOHO_SMTP_HOST/PORT/SECURE and whether outbound SMTP is reachable from Vercel.';
  }

  if (lower.includes('self signed certificate') || lower.includes('certificate') || lower.includes('tls')) {
    return 'TLS negotiation failed. Verify ZOHO_SMTP_SECURE/PORT and the SMTP host.';
  }

  return 'Email delivery failed. Please verify the SMTP environment variables in Vercel (ZOHO_SMTP_USER, ZOHO_SMTP_PASS, ZOHO_SMTP_HOST, ZOHO_SMTP_PORT).';
}
