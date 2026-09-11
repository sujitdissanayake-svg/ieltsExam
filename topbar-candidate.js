(function () {
  function normalize(value) {
    return String(value == null ? '' : value).trim();
  }

  function readStorage(key) {
    try {
      var localValue = normalize(window.localStorage.getItem(key));
      if (localValue) return localValue;
    } catch (_) {}
    try {
      return normalize(window.sessionStorage.getItem(key));
    } catch (_) {
      return '';
    }
  }

  function writeStorage(key, value) {
    var v = normalize(value);
    if (!v) return;
    try {
      window.localStorage.setItem(key, v);
    } catch (_) {}
    try {
      window.sessionStorage.setItem(key, v);
    } catch (_) {}
  }

  function sanitizeCandidateNumber(value) {
    var raw = normalize(value);
    if (!raw) return '';
    var numeric = Number(raw);
    if (!(numeric > 0)) return '';
    return String(Math.trunc(numeric));
  }

  function resolveCandidateNumber() {
    var stored = sanitizeCandidateNumber(readStorage('ieltsPortalCandidateNumber'));
    if (stored) return stored;
    return '';
  }

  function applyToTopbar() {
    var nodes = document.querySelectorAll('[data-candidate-number]');
    if (!nodes || !nodes.length) return;

    var candidateNumber = resolveCandidateNumber();
    var text = candidateNumber ? 'Test Taker ID : ' + candidateNumber : 'Test Taker ID : -';

    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      nodes[i].textContent = text;

      // In pages that already have a separate "Test Taker ID" title row,
      // hide that row so we show a single combined line.
      var container = nodes[i].parentElement;
      if (!container) continue;
      var title = container.querySelector('.listening-id-title');
      if (title) title.style.display = 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyToTopbar);
  } else {
    applyToTopbar();
  }
})();
