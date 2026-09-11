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
    try {
      const tests = await store.listTests();
      sendJson(res, 200, { ok: true, tests });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load tests.' });
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

  const name = String(body.name || '').trim();
  if (!name) {
    sendJson(res, 400, { error: 'Name is required.' });
    return;
  }

  try {
    const test = await store.createTest({ name });
    sendJson(res, 200, { ok: true, test });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to create test.' });
  }
};
