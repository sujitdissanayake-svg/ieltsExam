const USD_LKR_RATE_URL = 'https://open.er-api.com/v6/latest/USD';
const USD_LKR_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedUsdLkrRate = null;

const getUsdLkrRate = async () => {
  const now = Date.now();
  if (cachedUsdLkrRate && now - cachedUsdLkrRate.fetchedAt < USD_LKR_CACHE_TTL_MS) {
    return cachedUsdLkrRate;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(USD_LKR_RATE_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Exchange-rate provider returned HTTP ${response.status}.`);

    const data = await response.json();
    const rate = Number(data && data.rates && data.rates.LKR);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Exchange-rate provider returned an invalid USD/LKR rate.');
    }

    cachedUsdLkrRate = { rate, fetchedAt: Date.now() };
    return cachedUsdLkrRate;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { getUsdLkrRate };
