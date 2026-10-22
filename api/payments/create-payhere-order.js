const crypto = require('crypto');
const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const TEST_PRICE_USD = '12.99';

const md5Upper = (value) => crypto.createHash('md5').update(String(value), 'utf8').digest('hex').toUpperCase();

const getOrigin = (req) => {
  const configured = String(process.env.PAYHERE_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (configured) return configured;

  const proto = String(req.headers['x-forwarded-proto'] || (process.env.IS_LOCAL_DEV_SERVER ? 'http' : 'https')).trim();
  const host = String(req.headers.host || 'www.ieltscambridge.com').trim();
  return `${proto}://${host}`;
};

const getSafePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : '0000000000';
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'payments-create-payhere-order',
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: 'Too many payment requests. Please wait and try again.',
  })) {
    return;
  }

  const merchantId = String(process.env.PAYHERE_MERCHANT_ID || '').trim();
  const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || '').trim();
  const currency = String(process.env.PAYHERE_CURRENCY || 'USD').trim().toUpperCase();
  if (!merchantId || !merchantSecret) {
    sendJson(res, 500, { error: 'PayHere is not configured.' });
    return;
  }
  if (currency !== 'USD' && currency !== 'LKR') {
    sendJson(res, 500, { error: 'PayHere currency configuration is invalid.' });
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
  const paper = Math.max(1, Math.min(10, Number(body.paper) || 0));
  if (!isValidEmailBasic(email) || !passwordHash || !paper) {
    sendJson(res, 400, { error: 'A signed-in learner and valid test slot are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student') {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }
    if (!timingSafeEqualText(user.passwordHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const payments = await store.listPayments({ limit: 500 });
    const hasPaidBookingFor = (testPaper) => payments.some((payment) => {
      if (String(payment.userId || '').trim() !== String(user.id || '').trim()) return false;
      if (String(payment.status || '').trim().toLowerCase() !== 'paid') return false;
      const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
      return Number(meta.paper) === testPaper;
    });

    if (hasPaidBookingFor(paper)) {
      sendJson(res, 409, { error: `Test ${String(paper).padStart(2, '0')} has already been booked.` });
      return;
    }

    if (paper > 1) {
      const previousTestBooked = hasPaidBookingFor(paper - 1);
      if (!previousTestBooked) {
        sendJson(res, 409, { error: `Book Test ${String(paper - 1).padStart(2, '0')} before booking this test.` });
        return;
      }
    }

    const orderId = `IELTS-T${paper}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const origin = getOrigin(req);
    const sandbox = String(process.env.PAYHERE_SANDBOX || '').trim().toLowerCase() === 'true';
    const nameParts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || 'IELTS';
    const lastName = nameParts.slice(1).join(' ') || 'Candidate';
    const hash = md5Upper(`${merchantId}${orderId}${TEST_PRICE_USD}${currency}${md5Upper(merchantSecret)}`);

    await store.createPayment({
      userId: user.id,
      amount: Math.round(Number(TEST_PRICE_USD) * 100),
      currency,
      status: 'pending',
      method: 'payhere',
      meta: {
        payhereOrderId: orderId,
        paper,
        item: `IELTS Mock Test ${String(paper).padStart(2, '0')}`,
        amountFormat: 'usd_cents',
        sandbox,
        verified: false,
      },
    });

    sendJson(res, 200, {
      ok: true,
      payment: {
        sandbox,
        merchant_id: merchantId,
        return_url: `${origin}/dashboard?payment=return`,
        cancel_url: `${origin}/dashboard?payment=cancelled`,
        notify_url: `${origin}/api/payments/payhere-notify`,
        order_id: orderId,
        items: `IELTS Mock Test ${String(paper).padStart(2, '0')}`,
        amount: TEST_PRICE_USD,
        currency,
        hash,
        first_name: firstName,
        last_name: lastName,
        email: user.email,
        phone: getSafePhone(user.whatsapp),
        address: 'Not provided',
        city: 'Colombo',
        country: 'Sri Lanka',
        custom_1: String(user.id),
        custom_2: String(paper),
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to start the PayHere payment.' });
  }
};
