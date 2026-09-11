const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');
const { requireRole } = require('../_auth');
const store = require('../_store');

module.exports = async function handler(req, res) {
  try {
    requireRole(req, ['admin']);
  } catch (err) {
    sendJson(res, 401, { error: err && err.message ? err.message : 'Unauthorized.' });
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
    const status = String(url.searchParams.get('status') || '').trim();
    const limit = Number(url.searchParams.get('limit') || '200');

    try {
      const payments = await store.listPayments({ status, limit });
      sendJson(res, 200, { ok: true, payments });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load payments.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const userId = String(body.userId || '').trim();
  const amount = Number(body.amount);
  const currency = String(body.currency || 'LKR').trim().toUpperCase() || 'LKR';
  const status = String(body.status || 'paid').trim().toLowerCase() || 'paid';
  const method = String(body.method || 'manual').trim().toLowerCase() || 'manual';
  const reference = String(body.reference || '').trim();
  const note = String(body.note || '').trim();

  if (!userId) {
    sendJson(res, 400, { error: 'User is required.' });
    return;
  }

  if (!Number.isFinite(amount) || amount < 0) {
    sendJson(res, 400, { error: 'Amount must be a valid number.' });
    return;
  }

  try {
    const payment = await store.createPayment({
      userId,
      amount,
      currency,
      status,
      method,
      meta: {
        reference,
        note,
      },
    });
    sendJson(res, 200, { ok: true, payment });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to save payment.' });
  }
};