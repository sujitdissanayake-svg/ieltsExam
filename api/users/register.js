const { readJsonBody, isValidEmailBasic, isValidWhatsAppNumber, timingSafeEqualText } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-register',
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: 'Too many registration attempts. Please wait and try again.',
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
  const name = String(body.name || '').trim();
  const whatsapp = String(body.whatsapp || '').trim();
  const dob = String(body.dob || '').trim();
  const targetBandScore = Number(body.targetBandScore);
  const passwordHash = String(body.passwordHash || '').trim();

  if (!isValidEmailBasic(email)) {
    sendJson(res, 400, { error: 'Email is required.' });
    return;
  }

  if (!isValidWhatsAppNumber(whatsapp)) {
    sendJson(res, 400, { error: 'Enter a valid WhatsApp number with country code.' });
    return;
  }

  if (!passwordHash || passwordHash.length < 4 || passwordHash.length > 128) {
    sendJson(res, 400, { error: 'Password is required.' });
    return;
  }

  try {
    const existing = await store.getUserByEmail(email);
    if (existing) {
      const existingRole = String(existing.role || '').toLowerCase();
      if (existingRole !== 'student') {
        sendJson(res, 409, {
          error: 'This email is already used by a non-student account. Please use the correct portal.',
          code: 'EMAIL_IN_USE_NON_STUDENT',
        });
        return;
      }

      const existingHash = String(existing.passwordHash || '').trim();
      if (existingHash && timingSafeEqualText(existingHash, passwordHash)) {
        sendJson(res, 200, {
          ok: true,
          existing: true,
          user: {
            id: existing.id,
            email: existing.email,
            name: existing.name || '',
            whatsapp: existing.whatsapp || '',
            dob: existing.dob || '',
            role: existing.role || 'student',
            candidateNumber: existing.candidateNumber || 0,
            targetBandScore: Number(existing.targetBandScore) || 0,
            createdAt: existing.createdAt || '',
          },
        });
        return;
      }

      sendJson(res, 409, {
        error: 'You already have an account. Use Forgotten Password to recover it.',
        code: 'EMAIL_EXISTS',
        forgotPassword: true,
      });
      return;
    }

    const user = await store.upsertStudent({
      email,
      name,
      whatsapp,
      dob,
      targetBandScore: Number.isFinite(targetBandScore) ? targetBandScore : 0,
      passwordHash,
    });
    sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        whatsapp: user.whatsapp,
        dob: user.dob || '',
        role: user.role || 'student',
        candidateNumber: user.candidateNumber || 0,
        targetBandScore: Number(user.targetBandScore) || 0,
        createdAt: user.createdAt || '',
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to register user.' });
  }
};
