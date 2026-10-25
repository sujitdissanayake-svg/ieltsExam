const { readJsonBody, timingSafeEqualText } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const MAX_PAID_RETAKES_PER_TEST = 5;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }
  if (await enforceRateLimit(req, res, { key: 'retake-tokens-redeem', limit: 10, windowMs: 10 * 60 * 1000, message: 'Too many retake token redemption attempts. Please wait and try again.' })) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }
  const email = String(body && body.email || '').trim();
  const passwordHash = String(body && body.passwordHash || '').trim();
  const code = String(body && body.code || '').trim();
  const paper = Math.max(1, Math.min(10, Number(body && body.paper) || 0));
  if (!email || !passwordHash || !code || !paper) {
    sendJson(res, 400, { error: 'A signed-in learner, retake token code, and test are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student' || !timingSafeEqualText(user.passwordHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }
    const payments = await store.listPayments({ status: 'paid', limit: 500 });
    const hasInitialBooking = payments.some((payment) => {
      const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
      return String(payment.userId || '') === String(user.id || '') && Number(meta.paper) === paper && String(meta.purchaseType || '').toLowerCase() !== 'retake';
    });
    if (!hasInitialBooking) {
      sendJson(res, 409, { error: `Book Test ${String(paper).padStart(2, '0')} before using a retake token.` });
      return;
    }
    const results = await store.listResults({ userId: user.id, limit: 200 });
    const initialCompleted = results.some((result) => {
      const meta = result && result.meta && typeof result.meta === 'object' ? result.meta : {};
      return Number(meta.paper || 1) === paper && String(meta.attemptType || 'initial').toLowerCase() !== 'retake';
    });
    if (!initialCompleted) {
      sendJson(res, 409, { error: `Complete the initial Test ${String(paper).padStart(2, '0')} before using a retake token.` });
      return;
    }
    const paidRetakes = payments.filter((payment) => {
      const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
      return String(payment.userId || '') === String(user.id || '') && Number(meta.paper) === paper && String(meta.purchaseType || '').toLowerCase() === 'retake';
    }).length;
    if (paidRetakes >= MAX_PAID_RETAKES_PER_TEST) {
      sendJson(res, 409, { error: `The five paid retakes for Test ${String(paper).padStart(2, '0')} are already available or used.` });
      return;
    }
    const result = await store.redeemRetakeTokenForEntitlement({ code, userId: user.id, paper });
    if (!result) {
      sendJson(res, 409, { error: 'This retake token is invalid, unavailable, or has already been used.' });
      return;
    }
    sendJson(res, 200, { ok: true, token: result.token, payment: result.payment });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to redeem retake token.' });
  }
};
