const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const WRITING_RELEASE_DELAY_MS = 12 * 60 * 60 * 1000;
const SPEAKING_SLOTS_BY_PACKAGE = {
  Lite: 1,
  Basic: 3,
  Standard: 6,
  Pro: 10,
};

function normalizePackageName(value) {
  const raw = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(SPEAKING_SLOTS_BY_PACKAGE, raw) ? raw : '';
}

function resolveLatestPaidPackage(payments) {
  const list = Array.isArray(payments) ? payments.slice() : [];
  if (!list.length) return '';

  list.sort((left, right) => {
    const leftTime = Date.parse(String((left && left.createdAt) || ''));
    const rightTime = Date.parse(String((right && right.createdAt) || ''));
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRight - safeLeft;
  });

  for (const payment of list) {
    const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
    const pkg = normalizePackageName(meta.package || '');
    if (pkg) return pkg;
  }

  return '';
}

function computeOverallBand(latestModuleScores) {
  const scores = Object.values(latestModuleScores || {}).filter((value) => Number.isFinite(Number(value)));
  if (!scores.length) return null;

  const average = scores.reduce((sum, value) => sum + Number(value), 0) / scores.length;
  return Math.round(average * 2) / 2;
}

function resolveWritingReleaseAt(result) {
  const meta = result && result.meta && typeof result.meta === 'object' ? result.meta : {};
  const releaseAtMeta = String(meta.releaseAt || '').trim();
  const releaseAtFromMeta = Date.parse(releaseAtMeta);
  if (Number.isFinite(releaseAtFromMeta)) return releaseAtFromMeta;

  const createdAt = String((result && (result.createdAt || result.updatedAt)) || '').trim();
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  return createdAtMs + WRITING_RELEASE_DELAY_MS;
}

function isScoreReleasedForPortal(result, nowMs) {
  const moduleName = String((result && result.module) || '').trim().toLowerCase();
  if (moduleName !== 'writing') return true;

  const releaseAtMs = resolveWritingReleaseAt(result);
  if (!Number.isFinite(releaseAtMs)) return false;
  return nowMs >= releaseAtMs;
}

