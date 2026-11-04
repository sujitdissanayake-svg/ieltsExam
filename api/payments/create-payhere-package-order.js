const crypto = require('crypto');
const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const PACKAGE_PRICING_USD = {
  Lite: 9.99,
  Basic: 27.99,
  Standard: 58.99,
  Pro: 99.99,
};

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
    key: 'payments-create-payhere-package-order',
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

  const packageName = String(body.package || '').trim();
  const email = String(body.email || '').trim();
  const passwordHash = String(body.passwordHash || '').trim();
  const amount = PACKAGE_PRICING_USD[packageName];
  if (!amount || !isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Sign in to the Test Taker Portal before starting a payment.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student' || !timingSafeEqualText(user.passwordHash, passwordHash)) {
      sendJson(res, 401, { error: 'Your sign-in has expired. Please sign in again.' });
      return;
    }

    const orderId = `IELTS-PKG-${packageName.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const formattedAmount = amount.toFixed(2);
    const origin = getOrigin(req);
    const sandbox = String(process.env.PAYHERE_SANDBOX || '').trim().toLowerCase() === 'true';
    const nameParts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
    const hash = md5Upper(`${merchantId}${orderId}${formattedAmount}${currency}${md5Upper(merchantSecret)}`);

    await store.createPayment({
      userId: user.id,
      amount: Math.round(amount * 100),
      currency,
      status: 'pending',
      method: 'payhere',
      meta: {
        payhereOrderId: orderId,
        package: packageName,
        item: `${packageName} IELTS Mock Test Package`,
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
        return_url: `${origin}/payment-success.html?order_id=${encodeURIComponent(orderId)}&package=${encodeURIComponent(packageName)}`,
        cancel_url: `${origin}/payment-cancel.html?order_id=${encodeURIComponent(orderId)}&package=${encodeURIComponent(packageName)}`,
        notify_url: `${origin}/api/payments/payhere-notify`,
        order_id: orderId,
        items: `${packageName} IELTS Mock Test Package`,
        amount: formattedAmount,
        currency,
        hash,
        first_name: nameParts[0] || 'IELTS',
        last_name: nameParts.slice(1).join(' ') || 'Candidate',
        email: user.email,
        phone: getSafePhone(user.whatsapp),
        address: 'Not provided',
        city: 'Colombo',
        country: 'Sri Lanka',
        custom_1: String(user.id),
        custom_2: packageName,
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to start the PayHere payment.' });
  }
};
