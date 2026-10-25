const { readJsonBody, timingSafeEqualText } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'tokens-redeem',
    limit: 10,
    windowMs: 10 * 60 * 1000,
    message: 'Too many token redemption attempts. Please wait and try again.',
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

  const email = String(body && body.email || '').trim();
  const passwordHash = String(body && body.passwordHash || '').trim();
  const code = String(body && body.code || '').trim();
  const paper = Math.max(1, Math.min(10, Number(body && body.paper) || 0));
  if (!email || !passwordHash || !code || !paper) {
    sendJson(res, 400, { error: 'A signed-in learner, token code, and test are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student' || !timingSafeEqualText(user.passwordHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const payments = await store.listPayments({ status: 'paid', limit: 500 });
    const hasBookedTest = payments.some((payment) => {
      const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
      return String(payment.userId || '') === String(user.id || '') && Number(meta.paper) === paper;
    });
    if (!hasBookedTest) {
      if (paper > 1) {
        const previousTestBooked = payments.some((payment) => {
          const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
          return String(payment.userId || '') === String(user.id || '') && Number(meta.paper) === paper - 1;
        });
        if (!previousTestBooked) {
          sendJson(res, 409, { error: `Book Test ${String(paper - 1).padStart(2, '0')} before using a token for this test.` });
          return;
        }
      }
    } else {
      sendJson(res, 409, { error: `Test ${String(paper).padStart(2, '0')} has already been booked.` });
      return;
    }

    const booking = await store.redeemTestTokenForBooking({ code, userId: user.id, paper });
    if (!booking) {
      sendJson(res, 409, { error: 'This token is invalid or has already been used.' });
      return;
    }

    sendJson(res, 200, { ok: true, token: booking.token, payment: booking.payment });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to redeem token.' });
  }
};
