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

  function scopedKey(baseKey) {
    return baseKey + '__' + STORAGE_CONTEXT_SUFFIX;
  }

  var ANSWERS_KEY = scopedKey('ieltsWritingAnswersV1');
  var LEGACY_ANSWERS_KEY = 'ieltsWritingAnswersV1';
  var SUBMISSION_FLAG_KEY = scopedKey('ieltsWritingResultSubmittedV1');
  var LEGACY_SUBMISSION_FLAG_KEY = 'ieltsWritingResultSubmittedV1';
  var ATTEMPT_ID_KEY = scopedKey('ieltsWritingAttemptId');
  var LEGACY_ATTEMPT_ID_KEY = 'ieltsWritingAttemptId';
  var UNIFIED_ATTEMPT_ID_KEY = scopedKey('ieltsMockAttemptId');
  var LEGACY_UNIFIED_ATTEMPT_ID_KEY = 'ieltsMockAttemptId';

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

  function readSavedAnswers() {
    var raw = safeGetStorage(ANSWERS_KEY) || safeGetStorage(LEGACY_ANSWERS_KEY);
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
    var next = {
      part1: String((answers && answers.part1) || ''),
      part2: String((answers && answers.part2) || ''),
    };
    safeSetStorage(ANSWERS_KEY, JSON.stringify(next));
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
    if (!normalizeSpaces(textarea.value) && normalizeSpaces(answers[partKey])) {
      textarea.value = answers[partKey];
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
    var existing = normalizeSpaces(
      safeGetStorage(UNIFIED_ATTEMPT_ID_KEY)
      || safeGetStorage(ATTEMPT_ID_KEY)
      || safeGetStorage(LEGACY_UNIFIED_ATTEMPT_ID_KEY)
      || safeGetStorage(LEGACY_ATTEMPT_ID_KEY)
    );
    if (existing) return existing;
    var created = String(Date.now());
    safeSetStorage(ATTEMPT_ID_KEY, created);
    safeSetStorage(UNIFIED_ATTEMPT_ID_KEY, created);
    return created;
  }

  function readTestMode() {
    var mode = normalizeSpaces(safeGetStorage('ieltsTestMode')).toLowerCase();
    if (mode === 'free' || mode === 'mock') return mode;

    var selectedPackage = normalizeSpaces(safeGetStorage('ieltsMockPackage')).toLowerCase();
    if (!selectedPackage || selectedPackage === 'free mock') return 'free';
    return 'mock';
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
    var submissionMarker = normalizeSpaces(safeGetStorage(SUBMISSION_FLAG_KEY) || safeGetStorage(LEGACY_SUBMISSION_FLAG_KEY));
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

        safeSetStorage(SUBMISSION_FLAG_KEY, String(snapshot.attemptId || '1'));
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

  bindTextareaSync();

  window.__ieltsWritingScore = {
    buildResultSnapshot: buildResultSnapshot,
    submitWritingResult: submitWritingResult,
    readSavedAnswers: readSavedAnswers,
    clearSavedAnswers: function () {
      safeRemoveStorage(ANSWERS_KEY);
      safeRemoveStorage(SUBMISSION_FLAG_KEY);
      safeRemoveStorage(ATTEMPT_ID_KEY);
      safeRemoveStorage(UNIFIED_ATTEMPT_ID_KEY);
      safeRemoveStorage(LEGACY_ANSWERS_KEY);
      safeRemoveStorage(LEGACY_SUBMISSION_FLAG_KEY);
      safeRemoveStorage(LEGACY_ATTEMPT_ID_KEY);
      safeRemoveStorage(LEGACY_UNIFIED_ATTEMPT_ID_KEY);
    },
  };
})();