function isVerifiedPaidPayment(payment) {
  if (!payment || String(payment.status || '').toLowerCase() !== 'paid') return false;

  const method = String(payment.method || '').trim().toLowerCase();
  const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
  const stripeSessionId = String(meta.stripeSessionId || meta.sessionId || '').trim();
  const sessionLinked = meta.sessionLinked === true || String(meta.sessionLinked || '').trim().toLowerCase() === 'true';

  // Stripe-backed paid entries must carry a linked session.
  if (method === 'stripe') {
    return !!stripeSessionId || sessionLinked;
  }

  // Manual/admin paid entries are considered valid.
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-live-overview',
    limit: 60,
    windowMs: 10 * 60 * 1000,
    message: 'Too many requests. Please wait and try again.',
  })) {
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
  const passwordHash = String(body.passwordHash || '').trim();

  if (!isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  try {
    const user = await store.getUserByEmail(email);
    if (!user || user.role !== 'student') {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const storedHash = String(user.passwordHash || '').trim();
    if (!storedHash || !timingSafeEqualText(storedHash, passwordHash)) {
      sendJson(res, 401, { error: 'Invalid credentials.' });
      return;
    }

    const [payments, results, activities, speakingBookings] = await Promise.all([
      store.listPayments({ limit: 500 }),
      store.listResults({ userId: user.id, limit: 200 }),
      store.listActivities({ userId: user.id, limit: 50 }),
      store.listSpeakingBookingsByUser({ userId: user.id, limit: 200 }),
    ]);

    const studentPayments = payments.filter((payment) => String(payment.userId || '') === String(user.id));
    const studentResults = results.filter((result) => String(result.userId || '') === String(user.id));
    const nowMs = Date.now();
    const writingPendingReleaseCount = studentResults.filter((result) => !isScoreReleasedForPortal(result, nowMs)).length;
    const portalVisibleResults = studentResults.map((result) => {
      const released = isScoreReleasedForPortal(result, nowMs);
      if (released) return result;

      const releaseAtMs = resolveWritingReleaseAt(result);
      const releaseAtIso = Number.isFinite(releaseAtMs) ? new Date(releaseAtMs).toISOString() : '';
      return {
        ...result,
        bandScore: null,
        status: 'pending-release',
        meta: {
          ...(result.meta && typeof result.meta === 'object' ? result.meta : {}),
          releaseAt: releaseAtIso,
        },
      };
    });

    const latestModuleScores = {};
    portalVisibleResults.forEach((result) => {
      const moduleName = String(result.module || '').trim().toLowerCase();
      if (!moduleName || result.bandScore == null) return;

      const previous = latestModuleScores[moduleName];
      const resultTimestamp = String(result.updatedAt || result.createdAt || '');
      const previousTimestamp = previous ? String(previous.updatedAt || previous.createdAt || '') : '';
      if (!previous || previousTimestamp.localeCompare(resultTimestamp) < 0) {
        latestModuleScores[moduleName] = result;
      }
    });

    const summarizedModuleScores = Object.keys(latestModuleScores).reduce((accumulator, moduleName) => {
      accumulator[moduleName] = Number(latestModuleScores[moduleName].bandScore);
      return accumulator;
    }, {});

    const verifiedPaidPayments = studentPayments.filter(isVerifiedPaidPayment);
    const latestPaidPackage = resolveLatestPaidPackage(verifiedPaidPayments);
    const speakingSlotsAllocated = latestPaidPackage ? Number(SPEAKING_SLOTS_BY_PACKAGE[latestPaidPackage] || 0) : 0;
    const speakingSlotsBooked = speakingBookings.length;
    const speakingSlotsCompleted = speakingBookings.filter((booking) => String((booking && booking.slotStatus) || '').toLowerCase() === 'completed').length;
    const speakingSlotsRemaining = Math.max(0, speakingSlotsAllocated - speakingSlotsCompleted);
    const paidMockTestsPurchased = verifiedPaidPayments.length;
    const completedMockTests = portalVisibleResults.filter((result) => result.bandScore != null).length;
    const notices = [];

    if (!paidMockTestsPurchased) notices.push('No paid mock tests recorded yet.');
    if (!studentResults.length) notices.push('No published live results yet.');
    if (writingPendingReleaseCount > 0) notices.push('Writing score will be published 12 hours after test completion.');
    if (paidMockTestsPurchased > 0 && speakingSlotsAllocated > 0 && speakingSlotsBooked === 0) notices.push('No speaking sessions have been booked yet.');

    sendJson(res, 200, {
      ok: true,
      overview: {
        profile: {
          id: user.id,
          name: user.name || '',
          email: user.email,
          whatsapp: user.whatsapp || '',
          dob: user.dob || '',
          candidateNumber: Number(user.candidateNumber) || 0,
          targetBandScore: Number(user.targetBandScore) || 0,
          createdAt: user.createdAt || '',
          lastActivityAt: activities[0] ? String(activities[0].createdAt || '') : String(user.createdAt || ''),
        },
        progress: {
          paidMockTestsPurchased,
          completedMockTests,
          remainingMockTests: Math.max(0, paidMockTestsPurchased - completedMockTests),
          speakingPackage: latestPaidPackage || '',
          speakingSlotsAllocated,
          speakingSlotsBooked,
          speakingSlotsCompleted,
          speakingSlotsRemaining,
          overallBand: computeOverallBand(summarizedModuleScores),
          latestModuleScores: summarizedModuleScores,
        },
        payments: studentPayments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          createdAt: payment.createdAt,
          method: payment.method,
          status: payment.status,
          package: payment && payment.meta && typeof payment.meta === 'object' ? String(payment.meta.package || '') : '',
          verified: isVerifiedPaidPayment(payment),
        })),
        results: portalVisibleResults.map((result) => ({
          id: result.id,
          module: result.module,
          bandScore: result.bandScore,
          status: result.status,
          releaseAt: result.meta && typeof result.meta === 'object' ? (result.meta.releaseAt || '') : '',
          testMode: result.meta && typeof result.meta === 'object' ? (result.meta.testMode || '') : '',
          attemptId: result.meta && typeof result.meta === 'object' ? (result.meta.attemptId || '') : '',
          updatedAt: result.updatedAt,
          createdAt: result.createdAt,
        })),
        activities: activities.map((activity) => ({
          id: activity.id,
          type: activity.type,
          createdAt: activity.createdAt,
          meta: activity.meta || {},
        })),
        speakingAvailability: speakingBookings
          .filter((booking) => String((booking && booking.slotStatus) || '').toLowerCase() !== 'completed')
          .map((booking) => ({
            id: booking.slotId || booking.id,
            examinerName: booking.examinerName || '',
            startTs: booking.startTs || '',
            endTs: booking.endTs || '',
            durationMinutes: Number(booking.durationMinutes) || 0,
            status: booking.slotStatus || 'booked',
          })),
        speakingBookings: speakingBookings.map((booking) => ({
          id: booking.id,
          slotId: booking.slotId,
          packageName: booking.packageName || '',
          examinerName: booking.examinerName || '',
          examinerEmail: booking.examinerEmail || '',
          startTs: booking.startTs || '',
          endTs: booking.endTs || '',
          durationMinutes: Number(booking.durationMinutes) || 0,
          status: booking.slotStatus || 'unknown',
          bookedAt: booking.bookedAt || '',
          zoomLink: booking.zoomLink || '',
        })),
        notices,
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to load live overview.' });
  }
};