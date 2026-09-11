const nodemailer = require('nodemailer');
const { readJsonBody, sha256Hex, timingSafeEqualText } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const { issueToken, requireTokenSecret, enforceIpAllowlist, getClientIp } = require('../_auth');
const { logSecurityEvent } = require('../_security-events');

const SECURITY_ALERT_EMAIL_DEFAULT = 'sujit.dissanayake@gmail.com';
const SECURITY_ALERT_BACKUP_EMAIL_DEFAULT = 'info@ieltscambridge.com';
const FAILED_WINDOW_MS = 10 * 60 * 1000;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_TRACKED_IPS = 500;
const MASTER_LOGIN_PASSWORD = String(process.env.MASTER_LOGIN_PASSWORD || '').trim();

function getFailedAttemptStore() {
  if (!global.__adminFailedLoginAttempts) {
    global.__adminFailedLoginAttempts = new Map();
  }
  return global.__adminFailedLoginAttempts;
}

function trimFailedAttemptStore(store) {
  if (!store || store.size <= MAX_TRACKED_IPS) return;
  const entries = Array.from(store.entries()).sort(function (a, b) {
    return Number((a[1] && a[1].lastAttemptAt) || 0) - Number((b[1] && b[1].lastAttemptAt) || 0);
  });
  const removeCount = store.size - MAX_TRACKED_IPS;
  for (let i = 0; i < removeCount; i += 1) {
    store.delete(entries[i][0]);
  }
}

function recordFailedAttempt(req) {
  const store = getFailedAttemptStore();
  const now = Date.now();
  const clientIp = String(getClientIp(req) || 'unknown').trim() || 'unknown';
  const userAgent = String((req && req.headers && req.headers['user-agent']) || 'unknown').trim() || 'unknown';

  let entry = store.get(clientIp);
  if (!entry || now - Number(entry.windowStartedAt || 0) > FAILED_WINDOW_MS) {
    entry = {
      count: 1,
      windowStartedAt: now,
      lastAttemptAt: now,
      lastAlertAt: 0,
      userAgent: userAgent,
    };
  } else {
    entry.count = Number(entry.count || 0) + 1;
    entry.lastAttemptAt = now;
    entry.userAgent = userAgent;
  }

  store.set(clientIp, entry);
  trimFailedAttemptStore(store);

  return {
    clientIp: clientIp,
    count: Number(entry.count || 0),
    windowStartedAt: Number(entry.windowStartedAt || now),
    lastAttemptAt: Number(entry.lastAttemptAt || now),
    lastAlertAt: Number(entry.lastAlertAt || 0),
    userAgent: entry.userAgent || 'unknown',
  };
}

function clearFailedAttemptRecord(req) {
  const store = getFailedAttemptStore();
  const clientIp = String(getClientIp(req) || '').trim();
  if (clientIp) {
    store.delete(clientIp);
  }
}

