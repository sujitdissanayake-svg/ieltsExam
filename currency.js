(function () {
  var USD_LKR_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
  var priceElements = Array.prototype.slice.call(document.querySelectorAll('[data-usd-price]'));
  var lastRate = null;

  function formatPrice(usdAmount, rate) {
    var lkrAmount = new Intl.NumberFormat('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usdAmount * rate);
    return '$' + usdAmount.toFixed(2) + ' (LKR ' + lkrAmount + ')';
  }

  function renderPrices(rate) {
    priceElements.forEach(function (element) {
      var usdAmount = Number(element.getAttribute('data-usd-price'));
      if (!Number.isFinite(usdAmount) || usdAmount < 0) {
        console.error('Invalid USD price on a price element.', element);
        return;
      }
      element.textContent = formatPrice(usdAmount, rate);
      element.title = 'LKR conversion uses the latest available USD/LKR exchange rate.';
    });
  }

  async function refreshRate() {
    try {
      var response = await fetch('/api/exchange-rate', { cache: 'no-store' });
      var data = await response.json();
      var rate = Number(data && data.rate);
      if (!response.ok || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(data && data.error ? data.error : 'Unable to retrieve a valid USD/LKR rate.');
      }
      lastRate = rate;
      renderPrices(rate);
    } catch (error) {
      if (lastRate === null) {
        priceElements.forEach(function (element) {
          var usdAmount = Number(element.getAttribute('data-usd-price'));
          if (Number.isFinite(usdAmount) && usdAmount >= 0) {
            element.textContent = '$' + usdAmount.toFixed(2) + ' (LKR rate unavailable)';
          }
        });
      }
      console.error('Unable to refresh USD/LKR price conversions.', error);
    }
  }

  if (priceElements.length === 0) return;
  void refreshRate();
  window.setInterval(refreshRate, USD_LKR_REFRESH_INTERVAL_MS);
  window.addEventListener('focus', refreshRate);
})();
