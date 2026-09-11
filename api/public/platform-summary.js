const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const overview = await store.getAdminOverview();
    const counts = (overview && overview.counts) || {};
    sendJson(res, 200, {
      ok: true,
      summary: {
        generatedAt: overview && overview.generatedAt ? overview.generatedAt : new Date().toISOString(),
        counts: {
          registeredCandidates: Number(counts.registeredCandidates || 0),
          paidCandidates: Number(counts.paidCandidates || 0),
          freeOnlyCandidates: Number(counts.freeOnlyCandidates || 0),
          examiners: Number(counts.examiners || 0),
          speakingSlots: Number(counts.speakingSlots || 0),
          results: Number(counts.results || 0),
          totalRevenue: Number(counts.totalRevenue || 0),
        },
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load platform summary.' });
  }
};