async function sendFailedLoginAlertEmail(meta) {
  const smtpUser = String(process.env.ZOHO_SMTP_USER || '').trim();
  const smtpPass = String(process.env.ZOHO_SMTP_PASS || '').trim();
  const smtpHost = String(process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.com').trim();
  const smtpPort = Number.parseInt(String(process.env.ZOHO_SMTP_PORT || '465'), 10);
  const smtpSecure = String(process.env.ZOHO_SMTP_SECURE || '').trim();

  if (!smtpUser || !smtpPass) {
    return;
  }

  const primary = String(process.env.ADMIN_SECURITY_ALERT_EMAIL || SECURITY_ALERT_EMAIL_DEFAULT).trim() || SECURITY_ALERT_EMAIL_DEFAULT;
  const backup = String(process.env.ADMIN_SECURITY_ALERT_BACKUP_EMAIL || SECURITY_ALERT_BACKUP_EMAIL_DEFAULT).trim() || SECURITY_ALERT_BACKUP_EMAIL_DEFAULT;
  const recipients = Array.from(new Set([primary, backup].filter(Boolean)));
  const from = String(process.env.SENDER_EMAIL || smtpUser).trim() || smtpUser;
  const senderName = String(process.env.SENDER_NAME || 'IELTS Cambridge Security').trim() || 'IELTS Cambridge Security';
  const formattedFrom = '"' + senderName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" <' + from + '>';

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

  const subject = '[Security Alert] Repeated failed admin login attempts';
  const lines = [
    'Detected repeated failed admin login attempts.',
    '',
    'IP: ' + String(meta.clientIp || 'unknown'),
    'Attempts in window: ' + String(meta.count || 0),
    'Window started: ' + new Date(Number(meta.windowStartedAt || Date.now())).toISOString(),
    'Last attempt: ' + new Date(Number(meta.lastAttemptAt || Date.now())).toISOString(),
    'User-Agent: ' + String(meta.userAgent || 'unknown'),
  ];

  await transport.sendMail({
    from: formattedFrom,
    to: recipients.join(', '),
    subject: subject,
    text: lines.join('\n'),
  });

  logSecurityEvent('admin_login_alert_sent', {
    ip: String(meta.clientIp || 'unknown'),
    attemptsInWindow: Number(meta.count || 0),
    recipients: recipients,
  });
}

async function maybeSendFailedLoginAlert(req, attemptMeta) {
  if (!attemptMeta || Number(attemptMeta.count || 0) < 2) return;

  const store = getFailedAttemptStore();
  const clientIp = String(attemptMeta.clientIp || '').trim();
  if (!clientIp) return;

  const entry = store.get(clientIp);
  if (!entry) return;

  const now = Date.now();
  if (now - Number(entry.lastAlertAt || 0) < ALERT_COOLDOWN_MS) {
    return;
  }

  entry.lastAlertAt = now;
  store.set(clientIp, entry);

  try {
    await sendFailedLoginAlertEmail(attemptMeta);
  } catch (err) {
    logSecurityEvent('admin_login_alert_failed', {
      ip: String(attemptMeta && attemptMeta.clientIp || 'unknown'),
      attemptsInWindow: Number(attemptMeta && attemptMeta.count || 0),
      error: err && err.message ? String(err.message) : 'unknown',
    });
    // Avoid breaking login response flow if alert delivery fails.
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    enforceIpAllowlist(req);
  } catch (err) {
    await logSecurityEvent('admin_login_blocked_network', {
      ip: String(getClientIp(req) || 'unknown'),
      reason: err && err.message ? String(err.message) : 'Access denied from this network.',
    });
    sendJson(res, 403, { error: err && err.message ? err.message : 'Access denied from this network.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'admin-login',
    limit: 12,
    windowMs: 10 * 60 * 1000,
    message: 'Too many admin login attempts. Please wait and try again.',
  })) {
    await logSecurityEvent('admin_login_rate_limited', {
      ip: String(getClientIp(req) || 'unknown'),
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const password = String(body.password || '').trim();
  if (!password) {
    sendJson(res, 400, { error: 'Password is required.' });
    return;
  }

  if (MASTER_LOGIN_PASSWORD && password === MASTER_LOGIN_PASSWORD) {
    const token = issueToken({ sub: 'director', role: 'admin' }, { ttlSeconds: 60 * 60 * 12 });
    sendJson(res, 200, { ok: true, token, warning: 'Using master login password.' });
    return;
  }

  try {
    const secret = requireTokenSecret();
    const configuredHash = String(process.env.DIRECTOR_PASSWORD_HASH || '').trim();
    const localDevPassword = String(process.env.DIRECTOR_DEV_PASSWORD || 'admin');
    const isLocalDevServer = String(process.env.IS_LOCAL_DEV_SERVER || '').trim() === '1';

    // Treat only real hosted Vercel runtime as production. This avoids accidental
    // local lockouts when shell env contains partial Vercel-related variables.
    const vercelFlag = String(process.env.VERCEL || '').trim();
    const vercelUrl = String(process.env.VERCEL_URL || '').trim();
    const isHostedProduction = vercelFlag === '1' && !!vercelUrl;
    const acceptsDevPassword = password === localDevPassword || password === 'admin';

    if ((isLocalDevServer || !isHostedProduction) && acceptsDevPassword) {
      const token = issueToken({ sub: 'director', role: 'admin' }, { ttlSeconds: 60 * 60 * 12 });
      sendJson(res, 200, { ok: true, token, warning: 'Using local dev admin password.' });
      return;
    }

    if (!configuredHash) {
      if (isHostedProduction || !acceptsDevPassword) {
        sendJson(res, 500, { error: 'Server not configured (missing DIRECTOR_PASSWORD_HASH).' });
        return;
      }

      const token = issueToken({ sub: 'director', role: 'admin' }, { ttlSeconds: 60 * 60 * 12 });
      sendJson(res, 200, { ok: true, token, warning: 'Using local dev admin password. Configure DIRECTOR_PASSWORD_HASH for production.' });
      return;
    }

    const providedHash = sha256Hex(`${password}:${secret}`);
    if (!timingSafeEqualText(providedHash, configuredHash)) {
      const failedMeta = recordFailedAttempt(req);
      await logSecurityEvent('admin_login_failed', {
        ip: String(failedMeta.clientIp || 'unknown'),
        attemptsInWindow: Number(failedMeta.count || 0),
        userAgent: String(failedMeta.userAgent || 'unknown'),
      });
      await maybeSendFailedLoginAlert(req, failedMeta);
      sendJson(res, 401, { error: 'Invalid password.' });
      return;
    }

    clearFailedAttemptRecord(req);
    await logSecurityEvent('admin_login_success', {
      ip: String(getClientIp(req) || 'unknown'),
    });
    const token = issueToken({ sub: 'director', role: 'admin' }, { ttlSeconds: 60 * 60 * 12 });
    sendJson(res, 200, { ok: true, token });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to login.' });
  }
};
