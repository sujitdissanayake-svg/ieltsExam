(function () {
  function normalizeContextToken(value, fallback) {
    var raw = String(value == null ? '' : value).trim().toLowerCase();
    if (!raw) return String(fallback || '').trim().toLowerCase();
    return raw.replace(/[^a-z0-9_-]/g, '');
  }

  function readPortalValue(key) {
    try {
      var localValue = String(window.localStorage.getItem(key) || '').trim();
      if (localValue) return localValue;
    } catch (_) {}
    try {
      return String(window.sessionStorage.getItem(key) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function buildStorageContextSuffix() {
    var params;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (_) {
      params = new URLSearchParams('');
    }

    var moduleType = normalizeContextToken(
      params.get('module') || readPortalValue('ieltsExamModule') || readPortalValue('ieltsModuleType') || 'academic',
      'academic'
    );
    var packageName = normalizeContextToken(params.get('package') || readPortalValue('ieltsMockPackage') || 'free', 'free');
    var paperNumber = normalizeContextToken(params.get('paper') || readPortalValue('ieltsMockPaper') || '0', '0');
    return moduleType + '__' + packageName + '__p' + paperNumber;
  }

  var STORAGE_CONTEXT_SUFFIX = buildStorageContextSuffix();

  function getWritingSessionId() {
    try {
      var sessionValue = String(window.sessionStorage.getItem('ieltsWritingSessionId') || '').trim();
      if (sessionValue) return sessionValue;
    } catch (_) {}

    try {
      return String(window.localStorage.getItem('ieltsWritingSessionId') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function scopedKey(baseKey) {
    var sessionId = getWritingSessionId();
    if (!sessionId) return '';
    return baseKey + '__' + STORAGE_CONTEXT_SUFFIX + '__' + sessionId;
  }

  var LEGACY_ANSWERS_KEY = 'ieltsWritingAnswersV1';
  var LEGACY_SUBMISSION_FLAG_KEY = 'ieltsWritingResultSubmittedV1';
  var LEGACY_ATTEMPT_ID_KEY = 'ieltsWritingAttemptId';
  var LEGACY_UNIFIED_ATTEMPT_ID_KEY = 'ieltsMockAttemptId';
  var DRAFT_SESSION_KEY = 'ieltsWritingDraftSessionV1__' + STORAGE_CONTEXT_SUFFIX;
  var SHARED_ATTEMPT_ID_KEY = 'ieltsMockAttemptId__' + STORAGE_CONTEXT_SUFFIX;

  function safeGetStorage(key) {
    try {
      var value = window.localStorage.getItem(key);
      return value == null ? '' : String(value);
    } catch (_) {
      return '';
    }
  }

  function safeSetStorage(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  function safeRemoveStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (_) {}
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function initializeCurrentDraftSession() {
    var sessionId = getWritingSessionId();
    if (!sessionId) return;

    var activeSessionId = normalizeSpaces(safeGetStorage(DRAFT_SESSION_KEY));
    if (activeSessionId === sessionId) return;

    safeRemoveStorage(scopedKey('ieltsWritingAnswersV1'));
    safeRemoveStorage(scopedKey('ieltsWritingResultSubmittedV1'));
    safeRemoveStorage(scopedKey('ieltsWritingAttemptId'));
    safeSetStorage(DRAFT_SESSION_KEY, sessionId);
  }

  function readSavedAnswers() {
    var raw = safeGetStorage(scopedKey('ieltsWritingAnswersV1'));
    if (!raw) return { part1: '', part2: '' };

    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { part1: '', part2: '' };
      return {
        part1: String(parsed.part1 || ''),
        part2: String(parsed.part2 || ''),
      };
    } catch (_) {
      return { part1: '', part2: '' };
    }
  }

  function writeSavedAnswers(answers) {
    var answersKey = scopedKey('ieltsWritingAnswersV1');
    if (!answersKey) return;

    var next = {
      part1: String((answers && answers.part1) || ''),
      part2: String((answers && answers.part2) || ''),
    };
    safeSetStorage(answersKey, JSON.stringify(next));
  }

  function getCurrentPartKey() {
    var path = '';
    try {
      path = String(window.location.pathname || '').toLowerCase();
    } catch (_) {
      path = '';
    }

    if (path.indexOf('part2') >= 0) return 'part2';
    return 'part1';
  }

  function countWords(value) {
    var text = normalizeSpaces(value);
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  function bindTextareaSync() {
    var textarea = document.getElementById('writingAnswer');
    if (!textarea) return;

    var partKey = getCurrentPartKey();
    var answers = readSavedAnswers();
    var savedAnswer = String(answers[partKey] || '');
    if (textarea.value !== savedAnswer) {
      textarea.value = savedAnswer;
      try {
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }

    var persist = function () {
      var next = readSavedAnswers();
      next[partKey] = String(textarea.value || '');
      writeSavedAnswers(next);
    };

    textarea.addEventListener('input', persist);
    persist();
  }

  function readStudentAuth() {
    var email = normalizeSpaces(safeGetStorage('ieltsPortalEmail'));
    var passwordHash = normalizeSpaces(safeGetStorage('ieltsPortalPasswordHash'));
    if (!email || !passwordHash) return null;
    return { email: email, passwordHash: passwordHash };
  }

  function readAttemptId() {
    var attemptIdKey = scopedKey('ieltsWritingAttemptId');
    var unifiedAttemptIdKey = scopedKey('ieltsMockAttemptId');
    if (!attemptIdKey || !unifiedAttemptIdKey) return '';

    var existing = normalizeSpaces(
      safeGetStorage(SHARED_ATTEMPT_ID_KEY)
      || safeGetStorage(unifiedAttemptIdKey)
      || safeGetStorage(attemptIdKey)
    );
    if (existing) return existing;
    var created = String(Date.now());
    safeSetStorage(attemptIdKey, created);
    safeSetStorage(unifiedAttemptIdKey, created);
    safeSetStorage(SHARED_ATTEMPT_ID_KEY, created);
    return created;
  }

  function readTestMode() {
    var mode = normalizeSpaces(safeGetStorage('ieltsTestMode')).toLowerCase();
    if (mode === 'free' || mode === 'mock') return mode;

    var selectedPackage = normalizeSpaces(safeGetStorage('ieltsMockPackage')).toLowerCase();
    if (!selectedPackage || selectedPackage === 'free mock') return 'free';
    return 'mock';
  }

  function readTestPaper() {
    return normalizeSpaces(safeGetStorage('ieltsMockPaper')) || '1';
  }

  function readAttemptType() {
    return normalizeSpaces(safeGetStorage('ieltsTestAttemptType')).toLowerCase() === 'retake' ? 'retake' : 'initial';
  }

  function readDeviceKey() {
    var storageKey = 'ieltsDeviceKeyV1';
    var existing = normalizeSpaces(safeGetStorage(storageKey));
    if (existing) return existing;

    function toBase36Hash(value) {
      var text = String(value || '');
      var hash = 2166136261;
      for (var i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return (hash >>> 0).toString(36);
    }

    var parts = [];
    try { parts.push(String(navigator.userAgent || '')); } catch (_) { parts.push(''); }
    try { parts.push(String(navigator.language || '')); } catch (_) { parts.push(''); }
    try { parts.push(String(navigator.platform || '')); } catch (_) { parts.push(''); }
    try { parts.push(String((screen && screen.width) || 0) + 'x' + String((screen && screen.height) || 0)); } catch (_) { parts.push('0x0'); }
    try { parts.push(String((screen && screen.colorDepth) || 0)); } catch (_) { parts.push('0'); }
    try { parts.push(String(navigator.hardwareConcurrency || 0)); } catch (_) { parts.push('0'); }
    try { parts.push(String(navigator.deviceMemory || 0)); } catch (_) { parts.push('0'); }
    try { parts.push(String(Intl.DateTimeFormat().resolvedOptions().timeZone || '')); } catch (_) { parts.push(''); }

    var generated = 'dv-' + toBase36Hash(parts.join('|'));
    safeSetStorage(storageKey, generated);
    return generated;
  }

  function readModuleType() {
    var type = normalizeSpaces(safeGetStorage('ieltsModuleType')).toLowerCase();
    return type === 'general' ? 'general' : 'academic';
  }

  function readTaskPrompt(partKey) {
    var selectors = [
      '[data-writing-prompt="' + partKey + '"]',
      '#' + partKey + 'Prompt',
      '.writing-task-' + partKey + ' .question-text',
      '.writing-task-' + partKey + ' .task-prompt',
      '.question-text',
      '.task-prompt'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var node = document.querySelector(selectors[i]);
        if (!node) continue;
        var text = normalizeSpaces(node.textContent || '');
        if (text) return text.slice(0, 4000);
      } catch (_) {}
    }

    return '';
  }

  function buildResultSnapshot() {
    var answers = readSavedAnswers();
    return {
      answers: answers,
      task1WordCount: countWords(answers.part1),
      task2WordCount: countWords(answers.part2),
      taskPrompts: {
        part1: readTaskPrompt('part1'),
        part2: readTaskPrompt('part2')
      },
      moduleType: readModuleType(),
      attemptId: readAttemptId(),
    };
  }

  function submitWritingResult() {
    var snapshot = buildResultSnapshot();
    var submissionFlagKey = scopedKey('ieltsWritingResultSubmittedV1');
    var submissionMarker = normalizeSpaces(safeGetStorage(submissionFlagKey));
    var alreadySubmitted = submissionMarker && submissionMarker === String(snapshot.attemptId || '');
    if (alreadySubmitted) return Promise.resolve({ ok: true, skipped: true });

    var auth = readStudentAuth();
    if (!auth) return Promise.resolve({ ok: false, skipped: true, error: 'Missing student auth.' });

    return fetch('/api/users/submit-writing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: auth.email,
        passwordHash: auth.passwordHash,
        moduleType: snapshot.moduleType,
        attemptId: snapshot.attemptId,
        testMode: readTestMode(),
        paper: readTestPaper(),
        attemptType: readAttemptType(),
        deviceKey: readDeviceKey(),
        task1Answer: snapshot.answers.part1,
        task2Answer: snapshot.answers.part2,
        task1Prompt: snapshot.taskPrompts.part1,
        task2Prompt: snapshot.taskPrompts.part2,
        task1WordCount: snapshot.task1WordCount,
        task2WordCount: snapshot.task2WordCount,
      }),
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            return { response: response, body: body };
          });
      })
      .then(function (payload) {
        if (!payload.response || !payload.response.ok || !payload.body || payload.body.ok !== true) {
          var message = (payload.body && payload.body.error) || 'Unable to submit writing result.';
          return {
            ok: false,
            error: message,
            freeMockAttempt: payload.body && payload.body.freeMockAttempt ? payload.body.freeMockAttempt : null,
            redirectToPackages: !!(payload.body && payload.body.freeMockAttempt && payload.body.freeMockAttempt.redirectToPackages),
            redirectPath: payload.body && payload.body.freeMockAttempt && payload.body.freeMockAttempt.redirectPath
              ? String(payload.body.freeMockAttempt.redirectPath)
              : ''
          };
        }

        safeSetStorage(submissionFlagKey, String(snapshot.attemptId || '1'));
        return {
          ok: true,
          result: payload.body,
          freeMockAttempt: payload.body && payload.body.freeMockAttempt ? payload.body.freeMockAttempt : null,
          redirectToPackages: !!(payload.body && payload.body.freeMockAttempt && payload.body.freeMockAttempt.redirectToPackages),
          redirectPath: payload.body && payload.body.freeMockAttempt && payload.body.freeMockAttempt.redirectPath
            ? String(payload.body.freeMockAttempt.redirectPath)
            : ''
        };
      })
      .catch(function () {
        return { ok: false, error: 'Unable to submit writing result.' };
      });
  }

  function initializeTextareaSync() {
    initializeCurrentDraftSession();
    bindTextareaSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTextareaSync, { once: true });
  } else {
    initializeTextareaSync();
  }

  window.__ieltsWritingScore = {
    buildResultSnapshot: buildResultSnapshot,
    submitWritingResult: submitWritingResult,
    readSavedAnswers: readSavedAnswers,
    clearSavedAnswers: function () {
      safeRemoveStorage(scopedKey('ieltsWritingAnswersV1'));
      safeRemoveStorage(scopedKey('ieltsWritingResultSubmittedV1'));
      safeRemoveStorage(scopedKey('ieltsWritingAttemptId'));
      safeRemoveStorage(scopedKey('ieltsMockAttemptId'));
      safeRemoveStorage(DRAFT_SESSION_KEY);
      safeRemoveStorage(LEGACY_ANSWERS_KEY);
      safeRemoveStorage(LEGACY_SUBMISSION_FLAG_KEY);
      safeRemoveStorage(LEGACY_ATTEMPT_ID_KEY);
      safeRemoveStorage(LEGACY_UNIFIED_ATTEMPT_ID_KEY);
    },
  };
})();
