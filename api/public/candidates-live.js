const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const overview = await store.getAdminOverview();
    const students = Array.isArray(overview && overview.students) ? overview.students : [];
    const candidates = students.map((row) => ({
      id: row && row.id ? String(row.id) : '',
      candidateNumber: Number((row && row.candidateNumber) || 0),
      name: String((row && row.name) || ''),
      email: String((row && row.email) || ''),
      whatsapp: String((row && row.whatsapp) || ''),
      createdAt: String((row && row.createdAt) || ''),
      paidMockTestsPurchased: Number((row && row.paidMockTestsPurchased) || 0),
      completedMockTests: Number((row && row.completedMockTests) || 0),
      remainingMockTests: Number((row && row.remainingMockTests) || 0),
      lastActivityAt: String((row && row.lastActivityAt) || ''),
      paymentStatus: String((row && row.paymentStatus) || 'free').toLowerCase(),
    }));

    sendJson(res, 200, {
      ok: true,
      generatedAt: overview && overview.generatedAt ? overview.generatedAt : new Date().toISOString(),
      candidates,
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load candidates.' });
  }
};
