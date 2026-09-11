const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const PACKAGE_PRICING_USD_CENTS = {
  Lite: 999,
  Basic: 2799,
  Standard: 5899,
  Pro: 9999,
};

function normalizePackageName(value) {
  const raw = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(PACKAGE_PRICING_USD_CENTS, raw) ? raw : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-sync-purchased-payment',
    limit: 60,
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

  const email = String(body.email || '').trim();
  const passwordHash = String(body.passwordHash || '').trim();
  const packageName = normalizePackageName(body.package);
  const sessionId = String(body.sessionId || '').trim();
  const source = String(body.source || '').trim() || 'speaking-booking';

  if (!isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  if (!packageName) {
    sendJson(res, 400, { error: 'Valid package is required.' });
    return;
  }

  // Only accept purchase sync events that carry a payment session id.
  // This prevents package-only bridge hashes from creating fake paid entries.
  if (!sessionId) {
    sendJson(res, 400, { error: 'Valid session id is required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').toLowerCase() !== 'student') {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const storedHash = String(user.passwordHash || '').trim();
    if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const userId = String(user.id || '').trim();
    const existingPayments = await store.listPayments({ limit: 500 });
    const duplicate = existingPayments.some((payment) => {
      if (String(payment.userId || '').trim() !== userId) return false;
      if (String(payment.status || '').trim().toLowerCase() !== 'paid') return false;

      const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
      const metaSessionId = String(meta.stripeSessionId || meta.sessionId || '').trim();
      return !!metaSessionId && metaSessionId === sessionId;
    });

    if (duplicate) {
      try {
        await store.logActivity({
          userId,
          type: 'payment_sync',
          meta: {
            package: packageName,
            source,
            duplicate: true,
            sessionLinked: !!sessionId,
          },
        });
      } catch (_) {}
      sendJson(res, 200, { ok: true, created: false, reason: 'already-recorded' });
      return;
    }

    const amount = Number(PACKAGE_PRICING_USD_CENTS[packageName]) || 0;
    await store.createPayment({
      userId,
      amount,
      currency: 'USD',
      status: 'paid',
      method: 'stripe',
      meta: {
        package: packageName,
        source,
        stripeSessionId: sessionId,
        sessionLinked: !!sessionId,
        amountFormat: 'usd_cents',
        syncedAt: new Date().toISOString(),
      },
    });

    try {
      await store.logActivity({
        userId,
        type: 'payment_sync',
        meta: {
          package: packageName,
          source,
          duplicate: false,
          sessionLinked: !!sessionId,
        },
      });
    } catch (_) {}

    sendJson(res, 200, { ok: true, created: true, package: packageName });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to sync purchased payment.' });
  }
};
