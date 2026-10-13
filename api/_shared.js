const crypto = require('crypto');

const base64UrlEncode = (input) => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlDecodeToBuffer = (input) => {
  const str = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str + '='.repeat(padLength);
  return Buffer.from(padded, 'base64');
};

const sha256Hex = (input) => {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
};

const timingSafeEqualText = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const isValidEmailBasic = (email) => {
  const value = String(email || '').trim();
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const isValidWhatsAppNumber = (number) => {
  const normalized = String(number || '').trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return false;

  const digits = normalized.slice(1);
  if (/^(\d)\1+$/.test(digits)) return false;
  return !/^(0123456789|1234567890|9876543210|0987654321)/.test(digits);
};

const hmacSha256Base64Url = (secret, data) => {
  return base64UrlEncode(crypto.createHmac('sha256', String(secret)).update(String(data), 'utf8').digest());
};

const signToken = (payload, secret) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const sig = hmacSha256Base64Url(secret, signingInput);
  return `${signingInput}.${sig}`;
};

const verifyToken = (token, secret) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token.');

  const [headerPart, payloadPart, sig] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSig = hmacSha256Base64Url(secret, signingInput);

  const a = Buffer.from(String(sig), 'utf8');
  const b = Buffer.from(String(expectedSig), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid token signature.');
  }

  const payloadJson = base64UrlDecodeToBuffer(payloadPart).toString('utf8');
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error('Invalid token payload.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload && typeof payload.exp === 'number' && now > payload.exp) {
    throw new Error('Code expired.');
  }

  return payload;
};

const readJsonBody = async (req, { maxBytes = 32 * 1024 } = {}) => {
  return new Promise((resolve, reject) => {
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

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });

    req.on('error', reject);
  });
};

const getVerificationTokenSecret = () => {
  const configured = String(process.env.VERIFICATION_TOKEN_SECRET || '').trim();
  if (configured) return configured;

  const onVercel = !!process.env.VERCEL;
  if (onVercel) return '';
  return 'dev-verification-secret-change-me';
};

const requireVerificationTokenSecret = () => {
  const secret = getVerificationTokenSecret();
  if (!secret) throw new Error('Server not configured (missing VERIFICATION_TOKEN_SECRET).');
  return secret;
};

module.exports = {
  sha256Hex,
  timingSafeEqualText,
  isValidEmailBasic,
  isValidWhatsAppNumber,
  signToken,
  verifyToken,
  readJsonBody,
  getVerificationTokenSecret,
  requireVerificationTokenSecret,
};
