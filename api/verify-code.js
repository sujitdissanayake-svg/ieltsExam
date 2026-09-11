const crypto = require('crypto');
const { sha256Hex, verifyToken, readJsonBody, requireVerificationTokenSecret } = require('./_shared');
const { sendJson, enforceRateLimit } = require('./_http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'verify-code',
    limit: 25,
    windowMs: 10 * 60 * 1000,
    message: 'Too many verification attempts. Please wait and try again.',
  })) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const token = String(body.token || '').trim();
  const code = String(body.code || '').trim();

  if (!token) {
    sendJson(res, 400, { error: 'Missing token.' });
    return;
  }

  if (!/^[0-9]{6}$/.test(code)) {
    sendJson(res, 400, { error: 'Enter a valid 6-digit code.' });
    return;
  }

  let tokenSecret;
  try {
    tokenSecret = requireVerificationTokenSecret();
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Server not configured.' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(token, tokenSecret);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid token.' });
    return;
  }

  const expectedHash = String(payload && payload.codeHash ? payload.codeHash : '');
  const providedHash = sha256Hex(`${code}:${tokenSecret}`);

  const a = Buffer.from(expectedHash, 'utf8');
  const b = Buffer.from(providedHash, 'utf8');
  const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);

  if (!ok) {
    sendJson(res, 400, { error: 'Incorrect or expired code.' });
    return;
  }

  sendJson(res, 200, { ok: true, email: payload.email });
};
