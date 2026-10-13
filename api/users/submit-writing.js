const { readJsonBody, timingSafeEqualText, isValidEmailBasic } = require('../_shared');
const { sendJson, enforceRateLimit } = require('../_http');
const store = require('../_store');

const WRITING_RELEASE_DELAY_MS = 12 * 60 * 60 * 1000;

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampBand(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(9, num));
}

function roundHalf(value) {
  return Math.round(clampBand(value) * 2) / 2;
}

function countWords(value) {
  const text = normalizeSpaces(value);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function uniqueWordRatio(value) {
  const text = String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const set = new Set(words);
  return set.size / words.length;
}

function sentenceCount(value) {
  const text = String(value || '');
  const sentences = text
    .split(/[.!?]+/)
    .map((entry) => normalizeSpaces(entry))
    .filter(Boolean);
  return sentences.length;
}

function paragraphCount(value) {
  const text = String(value || '');
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((entry) => normalizeSpaces(entry))
    .filter(Boolean);
  return paragraphs.length;
}

function heuristicTaskScore(answer, minWords) {
  const words = countWords(answer);
  const paragraphs = paragraphCount(answer);
  const sentences = sentenceCount(answer);
  const variety = uniqueWordRatio(answer);

  let ta = 5.0;
  if (words >= minWords) ta += 1.0;
  if (words >= minWords + 60) ta += 0.5;
  if (words < Math.round(minWords * 0.8)) ta -= 1.0;

  let cc = 5.0;
  if (paragraphs >= 2) cc += 0.5;
  if (paragraphs >= 3) cc += 0.5;
  if (sentences >= 5) cc += 0.5;

  let lr = 5.0;
  if (variety >= 0.5) lr += 0.5;
  if (variety >= 0.6) lr += 0.5;
  if (variety < 0.35) lr -= 0.5;

  let gra = 5.0;
  if (sentences >= 5) gra += 0.5;
  if (sentences >= 8) gra += 0.5;
  if (words < Math.round(minWords * 0.75)) gra -= 0.5;

  const criteria = {
    TA: roundHalf(ta),
    CC: roundHalf(cc),
    LR: roundHalf(lr),
    GRA: roundHalf(gra),
  };

  const overall = roundHalf((criteria.TA + criteria.CC + criteria.LR + criteria.GRA) / 4);

  return {
    criteria,
    overall,
    feedback: {
      strengths: [
        words >= minWords ? 'Meets minimum word requirement.' : 'Attempts to address the task prompt.',
        paragraphs >= 2 ? 'Uses paragraph structure to organize ideas.' : 'Contains understandable core ideas.',
      ],
      improvements: [
        words < minWords ? `Increase response length to at least ${minWords} words.` : 'Improve precision in vocabulary and examples.',
        'Strengthen grammar accuracy and sentence variety for higher bands.',
      ],
    },
    wordCount: words,
  };
}

function safeJsonParse(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

async function evaluateWithOpenAI({ moduleType, task1Answer, task2Answer }) {
  const apiKey = normalizeSpaces(process.env.OPENAI_API_KEY || '');
  if (!apiKey) return null;

  const model = normalizeSpaces(process.env.OPENAI_MODEL || 'gpt-4o-mini');

  const criteriaSpec = [
    'Task Achievement (TA): fulfill prompt requirements accurately and relevantly.',
    'Coherence and Cohesion (CC): logical organization, paragraphing, cohesive flow.',
    'Lexical Resource (LR): vocabulary range, precision, collocation, spelling/word formation.',
    'Grammatical Range and Accuracy (GRA): sentence variety, grammar control, punctuation.',
  ].join(' ');

  const systemPrompt = [
    'You are a strict IELTS Writing examiner.',
    'Assess Task 1 and Task 2 independently using the four IELTS criteria.',
    'Bands must be from 0.0 to 9.0 in 0.5 increments.',
    'Return JSON only with no markdown.',
  ].join(' ');

  const userPrompt = {
    testType: moduleType,
    criteria: criteriaSpec,
    requiredResponseSchema: {
      task1: {
        criteria: { TA: 'number', CC: 'number', LR: 'number', GRA: 'number' },
        overall: 'number',
        feedback: { strengths: ['string'], improvements: ['string'] },
      },
      task2: {
        criteria: { TA: 'number', CC: 'number', LR: 'number', GRA: 'number' },
        overall: 'number',
        feedback: { strengths: ['string'], improvements: ['string'] },
      },
      summary: 'string',
    },
    tasks: {
      task1: task1Answer,
      task2: task2Answer,
    },
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPrompt) },
      ],
    }),
  });

  if (!response.ok) {
    const fallbackText = await response.text().catch(() => '');
    throw new Error(`AI provider error (${response.status}): ${fallbackText || 'Unknown error.'}`);
  }

  const payload = await response.json();
  const content =
    payload &&
    payload.choices &&
    payload.choices[0] &&
    payload.choices[0].message &&
    payload.choices[0].message.content;

  return safeJsonParse(content);
}

