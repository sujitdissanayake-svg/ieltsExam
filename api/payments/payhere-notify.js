const crypto = require('crypto');
const { timingSafeEqualText } = require('../_shared');
const { sendJson } = require('../_http');
const store = require('../_store');

const readFormBody = async (req, { maxBytes = 32 * 1024 } = {}) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new Error('Request too large.'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
  req.on('error', reject);
});

const md5Upper = (value) => crypto.createHash('md5').update(String(value), 'utf8').digest('hex').toUpperCase();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const merchantId = String(process.env.PAYHERE_MERCHANT_ID || '').trim();
  const merchantSecret = String(process.env.PAYHERE_MERCHANT_SECRET || '').trim();
  if (!merchantId || !merchantSecret) {
    sendJson(res, 500, { error: 'PayHere is not configured.' });
    return;
  }

  let body;
  try {
    body = await readFormBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err && err.message ? err.message : 'Invalid notification.' });
    return;
  }

  const receivedMerchantId = String(body.get('merchant_id') || '').trim();
  const orderId = String(body.get('order_id') || '').trim();
  const amount = String(body.get('payhere_amount') || '').trim();
  const currency = String(body.get('payhere_currency') || '').trim().toUpperCase();
  const statusCode = String(body.get('status_code') || '').trim();
  const signature = String(body.get('md5sig') || '').trim();
  const expectedSignature = md5Upper(`${receivedMerchantId}${orderId}${amount}${currency}${statusCode}${md5Upper(merchantSecret)}`);

  if (!orderId || receivedMerchantId !== merchantId || !timingSafeEqualText(signature, expectedSignature)) {
    sendJson(res, 400, { error: 'Invalid PayHere notification signature.' });
    return;
  }

  const payment = await store.findPaymentByPayHereOrderId(orderId);
  if (!payment) {
    sendJson(res, 404, { error: 'Payment order not found.' });
    return;
  }

  const expectedAmount = (Number(payment.amount) / 100).toFixed(2);
  const normalizedReceivedAmount = Number(amount);
  if (
    !Number.isFinite(normalizedReceivedAmount) ||
    normalizedReceivedAmount.toFixed(2) !== expectedAmount ||
    currency !== String(payment.currency || '').toUpperCase()
  ) {
    console.warn('Rejected PayHere notification due to payment amount or currency mismatch.', { orderId });
    sendJson(res, 400, { error: 'Payment amount or currency does not match the order.' });
    return;
  }

  const status = statusCode === '2' ? 'paid' : statusCode === '0' ? 'pending' : 'failed';
  const updated = await store.updatePayHerePayment({
    orderId,
    status,
    paymentId: String(body.get('payment_id') || ''),
    method: String(body.get('method') || ''),
    statusMessage: String(body.get('status_message') || ''),
  });

  if (!updated) {
    sendJson(res, 404, { error: 'Payment order not found.' });
    return;
  }

  if (status === 'paid') {
    await store.logActivity({
      userId: updated.userId,
      type: 'payhere_payment_paid',
      meta: {
        orderId,
        paymentId: String(body.get('payment_id') || ''),
        paper: updated.meta && updated.meta.paper ? updated.meta.paper : null,
      },
    });
  }

  sendJson(res, 200, { ok: true });
};
