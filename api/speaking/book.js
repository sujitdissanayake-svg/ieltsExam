const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson } = require('../_http');
const store = require('../_store');

function normalizeSlot(slot) {
  if (!slot || typeof slot !== 'object') return null;
  return {
    id: slot.id,
    examinerId: slot.examinerId,
    start: slot.start || slot.startTs,
    end: slot.end || slot.endTs,
    durationMinutes: Number(slot.durationMinutes) || 0,
    status: String(slot.status || '').trim().toLowerCase() || 'pending',
    zoomLink: slot.zoomLink || '',
    sessionNote: slot.sessionNote || '',
  };
}

function normalizeBooking(booking) {
  if (!booking || typeof booking !== 'object') return null;
  return {
    id: booking.id,
    userId: booking.userId,
    slotId: booking.slotId,
    packageName: booking.packageName || '',
    bookedAt: booking.bookedAt || booking.createdAt || '',
  };
}

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
  const packageName = String(body && body.packageName ? body.packageName : '').trim();
  const sessionId = String(body && body.sessionId ? body.sessionId : '').trim();

  if (!slotId || !isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'slotId, email, and passwordHash are required.' });
    return;
  }

  let user;
  try {
    user = await store.getUserByEmail(email);
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to validate student.' });
    return;
  }

  if (!user || String(user.role || '').trim().toLowerCase() !== 'student') {
    sendJson(res, 401, { error: 'Invalid credentials.' });
    return;
  }

  const storedHash = String(user.passwordHash || '').trim();
  if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
    sendJson(res, 401, { error: 'Invalid credentials.' });
    return;
  }

  if (packageName === '01 Test') {
    try {
      const [results, bookings] = await Promise.all([
        store.listResults({ userId: String(user.id || '').trim(), limit: 200 }),
        store.listSpeakingBookingsByUser({ userId: String(user.id || '').trim(), limit: 200 }),
      ]);
      const completedWriting = results.some((result) =>
        String(result && result.module || '').trim().toLowerCase() === 'writing' &&
        String(result && result.meta && result.meta.testMode || '').trim().toLowerCase() === 'free'
      );
      const existing01TestBooking = bookings.some((booking) => String(booking && booking.packageName || '').trim() === '01 Test');

      if (!completedWriting) {
        sendJson(res, 403, { error: 'Complete the 01 Test writing module before booking a speaking session.' });
        return;
      }
      if (existing01TestBooking) {
        sendJson(res, 409, { error: 'Your 01 Test speaking session has already been booked.' });
        return;
      }
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to validate 01 Test speaking eligibility.' });
      return;
    }
  }

  if (packageName !== '01 Test') {
    try {
      const bookings = await store.listSpeakingBookingsByUser({
        userId: String(user.id || '').trim(),
        limit: 200,
      });
      const existingBooking = bookings.some((booking) => String(booking && booking.packageName || '').trim() === packageName);
      if (existingBooking) {
        sendJson(res, 409, { error: 'Your speaking session for this test has already been booked.' });
        return;
      }
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to validate speaking booking eligibility.' });
      return;
    }
  }

  try {
    const result = await store.bookSpeakingSlot({
      slotId,
      userId: String(user.id || '').trim(),
      packageName,
      meta: {
        source: 'speaking-booking',
        sessionId,
      },
    });

    sendJson(res, 200, {
      ok: true,
      slot: normalizeSlot(result && result.slot),
      booking: normalizeBooking(result && result.booking),
    });
  } catch (err) {
    const message = err && err.message ? String(err.message) : 'Unable to book speaking slot.';
    if (message === 'Slot not found.') {
      sendJson(res, 404, { error: message });
      return;
    }
    if (message === 'Slot is no longer available.') {
      sendJson(res, 409, { error: message });
      return;
    }
    if (message === 'Missing userId.') {
      sendJson(res, 400, { error: message });
      return;
    }
    sendJson(res, 500, { error: message });
  }
};
