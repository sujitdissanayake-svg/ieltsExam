const nodemailer = require('nodemailer');
const { readJsonBody } = require('./_shared');
const { sendJson } = require('./_http');

const isValidEmail = (email) => {
  const value = String(email || '').trim();
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const escapeHtml = (input) => {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatMailboxWithName = (email, displayName) => {
  const mailbox = String(email || '').trim();
  const name = String(displayName || '').trim();
  if (!name) return mailbox;
  return '"' + name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" <' + mailbox + '>';
};

const classifyEmailSendError = (err) => {
  const code = err && err.code ? String(err.code) : '';
  const message = err && err.message ? String(err.message) : '';
  const lower = message.toLowerCase();

  if (code === 'EAUTH' || lower.includes('auth') || lower.includes('login')) {
    return 'SMTP authentication failed.';
  }

  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || lower.includes('timeout') || lower.includes('connect')) {
    return 'SMTP connection failed.';
  }

  if (lower.includes('tls') || lower.includes('certificate')) {
    return 'SMTP TLS configuration failed.';
  }

  return 'Email delivery failed.';
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const name = String((body && body.name) || '').trim();
  const email = String((body && body.email) || '').trim();
  const institute = String((body && body.institute) || '').trim();
  const message = String((body && body.message) || '').trim();

  if (!name) {
    sendJson(res, 400, { error: 'Lecturer name is required.' });
    return;
  }

  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: 'Please enter a valid email address.' });
    return;
  }

  const smtpUser = String(process.env.ZOHO_SMTP_USER || '').trim();
  const smtpPass = String(process.env.ZOHO_SMTP_PASS || '').trim();
  const smtpHost = String(process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.com').trim();
  const smtpPort = Number.parseInt(String(process.env.ZOHO_SMTP_PORT || '465'), 10);
  const smtpSecure = String(process.env.ZOHO_SMTP_SECURE || '').trim();

  if (!smtpUser || !smtpPass) {
    sendJson(res, 500, {
      error: 'Email service not configured (missing ZOHO_SMTP_USER / ZOHO_SMTP_PASS).',
    });
    return;
  }

  const defaultFrom = smtpUser || 'info@ieltscambridge.com';
  const from = String(process.env.SENDER_EMAIL || defaultFrom).trim() || defaultFrom;
  const senderName = String(process.env.SENDER_NAME || 'IELTS Cambridge').trim() || 'IELTS Cambridge';
  const formattedFrom = formatMailboxWithName(from, senderName);
  const replyTo = String(process.env.REPLY_TO_EMAIL || email).trim() || email;
  const recipient = String(process.env.LECTURER_REGISTRATION_TO || 'info@ieltscambridge.com').trim() || 'info@ieltscambridge.com';

  const submittedAt = new Date().toISOString();
  const subject = `Lecturer Registration Request - ${name}`;
  const textBody = [
    'New lecturer registration request received.',
    '',
    `Submitted at (UTC): ${submittedAt}`,
    `Lecturer name: ${name}`,
    `Email: ${email}`,
    `Institute / Class: ${institute || '-'}`,
    `Message: ${message || '-'}`,
  ].join('\n');

  const htmlBody = `<!doctype html>
  <html>
    <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">New lecturer registration request</h2>
        <p style="margin:0 0 8px;"><strong>Submitted at (UTC):</strong> ${escapeHtml(submittedAt)}</p>
        <p style="margin:0 0 8px;"><strong>Lecturer name:</strong> ${escapeHtml(name)}</p>
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p style="margin:0 0 8px;"><strong>Institute / Class:</strong> ${escapeHtml(institute || '-')}</p>
        <p style="margin:0 0 8px;"><strong>Message:</strong></p>
        <div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;white-space:pre-wrap;">${escapeHtml(message || '-')}</div>
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
      from: formattedFrom,
      to: recipient,
      subject,
      text: textBody,
      html: htmlBody,
      replyTo,
    });
  } catch (err) {
    sendJson(res, 502, {
      error: 'Failed to send registration email.',
      hint: classifyEmailSendError(err),
      code: err && err.code ? String(err.code) : undefined,
    });
    return;
  }

  sendJson(res, 200, { ok: true });
};
