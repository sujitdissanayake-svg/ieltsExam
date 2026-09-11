const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
  const date = String(url.searchParams.get('date') || '').trim();

  if (!date) {
    sendJson(res, 400, { error: 'Missing date (YYYY-MM-DD).' });
    return;
  }

  try {
    const slots = await store.listAvailabilityByDate({ date, status: 'approved' });
    sendJson(res, 200, { ok: true, slots });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load slots.' });
  }
};
