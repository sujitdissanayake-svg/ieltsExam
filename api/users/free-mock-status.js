const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-free-mock-status',
    limit: 120,
    windowMs: 10 * 60 * 1000,
    message: 'Too many requests. Please wait and try again.',
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

  const email = normalizeSpaces(body.email || '');
  const passwordHash = normalizeSpaces(body.passwordHash || '');
  const deviceKey = store.normalizeDeviceKey(body.deviceKey || '');

  if (!isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || user.role !== 'student') {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const storedHash = String(user.passwordHash || '').trim();
    if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const freeMockAttemptSummary = await store.getFreeMockAttemptSummary({
      userId: user.id,
      currentAttemptId: '',
      deviceKey,
    });

    const canStart = !!freeMockAttemptSummary.canSubmit;
    const message = canStart
      ? ('You have remaining ' + String(freeMockAttemptSummary.remainingAttempts) + ' free attempts.')
      : 'You have used the maximum free mock attempts. Free Mock Test is now blocked. Opening Mock Test.';

    sendJson(res, 200, {
      ok: true,
      freeMockAttempt: {
        canStart,
        limit: freeMockAttemptSummary.limit,
        usedAttempts: freeMockAttemptSummary.usedAttempts,
        usedAttemptsByUser: freeMockAttemptSummary.usedAttemptsByUser,
        usedAttemptsByDevice: freeMockAttemptSummary.usedAttemptsByDevice,
        remainingAttempts: freeMockAttemptSummary.remainingAttempts,
        status: canStart ? 'ok' : 'blocked',
        redirectToPackages: !canStart,
        redirectPath: '/#mock',
        message,
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load free mock status.' });
  }
};
