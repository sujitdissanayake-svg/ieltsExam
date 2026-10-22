(function () {
  'use strict';

  var CONTEXT = 'academic__basic__p1';
  var ATTEMPT_KEY = 'ieltsListeningAttemptId__' + CONTEXT;

  function createAttemptId() {
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function readStoredValue(key) {
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

  function writeStoredValue(key, value) {
    var normalized = String(value == null ? '' : value).trim();
    try {
      if (normalized) window.localStorage.setItem(key, normalized);
      else window.localStorage.removeItem(key);
    } catch (_) {}
    try {
      if (normalized) window.sessionStorage.setItem(key, normalized);
      else window.sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function getAttemptId() {
    var existing = readStoredValue(ATTEMPT_KEY);
    if (existing) return existing;

    var created = createAttemptId();
    writeStoredValue(ATTEMPT_KEY, created);
    return created;
  }

  function startNewAttempt() {
    var attemptId = createAttemptId();
    var prefix = 'ieltsListeningAnswerV2__' + CONTEXT + '__';
    var storages = [window.localStorage, window.sessionStorage];

    for (var storageIndex = 0; storageIndex < storages.length; storageIndex++) {
      var storage = storages[storageIndex];
      var keysToRemove = [];
      try {
        for (var index = 0; index < storage.length; index++) {
          var key = storage.key(index);
          if (key && key.indexOf(prefix) === 0) keysToRemove.push(key);
        }
        for (var keyIndex = 0; keyIndex < keysToRemove.length; keyIndex++) {
          storage.removeItem(keysToRemove[keyIndex]);
        }
      } catch (_) {}
    }

    writeStoredValue(ATTEMPT_KEY, attemptId);
    return attemptId;
  }

  function getAnswerKey(questionNumber) {
    return 'ieltsListeningAnswerV2__' + CONTEXT + '__' + getAttemptId() + '__q' + questionNumber;
  }

  function getQuestionNumber(input) {
    var questionNumber = String(input && input.getAttribute('data-q') || '').trim();
    return /^(?:[1-9]|[1-3][0-9]|40)$/.test(questionNumber) ? questionNumber : '';
  }

  function saveAnswer(questionNumber, value) {
    writeStoredValue(getAnswerKey(questionNumber), value);
  }

  function persistChooseThree() {
    var selected = document.querySelectorAll('.listening-chooseThree-input:checked');
    for (var index = 0; index < 3; index++) {
      var value = selected[index] ? String(selected[index].value || '').trim() : '';
      saveAnswer(8 + index, value);
    }
  }

  function persistInput(input) {
    var questionNumber = getQuestionNumber(input);
    if (!questionNumber) return;

    var type = String(input.type || '').toLowerCase();
    if (type === 'checkbox' && input.classList.contains('listening-chooseThree-input')) {
      persistChooseThree();
      return;
    }
    if (type === 'radio' && !input.checked) return;

    saveAnswer(questionNumber, input.value);
  }

  function restoreAnswers() {
    var selectedChooseThreeValues = [];
    for (var selectedIndex = 0; selectedIndex < 3; selectedIndex++) {
      var selectedValue = readStoredValue(getAnswerKey(8 + selectedIndex));
      if (selectedValue) selectedChooseThreeValues.push(selectedValue);
    }

    var inputs = document.querySelectorAll('input[data-q]');
    for (var index = 0; index < inputs.length; index++) {
      var input = inputs[index];
      var questionNumber = getQuestionNumber(input);
      if (!questionNumber) continue;

      var type = String(input.type || '').toLowerCase();
      if (type === 'checkbox' && input.classList.contains('listening-chooseThree-input')) {
        input.checked = selectedChooseThreeValues.indexOf(String(input.value || '').trim()) >= 0;
        var item = input.closest('.listening-chooseThree-item');
        if (item) item.classList.toggle('is-selected', input.checked);
        continue;
      }

      var storedValue = readStoredValue(getAnswerKey(questionNumber));
      if (type === 'radio') {
        input.checked = storedValue === String(input.value || '').trim();
      } else if (type !== 'checkbox') {
        input.value = storedValue;
      }
    }

    var chooseThreeInput = document.querySelector('.listening-chooseThree-input');
    if (chooseThreeInput) {
      chooseThreeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function getAnswers() {
    var answers = {};
    for (var questionNumber = 1; questionNumber <= 40; questionNumber++) {
      var value = readStoredValue(getAnswerKey(questionNumber));
      if (value) answers[questionNumber] = value;
    }
    return answers;
  }

  document.addEventListener('input', function (event) {
    var input = event && event.target;
    if (input && input.matches && input.matches('input[data-q]')) persistInput(input);
  });

  document.addEventListener('change', function (event) {
    var input = event && event.target;
    if (input && input.matches && input.matches('input[data-q]')) persistInput(input);
  });

  window.IELTSBasicPaper1ListeningScore = {
    getAnswers: getAnswers,
    restoreAnswers: restoreAnswers,
    startNewAttempt: startNewAttempt,
  };

  restoreAnswers();
})();
