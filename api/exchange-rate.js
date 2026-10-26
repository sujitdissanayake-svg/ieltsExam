const { sendJson } = require('./_http');
const { getUsdLkrRate } = require('./_currency');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const { rate, fetchedAt } = await getUsdLkrRate();
    sendJson(res, 200, { rate, fetchedAt });
  } catch (error) {
    console.error('Unable to retrieve the live USD/LKR exchange rate.', error);
    sendJson(res, 502, { error: 'Live USD/LKR exchange rate is currently unavailable.' });
  }
};
