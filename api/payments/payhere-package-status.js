const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'payments-payhere-package-status',
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'Too many payment status requests. Please wait and try again.',
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

  const orderId = String(body.orderId || '').trim();
  const email = String(body.email || '').trim();
  const passwordHash = String(body.passwordHash || '').trim();
  if (!orderId || !isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Payment order and sign-in are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student' || !timingSafeEqualText(user.passwordHash, passwordHash)) {
      sendJson(res, 401, { error: 'Your sign-in has expired. Please sign in again.' });
      return;
    }

    const payment = await store.findPaymentByPayHereOrderId(orderId);
    if (!payment || String(payment.userId) !== String(user.id)) {
      sendJson(res, 404, { error: 'Payment order not found.' });
      return;
    }

    const meta = payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
    if (!meta.package) {
      sendJson(res, 400, { error: 'This is not a package payment.' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      paid: String(payment.status || '').toLowerCase() === 'paid' && meta.verified === true,
      package: String(meta.package),
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to verify the payment.' });
  }
};
