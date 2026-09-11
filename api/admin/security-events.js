const { sendJson } = require('../_http');
const { requireRole } = require('../_auth');
const { getSecurityEvents } = require('../_security-events');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    requireRole(req, ['admin']);
  } catch (err) {
    sendJson(res, err && err.message === 'Forbidden.' ? 403 : 401, {
      error: err && err.message ? err.message : 'Unauthorized.',
    });
    return;
  }

  const query = (req && req.query) || {};
  const limit = Number(query.limit || 100);
  const events = await getSecurityEvents(limit);

  sendJson(res, 200, {
    ok: true,
    count: events.length,
    events,
  });
};
