(() => {
  const STORAGE_KEYS = {
    maxStage: 'ieltsStageMax',
    stageUrlPrefix: 'ieltsStageUrl_',
  };

  const usesHtmlRoutes = () => /\.html$/i.test(String(window.location.pathname || ''));

  const toPageUrl = (pageId) => {
    if (!pageId) return '';
    return usesHtmlRoutes() ? `${pageId}.html` : pageId;
  };

  const PRE_TEST_PAGES = new Set(['free-mock-test', 'ielts-academic']);

  const STAGES = [
    { id: 1, name: 'listening', match: /^ielts-listening/i, entry: 'ielts-listening-instructions' },
    { id: 2, name: 'reading', match: /^ielts-reading/i, entry: 'ielts-reading-instructions' },
    { id: 3, name: 'writing', match: /^ielts-writing/i, entry: 'ielts-writing' },
    { id: 4, name: 'speaking', match: /^ielts-speaking/i, entry: 'ielts-speaking' },
  ];

  const LISTENING_STEP_KEY = 'ieltsListeningStepMax';
  const READING_STAGE_ID = 2;
  const WRITING_STAGE_ID = 3;

  const getListeningStep = (pageId) => {
    if (!pageId) return 0;
    if (pageId === 'ielts-listening') return 1;
    if (pageId === 'ielts-listening-instructions') return 2;
    if (/^ielts-listening-test/i.test(pageId)) return 3;
    if (pageId === 'ielts-listening-submission') return 4;
    if (pageId === 'ielts-listening-ended') return 5;
    return 0;
  };

  const getListeningStepMax = () => {
    try {
      const raw = window.sessionStorage.getItem(LISTENING_STEP_KEY);
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const setListeningStepMax = (value) => {
    try {
      window.sessionStorage.setItem(LISTENING_STEP_KEY, String(value));
    } catch {
      // ignore
    }
  };

  // Listening is effectively a single-page test (questions are hash-based),
  // so blocking the browser Back button here will not break in-test navigation.
  const BACK_TRAP_STAGE_IDS = new Set([1]);
  const BACK_TRAP_DEPTH = 4;
  const LISTENING_TEST_BACK_TRAP_DEPTH = 200;
  const READING_TEST_BACK_TRAP_DEPTH = 160;
  const WRITING_TEST_BACK_TRAP_DEPTH = 160;

  const getFileName = () => {
    const path = String(window.location.pathname || '');
    const parts = path.split('/').filter(Boolean);
    const last = (parts[parts.length - 1] || '').trim();
    return last.replace(/\.html$/i, '');
  };

  const getStageIdForPage = (fileName) => {
    for (const stage of STAGES) {
      if (stage.match.test(fileName)) return stage.id;
    }
    return 0;
  };

  const installClipboardGuard = (fileName) => {
    if (!/^ielts-/i.test(String(fileName || ''))) return;
    if (window.__ieltsClipboardGuardInstalled === true) return;
    window.__ieltsClipboardGuardInstalled = true;

    const stopClipboardAction = (event) => {
      if (!event) return;
      try {
        event.preventDefault();
      } catch {
        // ignore
      }
      try {
        event.stopPropagation();
      } catch {
        // ignore
      }
    };

    // Keep selection/highlight available but block all clipboard transfer.
    document.addEventListener('copy', stopClipboardAction, true);
    document.addEventListener('cut', stopClipboardAction, true);
    document.addEventListener('paste', stopClipboardAction, true);

    document.addEventListener(
      'beforeinput',
      (event) => {
        const inputType = String((event && event.inputType) || '');
        if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
          stopClipboardAction(event);
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (!event) return;
        const key = String(event.key || '').toLowerCase();
        const isCtrlOrMeta = !!event.ctrlKey || !!event.metaKey;
        const isCopyCutPasteShortcut = isCtrlOrMeta && (key === 'c' || key === 'x' || key === 'v');
        const isShiftInsert = !!event.shiftKey && key === 'insert';
        if (isCopyCutPasteShortcut || isShiftInsert) {
          stopClipboardAction(event);
        }
      },
      true
    );
  };

  const blockAnswerSuggestions = (fileName) => {
    if (!/^ielts-(listening|reading|writing)-test/i.test(String(fileName || ''))) return;

    const answerInputs = document.querySelectorAll('input[type="text"][data-q], textarea[data-q]');
    for (const input of answerInputs) {
      const question = String(input.getAttribute('data-q') || '').trim();
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'none');
      input.setAttribute('spellcheck', 'false');
      if (question) input.setAttribute('name', `ielts-answer-q${question}-nohistory`);
    }
  };

  const getPortalEmail = () => {
    try {
      const email = String(window.localStorage.getItem('ieltsPortalEmail') || '').trim();
      return email;
    } catch {
      return '';
    }
  };

  const logActivity = (type, meta) => {
    try {
      const email = getPortalEmail();
      if (!email) return;
      const payload = {
        email,
        type: String(type || '').trim(),
        meta: meta && typeof meta === 'object' ? meta : {},
      };
      if (!payload.type) return;
      fetch('/api/activity/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // ignore
      });
    } catch {
      // ignore
    }
  };

  // Basic page-view logging (enough to power the admin activity viewer).
  try {
    const pageId = getFileName();
    const stageId = getStageIdForPage(pageId);
    logActivity('page_view', { page: pageId, stageId });
  } catch {
    // ignore
  }

  const clearProgress = () => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.maxStage);
      window.sessionStorage.removeItem(LISTENING_STEP_KEY);
      for (const stage of STAGES) {
        window.sessionStorage.removeItem(`${STORAGE_KEYS.stageUrlPrefix}${stage.id}`);
      }
    } catch {
      // ignore
    }
  };

  const getMaxStage = () => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEYS.maxStage);
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const setMaxStage = (stageId) => {
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.maxStage, String(stageId));
    } catch {
      // ignore
    }
  };

  const getStageUrl = (stageId) => {
    try {
      return window.sessionStorage.getItem(`${STORAGE_KEYS.stageUrlPrefix}${stageId}`);
    } catch {
      return null;
    }
  };

  const setStageUrl = (stageId, url) => {
    try {
      window.sessionStorage.setItem(`${STORAGE_KEYS.stageUrlPrefix}${stageId}`, url);
    } catch {
      // ignore
    }
  };

  const guessEntryUrl = (stageId) => {
    const stage = STAGES.find((s) => s.id === stageId);
    const pageId = stage?.entry || null;
    return pageId ? toPageUrl(pageId) : null;
  };

  const installBackTrapIfNeeded = (stageId) => {
    if (!BACK_TRAP_STAGE_IDS.has(stageId)) return;
    if (window.__ieltsBackTrapInstalled === true) return;
    window.__ieltsBackTrapInstalled = true;

    try {
      // Push multiple entries so rapid/double Back clicks don't jump past the trap.
      for (let i = 0; i < BACK_TRAP_DEPTH; i++) {
        window.history.pushState({ ieltsBackTrap: true, stage: stageId, i }, '', window.location.href);
      }
    } catch {
      // ignore
    }

    window.addEventListener('popstate', () => {
      try {
        // Replenish the trap each time Back is pressed.
        window.history.pushState({ ieltsBackTrap: true, stage: stageId, t: Date.now() }, '', window.location.href);
      } catch {
        // ignore
      }
      enforce();
    });
  };

  const isListeningTestPage = (pageId) => {
    return /^ielts-listening-test/i.test(String(pageId || ''));
  };

  const isReadingExamPage = (pageId) => {
    const id = String(pageId || '');
    return /^ielts-reading-test/i.test(id) || id === 'ielts-reading-ended';
  };

  const isWritingExamPage = (pageId) => {
    const id = String(pageId || '');
    return /^ielts-writing-test/i.test(id) || id === 'ielts-writing-ended';
  };

  const installReadingDeepBackTrap = (pageId) => {
    if (!isReadingExamPage(pageId)) return;
    if (window.__ieltsReadingBackTrapInstalled === true) return;
    window.__ieltsReadingBackTrapInstalled = true;

    const pushTrap = () => {
      try {
        for (let i = 0; i < READING_TEST_BACK_TRAP_DEPTH; i++) {
          window.history.pushState({ ieltsReadingTrap: true, i }, '', window.location.href);
        }
      } catch {
        // ignore
      }
    };

    // Prime a large buffer so Back doesn't leave the Reading exam.
    pushTrap();

    // If Back is pressed, immediately move forward and replenish trap entries.
    window.addEventListener('popstate', () => {
      pushTrap();

      const nudgeForward = () => {
        try {
          window.history.go(1);
        } catch {
          // ignore
        }
      };

      nudgeForward();
      window.setTimeout(nudgeForward, 0);
      window.setTimeout(nudgeForward, 60);
      window.setTimeout(nudgeForward, 140);
    });

    // Question navigation uses hash links; keep replenishing so Back can't walk hash history.
    window.addEventListener('hashchange', () => {
      pushTrap();
    });
  };

  const installWritingDeepBackTrap = (pageId) => {
    if (!isWritingExamPage(pageId)) return;
    if (window.__ieltsWritingBackTrapInstalled === true) return;
    window.__ieltsWritingBackTrapInstalled = true;

    const pushTrap = () => {
      try {
        for (let i = 0; i < WRITING_TEST_BACK_TRAP_DEPTH; i++) {
          window.history.pushState({ ieltsWritingTrap: true, i }, '', window.location.href);
        }
      } catch {
        // ignore
      }
    };

    // Prime a large buffer so Back doesn't leave the Writing exam.
    pushTrap();

    window.addEventListener('popstate', () => {
      pushTrap();

      const nudgeForward = () => {
        try {
          window.history.go(1);
        } catch {
          // ignore
        }
      };

      nudgeForward();
      window.setTimeout(nudgeForward, 0);
      window.setTimeout(nudgeForward, 60);
      window.setTimeout(nudgeForward, 140);
    });
  };

  const installListeningTestDeepBackTrap = (pageId) => {
    if (!isListeningTestPage(pageId)) return;
    if (window.__ieltsListeningTestBackTrapInstalled === true) return;
    window.__ieltsListeningTestBackTrapInstalled = true;

    const pushTrap = () => {
      try {
        for (let i = 0; i < LISTENING_TEST_BACK_TRAP_DEPTH; i++) {
          window.history.pushState({ ieltsListeningTestTrap: true, i }, '', window.location.href);
        }
      } catch {
        // ignore
      }
    };

    // Prime a large buffer so Back doesn't leave the page.
    pushTrap();

    // If Back is pressed, immediately re-add trap entries and move forward.
    // Also schedule a couple extra forwards to handle rapid/double clicks.
    window.addEventListener('popstate', () => {
      pushTrap();

      const nudgeForward = () => {
        try {
          window.history.go(1);
        } catch {
          // ignore
        }
      };

      nudgeForward();
      window.setTimeout(nudgeForward, 0);
      window.setTimeout(nudgeForward, 50);
      window.setTimeout(nudgeForward, 120);
    });

    // Hash changes (question navigation) can create history entries.
    // Keep replenishing the buffer so Back doesn't walk the hash history.
    window.addEventListener('hashchange', () => {
      pushTrap();
    });
  };

  const enforce = () => {
    const fileName = getFileName();
    if (!fileName) return;

    installClipboardGuard(fileName);
    blockAnswerSuggestions(fileName);

    const hasRestartFlag = () => {
      try {
        const params = new URLSearchParams(String(window.location.search || ''));
        return params.get('restart') === '1' || params.get('restart') === 'true' || params.get('reset') === '1';
      } catch {
        return false;
      }
    };

    // Once a user has entered a test stage, do not allow browser Back
    // to return them to the pre-test pages.
    if (PRE_TEST_PAGES.has(fileName)) {
      if (hasRestartFlag()) {
        clearProgress();
        return;
      }

      const maxStage = getMaxStage();
      if (maxStage >= 1) {
        const target = getStageUrl(maxStage) || guessEntryUrl(maxStage);
        if (target && target !== window.location.href) {
          try {
            window.location.replace(target);
          } catch {
            window.location.href = target;
          }
        }
        return;
      }

      // No stage started yet: keep storage clean.
      clearProgress();
      return;
    }

    const currentStage = getStageIdForPage(fileName);
    if (currentStage <= 0) return;

    // Reading: once the user has progressed beyond the Instructions page,
    // do not allow browser Back to return them to Instructions.
    if (currentStage === READING_STAGE_ID && fileName === 'ielts-reading-instructions') {
      if (hasRestartFlag()) {
        clearProgress();
        return;
      }

      const lastUrl = getStageUrl(READING_STAGE_ID);
      const lastUrlStr = String(lastUrl || '');
      const isStillOnInstructions = /ielts-reading-instructions/i.test(lastUrlStr);
      if (lastUrl && !isStillOnInstructions && lastUrlStr !== String(window.location.href || '')) {
        try {
          window.location.replace(lastUrlStr);
        } catch {
          window.location.href = lastUrlStr;
        }
        return;
      }
    }

    // Writing: once the user has progressed beyond the Writing Instructions page,
    // do not allow browser Back to return them to Instructions.
    if (currentStage === WRITING_STAGE_ID && fileName === 'ielts-writing') {
      if (hasRestartFlag()) {
        clearProgress();
        return;
      }

      const lastUrl = getStageUrl(WRITING_STAGE_ID);
      const lastUrlStr = String(lastUrl || '');
      const isStillOnInstructions = /ielts-writing(\.|\/|$)/i.test(lastUrlStr) && !/ielts-writing-test/i.test(lastUrlStr);
      if (lastUrl && !isStillOnInstructions && lastUrlStr !== String(window.location.href || '')) {
        try {
          window.location.replace(lastUrlStr);
        } catch {
          window.location.href = lastUrlStr;
        }
        return;
      }
    }

    const maxStage = getMaxStage();

    installBackTrapIfNeeded(currentStage);
    installListeningTestDeepBackTrap(fileName);
    installReadingDeepBackTrap(fileName);
    installWritingDeepBackTrap(fileName);

    // Listening: once the user reaches Instructions (or beyond), do not allow
    // returning to the earlier Listening soundcheck page via browser Back.
    if (currentStage === 1) {
      const step = getListeningStep(fileName);
      if (step > 0) {
        const stepMax = Math.max(getListeningStepMax(), step);
        setListeningStepMax(stepMax);

        // Once the Listening test has started, do not allow browser Back to return
        // to earlier Listening steps (soundcheck/instructions). Bounce back to test.
        if (step < 3 && stepMax >= 3) {
          const target = getStageUrl(1) || toPageUrl('ielts-listening-test');
          if (target && target !== window.location.href) {
            try {
              window.location.replace(target);
            } catch {
              window.location.href = target;
            }
          }
          return;
        }

        // Only block going back to the soundcheck (step 1) once they've progressed.
        if (step === 1 && stepMax >= 2) {
          const target = toPageUrl('ielts-listening-instructions');
          if (target && target !== window.location.href) {
            try {
              window.location.replace(target);
            } catch {
              window.location.href = target;
            }
          }
          return;
        }
      }
    }

    // If user is trying to go back to an earlier test, block it.
    if (maxStage > 0 && currentStage < maxStage) {
      const target = getStageUrl(maxStage) || guessEntryUrl(maxStage);
      if (target && target !== window.location.href) {
        try {
          window.location.replace(target);
        } catch {
          window.location.href = target;
        }
      }
      return;
    }

    // Record progress at (or beyond) the current stage.
    const newMax = Math.max(maxStage, currentStage);
    if (newMax !== maxStage) setMaxStage(newMax);

    // Keep a pointer to the last visited page in this stage.
    setStageUrl(currentStage, window.location.href);
  };

  // Run on normal loads and on back/forward cache restores.
  window.addEventListener('pageshow', () => {
    enforce();
  });

  enforce();
})();