function normalizeAiTask(task, fallback) {
  const criteria = task && task.criteria ? task.criteria : {};
  const normalizedCriteria = {
    TA: roundHalf(criteria.TA),
    CC: roundHalf(criteria.CC),
    LR: roundHalf(criteria.LR),
    GRA: roundHalf(criteria.GRA),
  };

  if (
    normalizedCriteria.TA === 0 &&
    normalizedCriteria.CC === 0 &&
    normalizedCriteria.LR === 0 &&
    normalizedCriteria.GRA === 0 &&
    fallback
  ) {
    return fallback;
  }

  const overall = roundHalf(
    Number(task && task.overall) ||
      (normalizedCriteria.TA + normalizedCriteria.CC + normalizedCriteria.LR + normalizedCriteria.GRA) / 4
  );

  return {
    criteria: normalizedCriteria,
    overall,
    feedback: {
      strengths: Array.isArray(task && task.feedback && task.feedback.strengths)
        ? task.feedback.strengths.map((entry) => normalizeSpaces(entry)).filter(Boolean).slice(0, 4)
        : fallback.feedback.strengths,
      improvements: Array.isArray(task && task.feedback && task.feedback.improvements)
        ? task.feedback.improvements.map((entry) => normalizeSpaces(entry)).filter(Boolean).slice(0, 4)
        : fallback.feedback.improvements,
    },
    wordCount: fallback.wordCount,
  };
}

