const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const ANSWER_KEY = {
  1: 'FALSE',
  2: 'FALSE',
  3: 'NOT GIVEN',
  4: 'FALSE',
  5: 'NOT GIVEN',
  6: 'TRUE',
  7: 'TRUE',
  8: 'stiffness',
  9: 'grip',
  10: 'training',
  11: 'eva',
  12: 'holes',
  13: 'lacing',
  14: 'C',
  15: 'G',
  16: 'B',
  17: 'A',
  18: 'E',
  19: 'D',
  20: 'B',
  21: 'D',
  22: 'B',
  23: 'E',
  24: 'emission',
  25: 'diagrams',
  26: 'latin',
  27: 'D',
  28: 'D',
  29: 'C',
  30: 'D',
  31: 'G',
  32: 'J',
  33: 'H',
  34: 'B',
  35: 'E',
  36: 'C',
  37: 'YES',
  38: 'NOT GIVEN',
  39: 'NO',
  40: 'NO',
};

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(q, value) {
  const normalized = normalizeSpaces(value);
  if (!normalized) return '';

  if ((q >= 1 && q <= 7) || (q >= 37 && q <= 40)) {
    const upper = normalized.toUpperCase();
    if (upper === 'NG') return 'NOT GIVEN';
    return upper;
  }

  if ((q >= 14 && q <= 23) || (q >= 27 && q <= 36)) {
    return normalized.toUpperCase();
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMeaningfulAnswers(answers) {
  let count = 0;
  for (let q = 1; q <= 40; q += 1) {
    const actual = normalizeForCompare(q, answers && answers[q]);
    if (actual) count += 1;
  }
  return count;
}

function computeRawScore(answers) {
  let score = 0;
  for (let q = 1; q <= 40; q += 1) {
    const expected = ANSWER_KEY[q];
    if (!expected) continue;

    const actualNorm = normalizeForCompare(q, answers && answers[q]);
    const expectedNorm = normalizeForCompare(q, expected);
    if (actualNorm && expectedNorm && actualNorm === expectedNorm) score += 1;
  }
  return score;
}

function academicBandFromRaw(rawScore) {
  const raw = Number(rawScore) || 0;
  if (raw >= 39) return 9.0;
  if (raw >= 37) return 8.5;
  if (raw >= 35) return 8.0;
  if (raw >= 33) return 7.5;
  if (raw >= 30) return 7.0;
  if (raw >= 27) return 6.5;
  if (raw >= 23) return 6.0;
  if (raw >= 19) return 5.5;
  if (raw >= 15) return 5.0;
  if (raw >= 13) return 4.5;
  if (raw >= 10) return 4.0;
  if (raw >= 8) return 3.5;
  if (raw >= 6) return 3.0;
  return 2.5;
}

function generalBandFromRaw(rawScore) {
  const raw = Number(rawScore) || 0;
  if (raw >= 40) return 9.0;
  if (raw >= 39) return 8.5;
  if (raw >= 37) return 8.0;
  if (raw >= 36) return 7.5;
  if (raw >= 34) return 7.0;
  if (raw >= 32) return 6.5;
  if (raw >= 30) return 6.0;
  if (raw >= 27) return 5.5;
  if (raw >= 23) return 5.0;
  if (raw >= 19) return 4.5;
  if (raw >= 15) return 4.0;
  if (raw >= 12) return 3.5;
  if (raw >= 9) return 3.0;
  return 2.5;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-submit-reading',
    limit: 80,
    windowMs: 10 * 60 * 1000,
    message: 'Too many reading submissions. Please wait and try again.',
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

  const email = normalizeSpaces(body.email || '');
  const passwordHash = normalizeSpaces(body.passwordHash || '');
  const answers = body && typeof body.answers === 'object' ? body.answers : {};
  const moduleType = normalizeSpaces(body.moduleType || '').toLowerCase() === 'general' ? 'general' : 'academic';
  const attemptId = normalizeSpaces(body.attemptId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const testMode = store.normalizeTestMode(body.testMode || '') || 'mock';
  const deviceKey = store.normalizeDeviceKey(body.deviceKey || '');

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

    if (testMode === 'free') {
      const freeMockAttemptSummary = await store.getFreeMockAttemptSummary({
        userId: user.id,
        currentAttemptId: attemptId,
        deviceKey,
      });
      if (!freeMockAttemptSummary.canSubmit) {
        sendJson(res, 403, {
          error: 'Your one Free Mock Test has already been used. Please choose a paid mock test package, which includes a Speaking test.',
          freeMockAttempt: {
            limit: freeMockAttemptSummary.limit,
            usedAttempts: freeMockAttemptSummary.usedAttempts,
            remainingAttempts: freeMockAttemptSummary.remainingAttempts,
            status: 'blocked',
            redirectToPackages: true,
            redirectPath: '/#mock',
            message: 'Your one Free Mock Test has already been used. Please choose a paid mock test package, which includes a Speaking test.',
          },
        });
        return;
      }
    }

    const attemptedAnswers = countMeaningfulAnswers(answers);
    if (attemptedAnswers < 5) {
      try {
        await store.logActivity({
          userId: user.id,
          type: 'reading-result-ignored',
          meta: { reason: 'insufficient-attempt', attemptedAnswers },
        });
      } catch (_) {}

      sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'insufficient-attempt',
        message: 'Reading attempt ignored because not enough answers were completed.',
      });
      return;
    }

    const rawScore = computeRawScore(answers);
    const bandScore = moduleType === 'general' ? generalBandFromRaw(rawScore) : academicBandFromRaw(rawScore);

    const result = await store.upsertResult({
      id: attemptId ? `reading-${user.id}-${attemptId}` : '',
      userId: user.id,
      testName: 'IELTS Reading Mock Test',
      module: 'reading',
      source: 'system-auto',
      bandScore,
      rawScore,
      maxScore: 40,
      status: 'published',
      notes: `Auto-scored ${moduleType} reading result.`,
      meta: {
        moduleType,
        answers,
        answerKey: ANSWER_KEY,
        attemptId,
        testMode,
        deviceKey,
        submittedAt: new Date().toISOString(),
      },
    });

    try {
      await store.logActivity({
        userId: user.id,
        type: 'reading-result-published',
        meta: {
          rawScore,
          bandScore,
          moduleType,
        },
      });
    } catch (_) {}

    sendJson(res, 200, {
      ok: true,
      result: {
        id: result.id,
        module: result.module,
        rawScore: result.rawScore,
        maxScore: result.maxScore,
        bandScore: result.bandScore,
        status: result.status,
        updatedAt: result.updatedAt,
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to submit reading result.' });
  }
};
