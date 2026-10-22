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

  var ANSWERS_KEY = scopedKey('ieltsReadingAnswersV1');
  var LEGACY_ANSWERS_KEY = 'ieltsReadingAnswersV1';
  var DRAFT_SESSION_KEY = scopedKey('ieltsReadingDraftSessionV1');
  var SUBMISSION_FLAG_KEY = scopedKey('ieltsReadingResultSubmittedV1');
  var LEGACY_SUBMISSION_FLAG_KEY = 'ieltsReadingResultSubmittedV1';
  var ATTEMPT_ID_KEY = scopedKey('ieltsReadingAttemptId');
  var LEGACY_ATTEMPT_ID_KEY = 'ieltsReadingAttemptId';
  var UNIFIED_ATTEMPT_ID_KEY = scopedKey('ieltsMockAttemptId');
  var LEGACY_UNIFIED_ATTEMPT_ID_KEY = 'ieltsMockAttemptId';

  var ANSWER_KEY = {
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
    40: 'NO'
  };

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

  function readSavedAnswers() {
    var raw = safeGetStorage(ANSWERS_KEY);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      return parsed;
    } catch (_) {
      return {};
    }
  }

  function writeSavedAnswers(answers) {
    var payload = answers && typeof answers === 'object' ? answers : {};
    safeSetStorage(ANSWERS_KEY, JSON.stringify(payload));
  }

  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeForCompare(q, value) {
    var normalized = normalizeSpaces(value);
    if (!normalized) return '';

    if (q >= 37 && q <= 40) {
      var upper = normalized.toUpperCase();
      if (upper === 'NG') return 'NOT GIVEN';
      return upper;
    }

    if ((q >= 14 && q <= 23) || (q >= 27 && q <= 36)) {
      return normalized.toUpperCase();
    }

    // Word answers: lowercase + remove punctuation for robust matching.
    return normalized
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function gatherAnswersFromDom() {
    var merged = readSavedAnswers();

    try {
      var radios = document.querySelectorAll('input[type="radio"][name^="reading-q"]:checked');
      for (var i = 0; i < radios.length; i++) {
        var radio = radios[i];
        if (!radio) continue;
        var name = String(radio.name || '');
        var match = /^reading-q(\d{1,2})$/.exec(name);
        if (!match) continue;
        var q = Number(match[1]);
        if (!(q >= 1 && q <= 40)) continue;
        merged[q] = normalizeSpaces(radio.value || '');
      }
    } catch (_) {}

    try {
      var textLike = document.querySelectorAll('input[id^="reading-a"][data-q]');
      for (var j = 0; j < textLike.length; j++) {
        var input = textLike[j];
        if (!input) continue;
        var qRaw = String(input.getAttribute('data-q') || '').trim();
        var qNum = Number(qRaw);
        if (!(qNum >= 1 && qNum <= 40)) continue;
        var value = normalizeSpaces(input.value || '');
        if (value) merged[qNum] = value;
        else delete merged[qNum];
      }
    } catch (_) {}

    return merged;
  }

  function saveAnswersFromDom() {
    writeSavedAnswers(gatherAnswersFromDom());
  }

  function initializeDraftSession() {
    if (safeGetStorage(DRAFT_SESSION_KEY)) return;

    // A draft without a current test-start marker predates this attempt.
    safeRemoveStorage(ANSWERS_KEY);
    safeSetStorage(DRAFT_SESSION_KEY, String(Date.now()));
  }

  function restoreCustomAnswers(saved) {
    function restoreCheckboxGroup(selector, questions) {
      try {
        var selected = {};
        for (var questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
          var question = questions[questionIndex];
          var selectedAnswer = normalizeSpaces(saved[question] || '').toUpperCase();
          if (selectedAnswer) selected[selectedAnswer] = true;
        }

        var inputs = document.querySelectorAll(selector);
        for (var inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
          var input = inputs[inputIndex];
          input.checked = !!selected[normalizeSpaces(input.value || '').toUpperCase()];
        }
      } catch (_) {}
    }

    restoreCheckboxGroup('input.reading-chooseTwo-input[type="checkbox"]', [20, 21]);
    restoreCheckboxGroup('input.reading-chooseTwo22-input[type="checkbox"]', [22, 23]);
  }

  function restoreAnswersToDom() {
    var saved = readSavedAnswers();
    var keys = Object.keys(saved || {});

    try {
      var answerRadios = document.querySelectorAll('input[type="radio"][name^="reading-q"]');
      for (var radioIndex = 0; radioIndex < answerRadios.length; radioIndex++) {
        var answerRadio = answerRadios[radioIndex];
        if (!answerRadio) continue;

        var radioMatch = /^reading-q(\d{1,2})$/.exec(String(answerRadio.name || ''));
        if (!radioMatch) continue;

        var radioQuestion = Number(radioMatch[1]);
        if (!(radioQuestion >= 1 && radioQuestion <= 40)) continue;
        if (!normalizeSpaces(saved[radioQuestion] || '')) answerRadio.checked = false;
      }
    } catch (_) {}

    for (var i = 0; i < keys.length; i++) {
      var qNum = Number(keys[i]);
      if (!(qNum >= 1 && qNum <= 40)) continue;
      var value = normalizeSpaces(saved[qNum] || '');
      if (!value) continue;

      try {
        var name = 'reading-q' + String(qNum);
        var radios = document.querySelectorAll('input[type="radio"][name="' + name + '"]');
        for (var r = 0; r < radios.length; r++) {
          var radio = radios[r];
          if (!radio) continue;
          if (String(radio.value || '').toUpperCase() === value.toUpperCase()) {
            radio.checked = true;
          }
        }
      } catch (_) {}

      try {
        var inputEl = document.getElementById('reading-a' + String(qNum));
        if (inputEl && !String(inputEl.value || '').trim()) {
          inputEl.value = value;
        }
      } catch (_) {}
    }

    restoreComplexAnswerWidgets(saved);
    restoreCustomAnswers(saved);
  }

  function restoreComplexAnswerWidgets(saved) {
    try {
      var checkboxes = document.querySelectorAll('input[type="checkbox"][name^="reading-q"]');
      for (var checkboxIndex = 0; checkboxIndex < checkboxes.length; checkboxIndex++) {
        var checkbox = checkboxes[checkboxIndex];
        var checkboxMatch = /^reading-q(\d{1,2})(?:_(\d{1,2}))?$/.exec(String(checkbox.name || ''));
        if (!checkboxMatch) continue;

        var selectedValues = [];
        for (var groupIndex = 1; groupIndex < checkboxMatch.length; groupIndex++) {
          var groupQuestion = Number(checkboxMatch[groupIndex]);
          if (!(groupQuestion >= 1 && groupQuestion <= 40)) continue;
          var savedValue = normalizeSpaces(saved[groupQuestion] || '').toUpperCase();
          if (savedValue) selectedValues.push(savedValue);
        }

        checkbox.checked = selectedValues.indexOf(normalizeSpaces(checkbox.value || '').toUpperCase()) !== -1;
      }
    } catch (_) {}

    try {
      var matchingCards = document.querySelectorAll('.reading-matchCard[data-q]');
      for (var cardIndex = 0; cardIndex < matchingCards.length; cardIndex++) {
        var matchingCard = matchingCards[cardIndex];
        var matchingQuestion = Number(matchingCard.getAttribute('data-q'));
        var matchingAnswer = normalizeSpaces(saved[matchingQuestion] || '').toUpperCase();
        if (!(matchingQuestion >= 1 && matchingQuestion <= 40) || !/^[A-Z]$/.test(matchingAnswer)) continue;

        var matchingDropSlot = document.querySelector(
          '.reading-paragraphDropSlot[data-letter="' + matchingAnswer + '"]'
        );
        if (!matchingDropSlot || matchingDropSlot.querySelector('.reading-matchCard[data-q]')) continue;
        matchingDropSlot.appendChild(matchingCard);
      }
    } catch (_) {}

    try {
      var dragDropRoot = document.getElementById('readingDnd31_36');
      if (!dragDropRoot) return;

      for (var question = 31; question <= 36; question++) {
        var dragDropAnswer = normalizeSpaces(saved[question] || '').toUpperCase();
        if (!/^[A-Z]$/.test(dragDropAnswer)) continue;

        var blank = dragDropRoot.querySelector('.reading-dndBlankSlot[data-q="' + question + '"]');
        var card = dragDropRoot.querySelector('.reading-dndCard[data-choice="' + dragDropAnswer + '"]');
        if (!blank || !card || blank.querySelector('.reading-dndCard')) continue;

        blank.appendChild(card);
        card.setAttribute('data-assigned-q', String(question));
      }
    } catch (_) {}
  }

  function computeRawScore(answers) {
    var score = 0;
    for (var q = 1; q <= 40; q++) {
      var expected = ANSWER_KEY[q];
      if (!expected) continue;
      var actualNorm = normalizeForCompare(q, answers && answers[q]);
      var expectedNorm = normalizeForCompare(q, expected);
      if (actualNorm && expectedNorm && actualNorm === expectedNorm) score += 1;
    }
    return score;
  }

  function academicBandFromRaw(rawScore) {
    var raw = Number(rawScore) || 0;
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
    var raw = Number(rawScore) || 0;
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

  function readModuleType() {
    var raw = normalizeSpaces(safeGetStorage('ieltsExamModule')).toLowerCase();
    if (raw === 'general') return 'general';
    return 'academic';
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

  function buildResultSnapshot() {
    var answers = gatherAnswersFromDom();
    writeSavedAnswers(answers);

    var rawScore = computeRawScore(answers);
    var moduleType = readModuleType();
    var bandScore = moduleType === 'general' ? generalBandFromRaw(rawScore) : academicBandFromRaw(rawScore);

    return {
      answers: answers,
      rawScore: rawScore,
      maxScore: 40,
      bandScore: bandScore,
      moduleType: moduleType,
      attemptId: readAttemptId()
    };
  }

  function submitReadingResult() {
    var snapshot = buildResultSnapshot();
    var submissionMarker = normalizeSpaces(safeGetStorage(SUBMISSION_FLAG_KEY) || safeGetStorage(LEGACY_SUBMISSION_FLAG_KEY));
    var alreadySubmitted = submissionMarker && submissionMarker === String(snapshot.attemptId || '');
    if (alreadySubmitted) {
      return Promise.resolve({ ok: true, skipped: true });
    }

    var auth = readStudentAuth();
    if (!auth) {
      return Promise.resolve({ ok: false, skipped: true, error: 'Missing student auth.' });
    }

    return fetch('/api/users/submit-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: auth.email,
        passwordHash: auth.passwordHash,
        answers: snapshot.answers,
        moduleType: snapshot.moduleType,
        attemptId: snapshot.attemptId,
        testMode: readTestMode(),
        deviceKey: readDeviceKey()
      })
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: response.ok, data: data };
          });
      })
      .then(function (result) {
        if (result.ok) {
          safeSetStorage(SUBMISSION_FLAG_KEY, String(snapshot.attemptId || '1'));
          return {
            ok: true,
            result: result.data,
            freeMockAttempt: result.data && result.data.freeMockAttempt ? result.data.freeMockAttempt : null,
            redirectToPackages: !!(result.data && result.data.freeMockAttempt && result.data.freeMockAttempt.redirectToPackages),
            redirectPath: result.data && result.data.freeMockAttempt && result.data.freeMockAttempt.redirectPath
              ? String(result.data.freeMockAttempt.redirectPath)
              : ''
          };
        }
        var errorMessage = result && result.data && (result.data.error || result.data.message)
          ? String(result.data.error || result.data.message)
          : 'Unable to submit reading result.';
        return {
          ok: false,
          error: errorMessage,
          freeMockAttempt: result.data && result.data.freeMockAttempt ? result.data.freeMockAttempt : null,
          redirectToPackages: !!(result.data && result.data.freeMockAttempt && result.data.freeMockAttempt.redirectToPackages),
          redirectPath: result.data && result.data.freeMockAttempt && result.data.freeMockAttempt.redirectPath
            ? String(result.data.freeMockAttempt.redirectPath)
            : ''
        };
      })
      .catch(function () {
        return { ok: false, error: 'Unable to submit reading result.' };
      });
  }

  function installPasteGuard() {
    var answerSelector = 'input[id^="reading-a"][data-q]:not([type="hidden"])';
    var lastWarningAt = 0;

    function showCheatingWarning() {
      var now = Date.now();
      if (now - lastWarningAt < 1500) return;
      lastWarningAt = now;
      try {
        window.alert('Cheating is punishable.');
      } catch (_) {}
    }

    function findAnswerField(target) {
      if (!target || !target.closest) return null;
      return target.closest(answerSelector);
    }

    function stopIfAnswerField(event, suppressWarning) {
      if (!event) return;
      if (!findAnswerField(event.target)) return;
      try {
        event.preventDefault();
      } catch (_) {}
      if (!suppressWarning) showCheatingWarning();
    }

    try {
      document.addEventListener('paste', function (event) {
        stopIfAnswerField(event, false);
      }, true);

      document.addEventListener('drop', function (event) {
        stopIfAnswerField(event, true);
      }, true);

      document.addEventListener(
        'beforeinput',
        function (event) {
          var inputType = String((event && event.inputType) || '');
          if (inputType === 'insertFromPaste') {
            stopIfAnswerField(event, false);
            return;
          }
          if (inputType === 'insertFromDrop') {
            stopIfAnswerField(event, true);
          }
        },
        true
      );

      document.addEventListener(
        'keydown',
        function (event) {
          if (!event) return;
          if (!findAnswerField(event.target)) return;

          var key = String(event.key || '').toLowerCase();
          var isCtrlOrMeta = !!event.ctrlKey || !!event.metaKey;
          var isPasteShortcut = isCtrlOrMeta && key === 'v';
          var isShiftInsert = !!event.shiftKey && key === 'insert';
          if (isPasteShortcut || isShiftInsert) {
            try {
              event.preventDefault();
            } catch (_) {}
          }
        },
        true
      );
    } catch (_) {}
  }

  function installAutosave() {
    try {
      function queueAnswerSave() {
        saveAnswersFromDom();
        window.setTimeout(saveAnswersFromDom, 0);
      }

      function saveAnswerChange(event) {
        var target = event && event.target;
        if (!target || !target.matches) return;
        if (target.matches('input[name^="reading-q"], input[id^="reading-a"][data-q]')) queueAnswerSave();
      }

      function saveAnswerInput(event) {
        var target = event && event.target;
        if (!target || !target.matches) return;
        if (target.matches('input[id^="reading-a"][data-q]')) queueAnswerSave();
      }

      // The test UI handles its own answer events. Capture them before any
      // page-level handler can stop propagation during navigation.
      document.addEventListener('change', saveAnswerChange, true);
      document.addEventListener('input', saveAnswerInput, true);

      document.addEventListener('drop', queueAnswerSave, true);
      document.addEventListener('dragend', queueAnswerSave, true);

      window.addEventListener('pagehide', saveAnswersFromDom);
      window.addEventListener('beforeunload', saveAnswersFromDom);
    } catch (_) {}
  }

  function blockAnswerSuggestions() {
    try {
      var answerRadios = document.querySelectorAll('input[type="radio"][name^="reading-q"]');
      for (var radioIndex = 0; radioIndex < answerRadios.length; radioIndex++) {
        answerRadios[radioIndex].setAttribute('autocomplete', 'off');
      }

      var answerInputs = document.querySelectorAll('input[id^="reading-a"][data-q]:not([type="hidden"])');
      for (var i = 0; i < answerInputs.length; i += 1) {
        var input = answerInputs[i];
        if (!input) continue;

        // Prevent browser history/autofill suggestions from previous attempts.
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'none');
        input.setAttribute('spellcheck', 'false');

        var q = String(input.getAttribute('data-q') || '').trim();
        if (q) input.setAttribute('name', 'reading-answer-q' + q + '-nohistory');
      }
    } catch (_) {}
  }

  function clearStaleSubmittedAnswers() {
    var marker = normalizeSpaces(safeGetStorage(SUBMISSION_FLAG_KEY) || safeGetStorage(LEGACY_SUBMISSION_FLAG_KEY));
    if (!marker) return;

    // If a previous attempt was already submitted, never pre-load old answers.
    safeRemoveStorage(ANSWERS_KEY);
    safeRemoveStorage(SUBMISSION_FLAG_KEY);
    safeRemoveStorage(ATTEMPT_ID_KEY);
    safeRemoveStorage(UNIFIED_ATTEMPT_ID_KEY);
    safeRemoveStorage(DRAFT_SESSION_KEY);
    safeRemoveStorage(LEGACY_ANSWERS_KEY);
    safeRemoveStorage(LEGACY_SUBMISSION_FLAG_KEY);
    safeRemoveStorage(LEGACY_ATTEMPT_ID_KEY);
    safeRemoveStorage(LEGACY_UNIFIED_ATTEMPT_ID_KEY);
  }

  function init() {
    initializeDraftSession();
    clearStaleSubmittedAnswers();
    restoreAnswersToDom();
    blockAnswerSuggestions();
    saveAnswersFromDom();
    installPasteGuard();
    installAutosave();
  }

  window.__ieltsReadingScore = {
    gatherAnswersFromDom: gatherAnswersFromDom,
    computeRawScore: computeRawScore,
    academicBandFromRaw: academicBandFromRaw,
    generalBandFromRaw: generalBandFromRaw,
    buildResultSnapshot: buildResultSnapshot,
    submitReadingResult: submitReadingResult,
    clearSavedAnswers: function () {
      safeRemoveStorage(ANSWERS_KEY);
      safeRemoveStorage(SUBMISSION_FLAG_KEY);
      safeRemoveStorage(ATTEMPT_ID_KEY);
      safeRemoveStorage(UNIFIED_ATTEMPT_ID_KEY);
      safeRemoveStorage(DRAFT_SESSION_KEY);
      safeRemoveStorage(LEGACY_ANSWERS_KEY);
      safeRemoveStorage(LEGACY_SUBMISSION_FLAG_KEY);
      safeRemoveStorage(LEGACY_ATTEMPT_ID_KEY);
      safeRemoveStorage(LEGACY_UNIFIED_ATTEMPT_ID_KEY);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
