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
    const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
    const limit = Number(url.searchParams.get('limit') || '200');
    const moduleName = String(url.searchParams.get('module') || '').trim();
    const userId = String(url.searchParams.get('userId') || '').trim();

    try {
      const results = await store.listResults({ limit, module: moduleName, userId });
      sendJson(res, 200, { ok: true, results });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load results.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const summary = await store.clearStudentResultData();
      sendJson(res, 200, { ok: true, summary });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to clear student result data.' });
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

  const userId = String(body.userId || '').trim();
  const moduleName = String(body.module || '').trim().toLowerCase();

  if (!userId) {
    sendJson(res, 400, { error: 'User is required.' });
    return;
  }

  if (!moduleName) {
    sendJson(res, 400, { error: 'Module is required.' });
    return;
  }

  try {
    const result = await store.upsertResult({
      id: body.id,
      userId,
      testName: body.testName,
      module: moduleName,
      source: body.source,
      bandScore: body.bandScore,
      rawScore: body.rawScore,
      maxScore: body.maxScore,
      status: body.status,
      notes: body.notes,
      artifactUrl: body.artifactUrl,
      meta: body.meta,
    });
    sendJson(res, 200, { ok: true, result });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to save result.' });
  }
};