function buildWritingResult({ moduleType, task1Answer, task2Answer, aiPayload }) {
  const task1Fallback = heuristicTaskScore(task1Answer, 150);
  const task2Fallback = heuristicTaskScore(task2Answer, 250);

  const task1 = normalizeAiTask(aiPayload && aiPayload.task1, task1Fallback);
  const task2 = normalizeAiTask(aiPayload && aiPayload.task2, task2Fallback);

  const writingBand = roundHalf((task1.overall + task2.overall * 2) / 3);

  return {
    writingBand,
    task1,
    task2,
    summary:
      normalizeSpaces(aiPayload && aiPayload.summary) ||
      'Writing score generated from IELTS criteria across Task Achievement, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy.',
    moduleType,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (await enforceRateLimit(req, res, {
    key: 'users-submit-writing',
    limit: 40,
    windowMs: 10 * 60 * 1000,
    message: 'Too many writing submissions. Please wait and try again.',
  })) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 256 * 1024 });
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid request.' });
    return;
  }

  const email = normalizeSpaces(body.email || '');
  const passwordHash = normalizeSpaces(body.passwordHash || '');
  const moduleType = normalizeSpaces(body.moduleType || '').toLowerCase() === 'general' ? 'general' : 'academic';
  const attemptId = normalizeSpaces(body.attemptId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const testMode = store.normalizeTestMode(body.testMode || '') || 'mock';
  const deviceKey = store.normalizeDeviceKey(body.deviceKey || '');

  const task1Answer = String(body.task1Answer || '').slice(0, 12000);
  const task2Answer = String(body.task2Answer || '').slice(0, 16000);
  const task1Prompt = String(body.task1Prompt || '').slice(0, 4000);
  const task2Prompt = String(body.task2Prompt || '').slice(0, 4000);
  const task1WordCount = countWords(task1Answer);
  const task2WordCount = countWords(task2Answer);

  if (!isValidEmailBasic(email) || !passwordHash) {
    sendJson(res, 400, { error: 'Email and password are required.' });
    return;
  }

  if (!normalizeSpaces(task1Answer) && !normalizeSpaces(task2Answer)) {
    sendJson(res, 400, { error: 'Writing answers are required.' });
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

    // Ignore near-empty attempts where the student only stayed on screen without meaningfully answering.
    if (task1WordCount < 20 && task2WordCount < 20) {
      try {
        await store.logActivity({
          userId: user.id,
          type: 'writing-result-ignored',
          meta: {
            reason: 'insufficient-attempt',
            task1WordCount,
            task2WordCount,
          },
        });
      } catch (_) {}

      sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: 'insufficient-attempt',
        message: 'Writing attempt ignored because answers were not sufficiently completed.',
        writing: {
          bandScore: null,
          pendingRelease: false,
        },
      });
      return;
    }

    let aiPayload = null;
    let aiProvider = 'heuristic-fallback';

    try {
      aiPayload = await evaluateWithOpenAI({ moduleType, task1Answer, task2Answer });
      if (aiPayload) aiProvider = 'openai';
    } catch (_) {
      aiPayload = null;
      aiProvider = 'heuristic-fallback';
    }

    const evaluated = buildWritingResult({ moduleType, task1Answer, task2Answer, aiPayload });
    const submittedAtIso = new Date().toISOString();
    const releaseAtIso = new Date(Date.parse(submittedAtIso) + WRITING_RELEASE_DELAY_MS).toISOString();

    const result = await store.upsertResult({
      id: attemptId ? `writing-${user.id}-${attemptId}` : '',
      userId: user.id,
      testName: 'IELTS Writing Mock Test',
      module: 'writing',
      source: aiProvider,
      bandScore: evaluated.writingBand,
      rawScore: null,
      maxScore: null,
      status: 'review',
      notes: 'AI-evaluated writing result queued for delayed release (12 hours).',
      meta: {
        moduleType: evaluated.moduleType,
        summary: evaluated.summary,
        task1: evaluated.task1,
        task2: evaluated.task2,
        studentAnswers: {
          task1: task1Answer,
          task2: task2Answer,
        },
        taskPrompts: {
          task1: task1Prompt,
          task2: task2Prompt,
        },
        attemptId,
        testMode,
        deviceKey,
        submittedAt: submittedAtIso,
        releaseAt: releaseAtIso,
      },
    });

    try {
      await store.logActivity({
        userId: user.id,
        type: 'writing-result-queued',
        meta: {
          bandScore: evaluated.writingBand,
          moduleType: evaluated.moduleType,
          aiProvider,
          releaseAt: releaseAtIso,
        },
      });
    } catch (_) {}

    sendJson(res, 200, {
      ok: true,
      result: {
        id: result.id,
        module: result.module,
        bandScore: null,
        status: result.status,
        updatedAt: result.updatedAt,
        releaseAt: releaseAtIso,
      },
      writing: {
        bandScore: null,
        pendingRelease: true,
        releaseAt: releaseAtIso,
        summary: 'Writing answers submitted successfully. Band score will be published in the Test Taker Portal after 12 hours.',
        aiProvider,
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err && err.message ? err.message : 'Unable to submit writing result.' });
  }
};
