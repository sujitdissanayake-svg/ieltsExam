const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-login',
    limit: 40,
    windowMs: 10 * 60 * 1000,
    message: 'Too many login attempts. Please wait and try again.',
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

  const email = String(body.email || '').trim();
  const passwordHash = String(body.passwordHash || '').trim();

  if (!isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    if (String(user.role || '').toLowerCase() !== 'student') {
      sendJson(res, 403, { error: 'This account is not a student account. Please use Test Taker registration/login.' });
      return;
    }

    const storedHash = String(user.passwordHash || '').trim();
    if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        whatsapp: user.whatsapp || '',
        dob: user.dob || '',
        role: user.role || 'student',
        candidateNumber: user.candidateNumber || 0,
        targetBandScore: Number(user.targetBandScore) || 0,
        createdAt: user.createdAt || '',
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to login.' });
  }
};