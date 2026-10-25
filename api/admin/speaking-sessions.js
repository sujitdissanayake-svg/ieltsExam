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
      const speakingResults = await store.listResults({ module: 'speaking', limit: 1000 });
      const scoresBySlotId = new Map(
        speakingResults
          .filter((result) => result && result.meta && typeof result.meta === 'object' && result.meta.speakingSlotId)
          .map((result) => [String(result.meta.speakingSlotId), result.bandScore])
      );
      const slotsWithScores = slots.map((slot) => ({
        ...slot,
        speakingBandScore: scoresBySlotId.has(String(slot.id || '')) ? scoresBySlotId.get(String(slot.id || '')) : null,
      }));
      sendJson(res, 200, { ok: true, slots: slotsWithScores });
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
  const hasRecordingLinkUpdate = Object.prototype.hasOwnProperty.call(body || {}, 'recordingLink');
  const recordingLink = hasRecordingLinkUpdate ? String(body.recordingLink || '').trim() : undefined;
  const adminNote = String(body.adminNote || '').trim();
  const hasSpeakingBandScore = Object.prototype.hasOwnProperty.call(body || {}, 'speakingBandScore');

  if (!slotId) {
    sendJson(res, 400, { error: 'slotId is required.' });
    return;
  }

  if (hasSpeakingBandScore) {
    const speakingBandScore = Number(body.speakingBandScore);
    if (!Number.isFinite(speakingBandScore) || speakingBandScore < 4 || speakingBandScore > 9 || Math.round(speakingBandScore * 2) !== speakingBandScore * 2) {
      sendJson(res, 400, { error: 'Speaking band score must be between 4.0 and 9.0 in 0.5 increments.' });
      return;
    }

    try {
      const slots = await store.listSpeakingSlots({ limit: 1000 });
      const slot = slots.find((item) => String(item.id || '') === slotId);
      if (!slot || !slot.candidateId) {
        sendJson(res, 404, { error: 'Booked candidate not found for this speaking slot.' });
        return;
      }

      const candidateResults = await store.listResults({ userId: slot.candidateId, limit: 200 });
      const packageName = String(slot.bookingPackage || '').trim();
      const expectedTestMode = packageName === '01 Test' ? 'free' : 'mock';
      const writingResult = candidateResults
        .filter((result) => String(result.module || '').toLowerCase() === 'writing')
        .filter((result) => String(result.meta && result.meta.testMode || '').toLowerCase() === expectedTestMode)
        .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))[0];
      if (!writingResult) {
        sendJson(res, 409, { error: 'The candidate must complete the matching Writing test before a Speaking score can be saved.' });
        return;
      }

      const existingSpeakingResult = candidateResults.find((result) =>
        String(result.module || '').toLowerCase() === 'speaking' &&
        String(result.meta && result.meta.speakingSlotId || '') === slotId
      );
      const result = await store.upsertResult({
        id: existingSpeakingResult ? existingSpeakingResult.id : '',
        userId: slot.candidateId,
        testName: writingResult.testName || packageName,
        module: 'speaking',
        source: 'admin-speaking-score',
        bandScore: speakingBandScore,
        status: 'published',
        meta: {
          ...(writingResult.meta && typeof writingResult.meta === 'object' ? writingResult.meta : {}),
          speakingSlotId: slotId,
        },
      });
      sendJson(res, 200, { ok: true, result });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to save speaking score.' });
    }
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
      recordingLink,
      adminNote,
      approvedBy: auth && auth.sub ? String(auth.sub) : 'admin',
    });
    sendJson(res, 200, { ok: true, slot });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to update speaking session.' });
  }
};