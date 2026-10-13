const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');
const { requireRole, hashPassword } = require('../_auth');
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
      const examiners = await store.listExaminers();
      sendJson(res, 200, { ok: true, examiners });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load examiners.' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
      return;
    }

    const requestedEmails = Array.isArray(body && body.emails)
      ? body.emails
      : [body && body.email];
    const emails = Array.from(new Set(requestedEmails
      .map((email) => String(email || '').trim().toLowerCase())
      .filter(Boolean)))
      .slice(0, 200);
    if (!emails.length) {
      sendJson(res, 400, { error: 'At least one examiner email is required.' });
      return;
    }

    try {
      let deleted = 0;
      for (const email of emails) {
        const result = await store.deleteExaminerByEmail(email);
        deleted += Number(result && result.deleted || 0);
      }
      if (deleted < 1) {
        sendJson(res, 404, { error: 'Examiner account not found.' });
        return;
      }
      sendJson(res, 200, { ok: true, deleted, requested: emails.length });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to delete examiner.' });
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

  const email = String(body.email || '').trim();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');

  if (!email) {
    sendJson(res, 400, { error: 'Email is required.' });
    return;
  }
  if (!password) {
    sendJson(res, 400, { error: 'Password is required.' });
    return;
  }

  try {
    const passwordHash = hashPassword(password);
    const examiner = await store.promoteToExaminer({ email, name, passwordHash });
    sendJson(res, 200, { ok: true, examiner: { id: examiner.id, email: examiner.email, name: examiner.name } });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to create examiner.' });
  }
};
