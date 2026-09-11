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

  const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
  const userId = String(url.searchParams.get('userId') || '').trim();
  const limit = Number(url.searchParams.get('limit') || '100');

  if (!userId) {
    sendJson(res, 400, { error: 'Missing userId.' });
    return;
  }

  try {
    const activities = await store.listActivities({ userId, limit });
    sendJson(res, 200, { ok: true, activities });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load activities.' });
  }
};
