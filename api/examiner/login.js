const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const { issueToken, hashPassword } = require('../_auth');
const store = require('../_store');

const DEV_EXAMINER_EMAIL_DEFAULT = 'sujit.dissanayake@gmail.com';
const DEV_EXAMINER_PASSWORD_DEFAULT = 'sujit@Exam001';

const isLocalDevBootstrapEnabled = () => {
  const isLocalDevServer = String(process.env.IS_LOCAL_DEV_SERVER || '').trim() === '1';
  if (!isLocalDevServer) return false;

  const flag = String(process.env.ALLOW_EXAMINER_DEV_BOOTSTRAP || '1').trim().toLowerCase();
  return !(flag === '0' || flag === 'false' || flag === 'no' || flag === 'off');
};

const getDevExaminerEmail = () => {
  return String(process.env.EXAMINER_DEV_EMAIL || DEV_EXAMINER_EMAIL_DEFAULT).trim().toLowerCase();
};

const getDevExaminerPassword = () => {
  return String(process.env.EXAMINER_DEV_PASSWORD || DEV_EXAMINER_PASSWORD_DEFAULT);
};

const matchesDevExaminerCredentials = (email, password) => {
  const expectedEmail = getDevExaminerEmail();
  const providedEmail = String(email || '').trim().toLowerCase();
  if (!expectedEmail || expectedEmail !== providedEmail) return false;

  const expectedPassword = getDevExaminerPassword();
  if (!expectedPassword) return false;
  return timingSafeEqualText(password, expectedPassword);
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'examiner-login',
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: 'Too many examiner login attempts. Please wait and try again.',
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
  const password = String(body.password || '');

  if (!isValidEmailBasic(email) || !password) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  try {
    const providedHash = hashPassword(password);
    let user = await store.getUserByEmail(email);
    let storedHash = String(user && user.passwordHash || '').trim();
    let hasValidPassword = !!(user && user.role === 'examiner' && storedHash && timingSafeEqualText(providedHash, storedHash));

    // Local-dev fallback: bootstrap a known examiner account when the store is empty.
    if (!hasValidPassword && isLocalDevBootstrapEnabled() && matchesDevExaminerCredentials(email, password)) {
      user = await store.promoteToExaminer({
        email,
        name: (user && String(user.name || '').trim()) || 'Examiner',
        passwordHash: providedHash,
      });
      storedHash = String(user && user.passwordHash || '').trim();
      hasValidPassword = !!(user && user.role === 'examiner' && storedHash && timingSafeEqualText(providedHash, storedHash));
    }

    if (!hasValidPassword) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const token = issueToken({ sub: user.id, role: 'examiner' }, { ttlSeconds: 60 * 60 * 12 });
    sendJson(res, 200, { ok: true, token, examiner: { id: user.id, email: user.email, name: user.name || '' } });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to login.' });
  }
};
