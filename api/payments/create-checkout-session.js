const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');

const Stripe = require('stripe');

const PACKAGE_PRICING = {
  Lite: 9.99,
  Basic: 27.99,
  Standard: 58.99,
  Pro: 99.99,
};

const getOrigin = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim();
  const proto = forwardedProto || (process.env.IS_LOCAL_DEV_SERVER ? 'http' : 'https');
  const host = String(req.headers.host || 'www.ieltscambridge.com').trim();
  return `${proto}://${host}`;
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    sendJson(res, 500, { error: 'Stripe is not configured (missing STRIPE_SECRET_KEY).' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request body.' });
    return;
  }

  const packageName = String(body.package || '').trim();
  if (!Object.prototype.hasOwnProperty.call(PACKAGE_PRICING, packageName)) {
    sendJson(res, 400, { error: 'Invalid package selected.' });
    return;
  }

  const packageAmount = Number(PACKAGE_PRICING[packageName]);
  const amountCents = Math.round(packageAmount * 100);
  const stripe = new Stripe(secretKey);

  const origin = getOrigin(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `${packageName} Mock Test Package`,
              description: 'IELTS mock test package purchase',
            },
          },
        },
      ],
      success_url: `${origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}&package=${encodeURIComponent(packageName)}`,
      cancel_url: `${origin}/payment-cancel.html?package=${encodeURIComponent(packageName)}`,
      metadata: {
        package: packageName,
        amountUsd: String(packageAmount.toFixed(2)),
      },
    });

    sendJson(res, 200, {
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    sendJson(res, 500, {
      error: err && err.message ? err.message : 'Unable to create Stripe checkout session.',
    });
  }
};
