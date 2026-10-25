const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const ANSWER_KEY = {
  1: ['animal park', 'the animal park'],
  2: ['cold and cloudy'],
  3: ['10.15 am', '10:15 am'],
  4: ['birds of prey'],
  5: ['reptile display', 'the reptile display'],
  6: ['6.30 pm', '6:30 pm'],
  7: ['chinese'],
  8: ['japanese'],
  9: ['korean', 'koreans'],
  10: ['thai'],
  11: ['B'],
  12: ['A'],
  13: ['B'],
  14: ['C'],
  15: ['A'],
  16: ['D'],
  17: ['F'],
  18: ['B'],
  19: ['C'],
  20: ['A'],
  21: ['G', 'university tour'],
  22: ['E', 'library tour'],
  23: ['C', 'computer lab visit'],
  24: ['A', 'bbq'],
  25: ['header'],
  26: ['16'],
  27: ['12'],
  28: ['single'],
  29: ['work'],
  30: ['teacher'],
  31: ['regulations'],
  32: ['short grass'],
  33: ['development'],
  34: ['passive recreation'],
  35: ['get lost'],
  36: ['industrial revolution'],
  37: ['50000', '50,000'],
  38: ['lake', 'central lake', 'the central lake'],
  39: ['refuge'],
  40: ['melbourne'],
};

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value) {
  const normalized = normalizeSpaces(value).toLowerCase();
  if (!normalized) return '';

  return normalized
    .replace(/[.]/g, '')
    .replace(/[:,]/g, '')
    .replace(/\(s\)/g, 's')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/, '')
    .trim();
}

function countMeaningfulAnswers(answers) {
  let count = 0;
  for (let q = 1; q <= 40; q += 1) {
    const actual = normalizeForCompare(answers && answers[q]);
    if (actual) count += 1;
  }
  return count;
}

function computeRawScore(answers) {
  let score = 0;

  for (let q = 1; q <= 40; q += 1) {
    if (q === 9 || q === 10) continue;

    // Questions 8-10 are one "choose three" task. Score each correct
    // selected option once, regardless of the order in which it was selected.
    if (q === 8) {
      const expected = new Set((ANSWER_KEY[8] || []).concat(ANSWER_KEY[9] || [], ANSWER_KEY[10] || []).map(normalizeForCompare));
      const selected = new Set();
      for (let selectedQuestion = 8; selectedQuestion <= 10; selectedQuestion += 1) {
        const actual = normalizeForCompare(answers && answers[selectedQuestion]);
        if (actual) selected.add(actual);
      }
      selected.forEach((actual) => {
        if (expected.has(actual)) score += 1;
      });
      continue;
    }

    const actual = normalizeForCompare(answers && answers[q]);
    if (!actual) continue;

    const expectedList = ANSWER_KEY[q] || [];
    let isCorrect = false;
    for (let i = 0; i < expectedList.length; i += 1) {
      if (actual === normalizeForCompare(expectedList[i])) {
        isCorrect = true;
        break;
      }
    }

    if (isCorrect) score += 1;
  }

  return score;
}

function listeningBandFromRaw(rawScore) {
  const raw = Number(rawScore) || 0;
  if (raw >= 39) return 9.0; // 39-40
  if (raw >= 37) return 8.5; // 37-38
  if (raw >= 35) return 8.0; // 35-36
  if (raw >= 32) return 7.5; // 32-34
  if (raw >= 30) return 7.0; // 30-31
  if (raw >= 26) return 6.5; // 26-29
  if (raw >= 23) return 6.0; // 23-25
  if (raw >= 18) return 5.5; // 18-22
  if (raw >= 16) return 5.0; // 16-17
  if (raw >= 13) return 4.5; // 13-15
  if (raw >= 10) return 4.0; // 10-12
  if (raw >= 8) return 3.5;  // 8-9
  if (raw >= 6) return 3.0;  // 6-7
  return 2.5;
}

