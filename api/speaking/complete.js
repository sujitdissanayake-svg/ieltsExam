const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson } = require('../_http');
const store = require('../_store');

module.exports = async function handler(req, res) {
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

  const slotId = String(body && body.slotId ? body.slotId : '').trim();
  const email = String(body && body.email ? body.email : '').trim();
  const passwordHash = String(body && body.passwordHash ? body.passwordHash : '').trim();
  if (!slotId || !isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'slotId, email, and passwordHash are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || String(user.role || '').trim().toLowerCase() !== 'student') {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const storedHash = String(user.passwordHash || '').trim();
    if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const bookings = await store.listSpeakingBookingsByUser({
      userId: String(user.id || '').trim(),
      limit: 200,
    });
    const booking = bookings.find((item) => String(item.slotId || '') === slotId);
    if (!booking) {
      sendJson(res, 404, { error: 'Speaking booking not found.' });
      return;
    }

    if (String(booking.slotStatus || '').toLowerCase() === 'completed') {
      sendJson(res, 200, { ok: true, status: 'completed' });
      return;
    }

    if (String(booking.slotStatus || '').toLowerCase() !== 'booked') {
      sendJson(res, 409, { error: 'This speaking session is not available to join.' });
      return;
    }

    const now = Date.now();
    const startMs = Date.parse(String(booking.startTs || ''));
    const endMs = Date.parse(String(booking.endTs || ''));
    if (Number.isFinite(startMs) && now < startMs) {
      sendJson(res, 409, { error: 'Your speaking session has not started yet.' });
      return;
    }
    if (Number.isFinite(endMs) && now > endMs) {
      await store.updateSpeakingSlot({ slotId, status: 'incomplete' });
      sendJson(res, 409, { error: 'This speaking session has ended and is marked incomplete.' });
      return;
    }

    const updated = await store.updateSpeakingSlot({
      slotId,
      status: 'completed',
      zoomLink: String(booking.zoomLink || ''),
    });
    sendJson(res, 200, { ok: true, status: String(updated.status || 'completed') });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to complete speaking session.' });
  }
};
