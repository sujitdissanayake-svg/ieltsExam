const { sendJson } = require('../_http');
const { requireRole } = require('../_auth');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    requireRole(req, ['admin']);
  } catch (err) {
    sendJson(res, 401, { error: err && err.message ? err.message : 'Unauthorized.' });
    return;
  }

  try {
    const overview = await store.getAdminOverview();
    sendJson(res, 200, { ok: true, overview });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load admin overview.' });
  }
};