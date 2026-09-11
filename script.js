(() => {
  const usesHtmlRoutes = () => /\.html$/i.test(window.location.pathname || '');

  const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  const shuffleInPlace = (array, rng) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const generateStudentNames = (count) => {
    const firstNames = [
      'Aaliyah','Aaron','Aisha','Akira','Alana','Alex','Amaya','Amina','Anaya','Anika','Aria','Arya','Asha','Ava',
      'Ben','Bella','Caleb','Camila','Chloe','Daniel','Daphne','David','Deepa','Dilan','Dina','Ethan','Eva','Farah',
      'Fatima','Gabriel','Grace','Hana','Hannah','Harini','Imran','Ishani','Isla','Jasmine','Jason','Jayden','Jin',
      'Kavya','Keerthi','Kenji','Kiara','Laila','Liam','Lihua','Lina','Maya','Megan','Mika','Mohamed','Nadeeka',
      'Nadia','Nimal','Noah','Omar','Priya','Ravi','Riya','Saanvi','Sachin','Sayuri','Sofia','Talia','Upul','Wei',
      'Yara','Zara'
    ];

    const lastNames = [
      'Perera','Silva','Fernando','Rajapaksa','Sharma','Patel','Singh','Kumar','Hassan','Ibrahim','Zhang','Wang','Li',
      'Chen','Tanaka','Sato','Kim','Park','Nguyen','Tran','Rahman','Islam','Khan','Almeida','Costa','Santos','Dias',
      'Gomez','Garcia','Martinez','Lopez','Hernandez','Brown','Smith','Johnson','Williams','Taylor','Anderson','Thomas',
      'Lakshika','Tharangi','Ramesh','Jayasinghe','Bandara','Wijesinghe','Devi','Nair','Menon','Gupta','Mehta'
    ];

    const max = Math.max(1, Math.floor(count));
    const names = [];

    for (let i = 0; i < firstNames.length && names.length < max; i++) {
      for (let j = 0; j < lastNames.length && names.length < max; j++) {
        names.push(`${firstNames[i]} ${lastNames[j]}`);
      }
    }

    // If requested count exceeds combinations, append unique numeric suffixes.
    let suffix = 2;
    while (names.length < max) {
      const base = names[(names.length - 1) % Math.max(1, firstNames.length * lastNames.length)] || 'Student';
      names.push(`${base} ${suffix}`);
      suffix++;
    }

    // Shuffle deterministically per-day to avoid looking repetitive.
    const today = new Date();
    const seed =
      today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return shuffleInPlace(names, mulberry32(seed));
  };

  const applyHeaderOffset = () => {
    const header = document.querySelector('.site-header');
    if (!(header instanceof HTMLElement)) return;
    document.documentElement.style.setProperty('--headerHeight', `${header.offsetHeight}px`);
  };

  const applyFooterSizing = () => {
    const lecturerBox = document.querySelector('.footer-lecturer-box');
    if (!(lecturerBox instanceof HTMLElement)) return;
    document.documentElement.style.setProperty('--lecturerBoxHeight', `${lecturerBox.offsetHeight}px`);
  };

  applyHeaderOffset();
  applyFooterSizing();
  window.addEventListener('resize', applyHeaderOffset);
  window.addEventListener('resize', applyFooterSizing);

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const currentStudentsEl = document.querySelector('[data-current-students]');
  if (currentStudentsEl) {
    const baseCount = 10897;
    const incrementPerDay = 50;

    const now = new Date();
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const storageKey = 'ieltsCurrentStudentsStartDate';
    const adminKey = 'ieltsAdminMode';
    const toYmd = (date) => {
      const y = String(date.getFullYear());
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const parseYmdToLocalMidnight = (ymd) => {
      const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(ymd);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return new Date(year, month - 1, day);
    };

    const computeCount = (start) => {
      const daysSinceStart = Math.max(0, Math.floor((nowMidnight.getTime() - start.getTime()) / 86400000));
      return baseCount + daysSinceStart * incrementPerDay;
    };

    const renderCount = (start) => {
      currentStudentsEl.textContent = String(computeCount(start));
    };

    let startMidnight = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) startMidnight = parseYmdToLocalMidnight(stored);
      if (!startMidnight) {
        startMidnight = new Date(nowMidnight.getFullYear(), nowMidnight.getMonth(), nowMidnight.getDate());
        window.localStorage.setItem(storageKey, toYmd(startMidnight));
      }
    } catch {
      startMidnight = new Date(nowMidnight.getFullYear(), nowMidnight.getMonth(), nowMidnight.getDate());
    }

    renderCount(startMidnight);

    const resetButton = document.querySelector('[data-current-students-reset]');
    if (resetButton instanceof HTMLButtonElement) {
      // Never expose this control on the public site.
      const allowAdminUi = false;
      if (!allowAdminUi) {
        try {
          window.localStorage.removeItem(adminKey);
        } catch {
          // ignore
        }
        resetButton.hidden = true;
      } else {
        resetButton.hidden = true;
      }
    }
  }

  const slideshow = document.querySelector('[data-students-slideshow]');
  if (slideshow) {
    const slides = Array.from(slideshow.querySelectorAll('.student-slide'));
    if (slides.length > 1) {
      let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
      if (index < 0) index = 0;

      const nameEl = document.querySelector('[data-current-student-name]');
      const studentNames = nameEl instanceof HTMLElement ? generateStudentNames(5000) : [];
      let nameIndex = studentNames.length > 0 ? Math.floor(Math.random() * studentNames.length) : 0;

      if (nameEl instanceof HTMLElement && studentNames.length > 0) {
        nameEl.textContent = studentNames[nameIndex] ?? '';
      }

      window.setInterval(() => {
        slides[index]?.classList.remove('is-active');
        index = (index + 1) % slides.length;
        slides[index]?.classList.add('is-active');

        if (nameEl instanceof HTMLElement && studentNames.length > 0) {
          nameIndex = (nameIndex + 1) % studentNames.length;
          nameEl.textContent = studentNames[nameIndex] ?? '';
        }
      }, 1800);
    }
  }

  // Booking cards: open provider link when clicking anywhere on the card.
  const bookingCards = Array.from(document.querySelectorAll('[data-booking-link]'));
  for (const card of bookingCards) {
    if (!(card instanceof HTMLElement)) continue;
    const url = card.getAttribute('data-booking-link');
    if (!url) continue;
    card.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a')) return;
      window.open(url, '_blank', 'noopener');
    });
  }

  // Booking page: if opened in a new window/tab, the browser Back button has no history.
  // Create a synthetic history entry so Back navigates to the home page.
  const bookingPage = document.querySelector('.booking-page');
  if (bookingPage && window.history.length <= 1) {
    try {
      window.history.pushState({ ieltsSyntheticBack: true }, '', window.location.href);
      window.addEventListener('popstate', () => {
        window.location.replace('/');
      });
    } catch {
      // ignore
    }
  }

  const dropdowns = Array.from(document.querySelectorAll('.nav-dropdown'));
  if (dropdowns.length === 0) return;

  const closeAllDropdownsExcept = (keep) => {
    for (const dropdown of dropdowns) {
      if (dropdown !== keep) dropdown.removeAttribute('open');
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    for (const dropdown of dropdowns) {
      if (!dropdown.hasAttribute('open')) continue;
      if (!dropdown.contains(target)) dropdown.removeAttribute('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeAllDropdownsExcept(null);
  });

  for (const dropdown of dropdowns) {
    dropdown.addEventListener('toggle', () => {
      if (dropdown.open) closeAllDropdownsExcept(dropdown);
    });

    dropdown.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.dropdown-item')) dropdown.removeAttribute('open');
    });
  }

  const lecturerForm = document.querySelector('[data-lecturer-form]');
  if (lecturerForm instanceof HTMLFormElement) {
    const status = document.createElement('p');
    status.setAttribute('aria-live', 'polite');
    status.style.margin = '8px 0 0';
    status.style.fontSize = '0.92rem';
    status.style.color = 'var(--muted)';
    status.style.display = 'none';
    lecturerForm.appendChild(status);

    let statusHideTimer = 0;

    const showStatus = (message, color) => {
      if (statusHideTimer) {
        window.clearTimeout(statusHideTimer);
        statusHideTimer = 0;
      }
      status.textContent = message;
      status.style.color = color;
      status.style.display = 'block';
    };

    const hideStatusLater = () => {
      if (statusHideTimer) window.clearTimeout(statusHideTimer);
      statusHideTimer = window.setTimeout(() => {
        status.textContent = '';
        status.style.display = 'none';
      }, 5000);
    };

    lecturerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const data = new FormData(lecturerForm);
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim();
      const institute = String(data.get('institute') ?? '').trim();
      const message = String(data.get('message') ?? '').trim();

      const submitButton = lecturerForm.querySelector('.footer-submit');
      const originalButtonText = submitButton instanceof HTMLButtonElement ? submitButton.textContent : null;

      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';
      }
      showStatus('Sending registration...', 'var(--muted)');

      try {
        const response = await fetch('/api/lecturer-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            institute,
            message,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((payload && payload.error) || 'Unable to send registration.');
        }

        lecturerForm.reset();
        showStatus('Registration sent successfully. We will contact you soon.', 'var(--accentGreen)');
        hideStatusLater();
      } catch (err) {
        showStatus(err && err.message ? err.message : 'Unable to send registration.', 'var(--red)');
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
          submitButton.textContent = originalButtonText || 'Send registration';
        }
      }
    });
  }
  // Gate test access behind a one-time registration on the portal page.
  const registrationFlagKey = 'ieltsPortalRegistered';
  let isRegistered = false;
  try {
    isRegistered = window.localStorage.getItem(registrationFlagKey) === 'true';
  } catch {
    isRegistered = false;
  }

  const getNormalizedHash = () => {
    const raw = String(window.location.hash || '').trim();
    if (!raw) return '';
    // Remove any trailing slash (some browsers/extensions may add it).
    return raw.replace(/\/$/, '');
  };

  const routeTestHash = (hash) => {
    if (hash !== '#free-mock' && hash !== '#mock' && hash !== '#practice') return false;

    // Keep behavior consistent with click handlers below.
    if (hash === '#mock') {
      const target = `./index.html${hash}`;
      const packagesUrl = `packages.html?target=${encodeURIComponent(target)}`;
      window.location.replace(packagesUrl);
      return true;
    }

    if (hash === '#practice') {
      const target = `./index.html${hash}`;
      const practicePackagesUrl = `practice-packages.html?target=${encodeURIComponent(target)}`;
      window.location.replace(practicePackagesUrl);
      return true;
    }

    // Free mock: start directly at the portal page and skip the removed chooser screen.
    window.location.replace(usesHtmlRoutes() ? 'free-mock-portal.html?restart=1' : 'free-mock-portal?restart=1');
    return true;
  };

  // Support direct navigation and portal redirects like /#free-mock.
  // If we handle it, stop processing to avoid binding handlers unnecessarily.
  if (routeTestHash(getNormalizedHash())) return;

  // Free Mock Test: always open the free mock test page.
  const freeMockLinks = document.querySelectorAll(
    'a.dropdown-item[href="#free-mock"], .promo-grid .cta-button[data-test="free-mock"], .hero-actions a[href="#free-mock"]'
  );
  for (const link of freeMockLinks) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = usesHtmlRoutes()
        ? 'free-mock-portal.html?restart=1'
        : 'free-mock-portal?restart=1';
      window.location.replace(target);
    });
  }

  // Mock Test always shows Packages first (even if registered).
  const mockLinks = document.querySelectorAll(
    'a.dropdown-item[href="#mock"], .promo-grid .cta-button[data-test="mock"]'
  );
  for (const link of mockLinks) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const originalHref = link.getAttribute('href') || '#';
      let target = originalHref;
      if (originalHref.startsWith('#')) {
        target = `./index.html${originalHref}`;
      }
      const packagesUrl = `packages.html?target=${encodeURIComponent(target)}`;
      window.location.href = packagesUrl;
    });
  }

  // Mock Test list buttons (on the homepage).
  const mockStartButtons = document.querySelectorAll('button[data-mock-test-start]');
  for (const btn of mockStartButtons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-mock-test-start') || '1';
      let testId = Number(raw);
      if (!Number.isFinite(testId) || testId < 1 || testId > 4) testId = 1;

      // Always keep Mock Tests behind the package/portal flow.
      if (!isRegistered) {
        const target = `./index.html#mock`;
        const packagesUrl = `packages.html?target=${encodeURIComponent(target)}`;
        window.location.href = packagesUrl;
        return;
      }

      const runUrl = usesHtmlRoutes()
        ? `mock-test-run.html?test=${encodeURIComponent(String(testId))}&section=listening`
        : `mock-test-run?test=${encodeURIComponent(String(testId))}&section=listening`;
      window.location.href = runUrl;
    });
  }

  // Practice Test always shows Packages first (even if registered).
  const practiceLinks = document.querySelectorAll(
    'a.dropdown-item[href="#practice"], .promo-grid .cta-button[data-test="practice"], .hero-actions a[href="#practice"]'
  );
  for (const link of practiceLinks) {
    if (!(link instanceof HTMLAnchorElement)) continue;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const originalHref = link.getAttribute('href') || '#';
      let target = originalHref;
      if (originalHref.startsWith('#')) {
        target = `./index.html${originalHref}`;
      }
      const practicePackagesUrl = `practice-packages.html?target=${encodeURIComponent(target)}`;
      window.location.href = practicePackagesUrl;
    });
  }

  if (!isRegistered) {
    const selectors = [
      'a.dropdown-item[href="#free-mock"]',
      'a.dropdown-item[href="#practice"]',
      '.hero-actions a[href="#free-mock"]',
      '.hero-actions a[href="#practice"]',
      // Only gate promo CTAs that explicitly represent tests.
      '.promo-grid .cta-button[data-test]'
    ];

    const links = document.querySelectorAll(selectors.join(', '));
    for (const link of links) {
      if (!(link instanceof HTMLAnchorElement)) continue;

      // Free mock is always allowed; mock/practice tests are handled above (packages page).
      if (link.dataset && (link.dataset.test === 'free-mock' || link.dataset.test === 'mock' || link.dataset.test === 'practice')) continue;

      link.addEventListener('click', (event) => {
        event.preventDefault();
        const originalHref = link.getAttribute('href') || '#';
        let target = originalHref;
        if (originalHref.startsWith('#')) {
          target = `./index.html${originalHref}`;
        }
        const packagesUrl = `packages.html?target=${encodeURIComponent(target)}`;
        window.location.href = packagesUrl;
      });
    }
  }
})();
