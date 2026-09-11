const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
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

  const email = String(body.email || '').trim();
  const type = String(body.type || '').trim();
  const meta = body && body.meta && typeof body.meta === 'object' ? body.meta : {};

  if (!email) {
    sendJson(res, 400, { error: 'Email is required.' });
    return;
  }
  if (!type) {
    sendJson(res, 400, { error: 'Type is required.' });
    return;
  }

  try {
    const user = await store.upsertStudent({ email });
    const ev = await store.logActivity({ userId: user.id, type, meta });
    sendJson(res, 200, { ok: true, activity: ev });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to log activity.' });
  }
};
