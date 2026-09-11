const { readJsonBody } = require('../_shared');
const { sendJson } = require('../_http');
const { requireRole } = require('../_auth');
const store = require('../_store');

module.exports = async function handler(req, res) {
  let auth;
  try {
    auth = requireRole(req, ['examiner']);
  } catch (err) {
    sendJson(res, 401, { error: err && err.message ? err.message : 'Unauthorized.' });
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', `https://${req.headers.host || 'www.ieltscambridge.com'}`);
    const date = String(url.searchParams.get('date') || '').trim();
    const status = String(url.searchParams.get('status') || '').trim();
    const limit = Number(url.searchParams.get('limit') || '200');

    try {
      let slots;
      if (date) {
        slots = await store.listAvailabilityByDate({ date, status: status, examinerId: auth.sub });
      } else {
        const list = await store.listSpeakingSlots({ examinerId: auth.sub, status: status, limit: limit });
        slots = list.map((slot) => ({
          id: slot.id,
          examinerId: slot.examinerId,
          start: slot.startTs,
          end: slot.endTs,
          durationMinutes: slot.durationMinutes,
          status: slot.status,
          zoomLink: slot.zoomLink,
          sessionNote: slot.sessionNote,
          adminNote: slot.adminNote,
          approvedAt: slot.approvedAt,
          approvedBy: slot.approvedBy,
          createdAt: slot.createdAt || '',
        }));
      }
      sendJson(res, 200, { ok: true, slots });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load availability.' });
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
  const hasZoomLinkUpdate = Object.prototype.hasOwnProperty.call(body || {}, 'zoomLink');
  const zoomLink = hasZoomLinkUpdate ? String(body.zoomLink || '').trim() : '';
  const slots = Array.isArray(body.slots) ? body.slots : [];

  if (slotId) {
    if (!status && !hasZoomLinkUpdate) {
      sendJson(res, 400, { error: 'status or zoomLink is required when slotId is provided.' });
      return;
    }

    try {
      const ownedSlots = await store.listSpeakingSlots({ examinerId: auth.sub, limit: 1000 });
      const owned = ownedSlots.find((slot) => String(slot.id || '') === slotId);
      if (!owned) {
        sendJson(res, 404, { error: 'Slot not found.' });
        return;
      }

      const effectiveStatus = status || String(owned.status || 'pending');

      const updated = await store.updateSpeakingSlot({
        slotId,
        status: effectiveStatus,
        zoomLink: hasZoomLinkUpdate ? zoomLink : String(owned.zoomLink || ''),
        adminNote: String(owned.adminNote || ''),
        approvedBy: String(owned.approvedBy || ''),
      });
      sendJson(res, 200, { ok: true, slot: updated });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to update availability.' });
    }
    return;
  }

  try {
    const result = await store.upsertAvailabilitySlots({ examinerId: auth.sub, slots });
    sendJson(res, 200, { ok: true, result });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to save availability.' });
  }
};
