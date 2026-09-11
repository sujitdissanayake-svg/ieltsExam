const nodemailer = require('nodemailer');
const { readJsonBody, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const { requireRole } = require('../_auth');

const OFFICIAL_EMAIL = 'info@ieltscambridge.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    requireRole(req, ['admin']);
  } catch (err) {
    sendJson(res, err && err.message === 'Forbidden.' ? 403 : 401, {
      error: err && err.message ? err.message : 'Unauthorized.',
    });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'admin-send-email',
    limit: 15,
    windowMs: 10 * 60 * 1000,
    message: 'Too many email sends. Please wait before sending again.',
  })) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 128 * 1024 });
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const recipientsRaw = Array.isArray(body && body.recipients) ? body.recipients : [];
  const subject = String(body && body.subject || '').trim();
  const message = String(body && body.message || '').trim();

  const recipients = [];
  recipientsRaw.forEach(function (entry) {
    const email = String(entry || '').trim().toLowerCase();
    if (!email || !isValidEmailBasic(email)) return;
    if (recipients.indexOf(email) >= 0) return;
    recipients.push(email);
  });

  if (!recipients.length) {
    sendJson(res, 400, { error: 'Please provide at least one valid recipient email.' });
    return;
  }

  if (recipients.length > 300) {
    sendJson(res, 400, { error: 'Too many recipients. Please send to 300 or fewer at a time.' });
    return;
  }

  if (!subject) {
    sendJson(res, 400, { error: 'Email subject is required.' });
    return;
  }

  if (!message) {
    sendJson(res, 400, { error: 'Email message is required.' });
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

  const from = String(process.env.SENDER_EMAIL || OFFICIAL_EMAIL).trim() || OFFICIAL_EMAIL;
  const senderName = String(process.env.SENDER_NAME || 'IELTS Cambridge').trim() || 'IELTS Cambridge';
  const formattedFrom = formatMailboxWithName(from, senderName);
  const replyTo = String(process.env.REPLY_TO_EMAIL || OFFICIAL_EMAIL).trim() || OFFICIAL_EMAIL;

  const html = buildEmailHtml(message);

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
      to: OFFICIAL_EMAIL,
      bcc: recipients.join(', '),
      subject: subject,
      text: message,
      html: html,
      replyTo: replyTo,
    });
  } catch (err) {
    sendJson(res, 502, {
      error: 'Failed to send email. Please verify SMTP settings.',
      code: err && err.code ? String(err.code) : undefined,
      message: err && err.message ? String(err.message) : String(err),
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    sentCount: recipients.length,
    from: from,
    via: OFFICIAL_EMAIL,
  });
};

function formatMailboxWithName(email, displayName) {
  const mailbox = String(email || '').trim();
  const name = String(displayName || '').trim();
  if (!name) return mailbox;
  return '"' + name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" <' + mailbox + '>';
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(text) {
  const lines = String(text || '').split(/\r?\n/);
  const formatted = lines.map(function (line) {
    return escapeHtml(line);
  }).join('<br />');

  return '<!doctype html>' +
    '<html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">' +
    '<div style="max-width:640px;margin:0 auto;padding:24px;">' +
    '<p style="margin:0 0 10px;">Hello,</p>' +
    '<p style="margin:0 0 16px;">' + formatted + '</p>' +
    '<p style="margin:18px 0 0;color:#475569;font-size:13px;">Sent by IELTS Cambridge admin portal.</p>' +
    '</div></body></html>';
}
