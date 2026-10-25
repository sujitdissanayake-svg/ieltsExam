const { readJsonBody } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
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
    try {
      sendJson(res, 200, { ok: true, tokens: await store.listTestTokens({ limit: 200, tokenType: 'retake' }) });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load retake tokens.' });
    }
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  if (req.method === 'DELETE') {
    if (body && body.clearAll === true) {
      try {
        const deletedCount = await store.deleteTestTokens({ tokenType: 'retake' });
        sendJson(res, 200, { ok: true, deletedCount });
      } catch (err) {
        sendJson(res, 400, { error: err && err.message ? err.message : 'Unable to delete retake tokens.' });
      }
      return;
    }

    try {
      const token = await store.disableTestToken({ id: body && body.id, tokenType: 'retake' });
      if (!token) {
        sendJson(res, 409, { error: 'This retake token is already used, disabled, or unavailable.' });
        return;
      }
      sendJson(res, 200, { ok: true, token });
    } catch (err) {
      sendJson(res, 400, { error: err && err.message ? err.message : 'Unable to disable retake token.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }
  if (await enforceRateLimit(req, res, { key: 'admin-retake-tokens-create', limit: 10, windowMs: 10 * 60 * 1000, message: 'Too many retake-token batches were generated. Please wait and try again.' })) return;

  try {
    const result = await store.createTestTokens({ quantity: body && body.quantity, tokenType: 'retake' });
    sendJson(res, 201, { ok: true, batchId: result.batchId, tokens: result.tokens.map((token) => ({ code: token.code, createdAt: token.createdAt })) });
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Unable to generate retake tokens.' });
  }
};
