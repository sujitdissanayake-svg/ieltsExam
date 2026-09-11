const { readJsonBody, verifyToken, requireVerificationTokenSecret, sha256Hex, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-reset-password',
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'Too many reset attempts. Please wait and try again.',
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
  const email = String(body.email || '').trim();
  const passwordHash = String(body.passwordHash || '').trim();

  if (!token) {
    sendJson(res, 400, { error: 'Missing token.' });
    return;
  }

  if (!/^[0-9]{6}$/.test(code)) {
    sendJson(res, 400, { error: 'Enter a valid 6-digit code.' });
    return;
  }

  if (!passwordHash || passwordHash.length < 4 || passwordHash.length > 128) {
    sendJson(res, 400, { error: 'New password is required.' });
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

  if (String(payload && payload.purpose || '').trim() !== 'password-reset') {
    sendJson(res, 400, { error: 'Invalid reset token purpose.' });
    return;
  }

  const tokenEmail = String(payload && payload.email || '').trim().toLowerCase();
  if (!isValidEmailBasic(tokenEmail)) {
    sendJson(res, 400, { error: 'Invalid reset token email.' });
    return;
  }

  if (email && String(email).trim().toLowerCase() !== tokenEmail) {
    sendJson(res, 400, { error: 'Reset email does not match token.' });
    return;
  }

  const expectedHash = String(payload && payload.codeHash ? payload.codeHash : '');
  const providedHash = sha256Hex(`${code}:${tokenSecret}`);
  if (!timingSafeEqualText(expectedHash, providedHash)) {
    sendJson(res, 400, { error: 'Incorrect or expired code.' });
    return;
  }

  let updated;
  try {
    updated = await store.updateStudentPasswordByEmail({ email: tokenEmail, passwordHash });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to reset password.' });
    return;
  }

  if (!updated) {
    sendJson(res, 404, { error: 'No student account found for this email.' });
    return;
  }

  try {
    await store.logActivity({
      userId: updated.id,
      type: 'password_reset',
      meta: { source: 'forgot-password-otp' },
    });
  } catch (_) {}

  sendJson(res, 200, {
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name || '',
      whatsapp: updated.whatsapp || '',
      dob: updated.dob || '',
      role: updated.role || 'student',
      candidateNumber: updated.candidateNumber || 0,
      targetBandScore: Number(updated.targetBandScore) || 0,
      createdAt: updated.createdAt || '',
    },
  });
};
