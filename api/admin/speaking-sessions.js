const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');
const { requireRole } = require('../_auth');
const store = require('../_store');

module.exports = async function handler(req, res) {
  let auth;
  try {
    auth = requireRole(req, ['admin']);
  } catch (err) {
    sendJson(res, 401, { error: err && err.message ? err.message : 'Unauthorized.' });
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
    const status = String(url.searchParams.get('status') || '').trim();
    const examinerId = String(url.searchParams.get('examinerId') || '').trim();
    const limit = Number(url.searchParams.get('limit') || '500');

    try {
      const slots = await store.listSpeakingSlots({ status, examinerId, limit });
      sendJson(res, 200, { ok: true, slots });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load speaking sessions.' });
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

    const slotIds = Array.isArray(body && body.slotIds)
      ? body.slotIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    if (!slotIds.length) {
      sendJson(res, 400, { error: 'slotIds is required.' });
      return;
    }

    try {
      const result = await store.deleteSpeakingSlotsByIds(slotIds);
      sendJson(res, 200, { ok: true, deleted: result.deleted || 0 });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to delete speaking sessions.' });
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

  const slotId = String(body.slotId || '').trim();
  const status = String(body.status || '').trim();
  const zoomLink = String(body.zoomLink || '').trim();
  const adminNote = String(body.adminNote || '').trim();

  if (!slotId) {
    sendJson(res, 400, { error: 'slotId is required.' });
    return;
  }

  if (!status) {
    sendJson(res, 400, { error: 'status is required.' });
    return;
  }

  try {
    const slot = await store.updateSpeakingSlot({
      slotId,
      status,
      zoomLink,
      adminNote,
      approvedBy: auth && auth.sub ? String(auth.sub) : 'admin',
    });
    sendJson(res, 200, { ok: true, slot });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to update speaking session.' });
  }
};