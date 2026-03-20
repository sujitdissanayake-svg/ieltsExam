const crypto = require('crypto');
const { sha256Hex, verifyToken, readJsonBody } = require('./_shared');

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

  const token = String(body.token || '').trim();
  const code = String(body.code || '').trim();

  if (!token) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing token.' }));
    return;
  }

  if (!/^[0-9]{6}$/.test(code)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Enter a valid 6-digit code.' }));
    return;
  }

  const tokenSecret = process.env.VERIFICATION_TOKEN_SECRET;
  if (!tokenSecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server not configured (missing VERIFICATION_TOKEN_SECRET).' }));
    return;
  }

  let payload;
  try {
    payload = verifyToken(token, tokenSecret);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err && err.message ? err.message : 'Invalid token.' }));
    return;
  }

  const expectedHash = String(payload && payload.codeHash ? payload.codeHash : '');
  const providedHash = sha256Hex(`${code}:${tokenSecret}`);

  const a = Buffer.from(expectedHash, 'utf8');
  const b = Buffer.from(providedHash, 'utf8');
  const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);

  if (!ok) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Incorrect or expired code.' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, email: payload.email }));
};
