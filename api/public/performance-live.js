const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const overview = await store.getAdminOverview();
    sendJson(res, 200, {
      ok: true,
      overview: {
        generatedAt: overview && overview.generatedAt ? overview.generatedAt : new Date().toISOString(),
        students: Array.isArray(overview && overview.students) ? overview.students : [],
        results: Array.isArray(overview && overview.results) ? overview.results : [],
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load performance data.' });
  }
};