function listeningProficiencyFromBand(bandScore) {
  const band = Number(bandScore) || 0;
  if (band >= 9.0) return 'Expert User';
  if (band >= 8.0) return 'Very Good User';
  if (band >= 7.0) return 'Good User';
  if (band >= 6.0) return 'Competent User';
  if (band >= 5.0) return 'Modest User';
  if (band >= 4.0) return 'Limited User';
  return 'Extremely Limited User';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-submit-listening',
    limit: 80,
    windowMs: 10 * 60 * 1000,
    message: 'Too many listening submissions. Please wait and try again.',
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
  const attemptId = normalizeSpaces(body.attemptId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const testMode = store.normalizeTestMode(body.testMode || '') || 'mock';
  const paper = Math.max(1, Math.min(10, Number.parseInt(body.paper, 10) || 1));
  const attemptType = String(body.attemptType || '').trim().toLowerCase() === 'retake' ? 'retake' : 'initial';
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

    var freeMockAttemptSummary = null;
    if (testMode === 'free') {
      freeMockAttemptSummary = await store.getFreeMockAttemptSummary({
        userId: user.id,
        currentAttemptId: attemptId,
        deviceKey,
      });

      if (!freeMockAttemptSummary.canSubmit) {
        sendJson(res, 403, {
          error: 'Your 01 Test has already been used. Please choose a paid mock test package, which includes a Speaking test.',
          freeMockAttempt: {
            limit: freeMockAttemptSummary.limit,
            usedAttempts: freeMockAttemptSummary.usedAttempts,
            remainingAttempts: freeMockAttemptSummary.remainingAttempts,
            status: 'blocked',
            redirectToPackages: true,
            redirectPath: '/#mock',
            message: 'Your 01 Test has already been used. Please choose a paid mock test package, which includes a Speaking test.',
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
          type: 'listening-result-ignored',
          meta: { reason: 'insufficient-attempt', attemptedAnswers },
        });
      } catch (_) {}

      sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'insufficient-attempt',
        message: 'Listening attempt ignored because not enough answers were completed.',
      });
      return;
    }

    if (testMode === 'free') {
      const claim = await store.claimFreeMockAttempt({ userId: user.id, attemptId, deviceKey });
      if (!claim.claimed) {
        sendJson(res, 403, {
          error: 'Your 01 Test has already been used. Please choose a paid mock test package, which includes a Speaking test.',
        });
        return;
      }
    }

    const rawScore = Math.min(computeRawScore(answers), attemptedAnswers);
    const bandScore = listeningBandFromRaw(rawScore);
    const proficiency = listeningProficiencyFromBand(bandScore);

    const result = await store.upsertResult({
      id: attemptId ? `listening-${user.id}-${attemptId}` : '',
      userId: user.id,
      testName: 'IELTS Listening Mock Test',
      module: 'listening',
      source: 'system-auto',
      bandScore,
      rawScore,
      maxScore: 40,
      status: 'published',
      notes: `Auto-scored listening result (${proficiency}).`,
      meta: {
        answers,
        answerKey: ANSWER_KEY,
        proficiency,
        attemptId,
        testMode,
        paper,
        attemptType,
        deviceKey,
        attemptedAnswers,
        submittedAt: new Date().toISOString(),
      },
    });

    try {
      await store.logActivity({
        userId: user.id,
        type: 'listening-result-published',
        meta: { rawScore, bandScore, proficiency },
      });
    } catch (_) {}

    var freeMockAttempt = null;
    if (testMode === 'free' && freeMockAttemptSummary) {
      var usedAfterSubmit = freeMockAttemptSummary.isCurrentAttemptKnown
        ? freeMockAttemptSummary.usedAttempts
        : (freeMockAttemptSummary.usedAttempts + 1);
      var remainingAfterSubmit = freeMockAttemptSummary.nextRemainingAfterSubmit;
      var reachedMax = remainingAfterSubmit <= 0;
      freeMockAttempt = {
        limit: freeMockAttemptSummary.limit,
        usedAttempts: usedAfterSubmit,
        remainingAttempts: remainingAfterSubmit,
        status: reachedMax ? 'max' : 'warning',
        redirectToPackages: reachedMax,
        redirectPath: '/#mock',
        message: reachedMax
          ? 'You have used the maximum 01 Test attempts. 01 Test is now blocked. Opening Mock Test.'
          : ('You have remaining ' + String(remainingAfterSubmit) + ' free attempts.'),
      };
    }

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
      freeMockAttempt,
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to submit listening result.' });
  }
};
