const { sha256Hex, signToken, verifyToken } = require('./_shared');

const parseListEnv = (name) => {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
};

const getIpAllowlist = () => parseListEnv('ADMIN_IP_ALLOWLIST');
const getTrustedProxies = () => parseListEnv('ADMIN_TRUSTED_PROXIES');

const normalizeIp = (value) => {
  let ip = String(value || '').trim();
  if (!ip) return '';

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  if (ip.includes(':') && ip.includes('.') && ip.lastIndexOf(':') > ip.lastIndexOf('.')) {
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }

  return ip;
};

const isPrivateOrLocalIp = (ip) => {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return false;

  if (value === '::1' || value === 'localhost') return true;
  if (value.startsWith('127.')) return true;
  if (value.startsWith('10.')) return true;
  if (value.startsWith('192.168.')) return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;

  const m = value.match(/^172\.(\d{1,3})\./);
  if (m) {
    const second = Number(m[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }

  return false;
};

const getForwardedChain = (req) => {
  const headers = (req && req.headers) || {};
  const forwarded = String(headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '').trim();
  if (!forwarded) return [];
  return forwarded.split(',').map((part) => normalizeIp(part)).filter(Boolean);
};

const ipMatchesRule = (ip, rule) => {
  if (!ip || !rule) return false;
  if (rule === '*') return true;
  if (rule.endsWith('*')) {
    return ip.startsWith(rule.slice(0, -1));
  }
  return ip === rule;
};

const getClientIp = (req) => {
  const headers = (req && req.headers) || {};
  const socketIp = normalizeIp(req && req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
  const realIp = normalizeIp(headers['x-real-ip'] || headers['X-Real-Ip'] || '');
  const vercelForwardedIp = normalizeIp(headers['x-vercel-forwarded-for'] || headers['X-Vercel-Forwarded-For'] || '');
  const cloudflareIp = normalizeIp(headers['cf-connecting-ip'] || headers['CF-Connecting-IP'] || '');
  const chain = getForwardedChain(req);

  const trustedProxyRules = getTrustedProxies();
  const socketIsTrustedProxy =
    !!socketIp &&
    (trustedProxyRules.some((rule) => ipMatchesRule(socketIp, rule)) || isPrivateOrLocalIp(socketIp));

  const onVercel = String(process.env.VERCEL || '').trim() === '1' || String(process.env.VERCEL || '').trim().toLowerCase() === 'true';

  if (vercelForwardedIp) return vercelForwardedIp;
  if (cloudflareIp) return cloudflareIp;

  // Trust x-forwarded-for only when the immediate peer is trusted.
  if ((socketIsTrustedProxy || onVercel) && chain.length) {
    return chain[0];
  }

  if (realIp) return realIp;
  return socketIp;
};

const enforceIpAllowlist = (req) => {
  const allowlist = getIpAllowlist();
  if (!allowlist.length) return '';

  const clientIp = getClientIp(req);
  if (!clientIp) {
    throw new Error('Access denied from this network.');
  }

  const allowed = allowlist.some((rule) => ipMatchesRule(clientIp, rule));
  if (!allowed) {
    throw new Error('Access denied from this network.');
  }

  return clientIp;
};

const getTokenSecret = () => {
  const configured = String(process.env.AUTH_TOKEN_SECRET || '').trim();
  if (configured) return configured;

  // Local dev fallback: allow running without env vars.
  // On Vercel (production), require a real secret.
  const onVercel = !!process.env.VERCEL;
  if (onVercel) return '';
  return 'dev-secret-change-me';
};

const requireTokenSecret = () => {
  const secret = getTokenSecret();
  if (!secret) throw new Error('Server not configured (missing AUTH_TOKEN_SECRET).');
  return secret;
};

const hashPassword = (password) => {
  const secret = requireTokenSecret();
  return sha256Hex(`${String(password || '')}:${secret}`);
};

const issueToken = (payload, { ttlSeconds = 60 * 60 * 8 } = {}) => {
  const secret = requireTokenSecret();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...(payload || {}),
    exp: now + Math.max(60, Number(ttlSeconds) || 0),
    iat: now,
  };
  return signToken(fullPayload, secret);
};

const getBearerToken = (req) => {
  const header = String((req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '').trim();
  if (!header) return '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] || '').trim() : '';
};

const verifyBearerToken = (req) => {
  const token = getBearerToken(req);
  if (!token) throw new Error('Missing token.');
  const secret = requireTokenSecret();
  return verifyToken(token, secret);
};

const requireRole = (req, roles) => {
  enforceIpAllowlist(req);
  const payload = verifyBearerToken(req);
  const role = String(payload && payload.role ? payload.role : '').trim();
  const allowed = Array.isArray(roles) && roles.length ? roles : [];
  if (allowed.length && !allowed.includes(role)) {
    throw new Error('Forbidden.');
  }
  return payload;
};

module.exports = {
  getTokenSecret,
  requireTokenSecret,
  hashPassword,
  issueToken,
  verifyBearerToken,
  requireRole,
  getClientIp,
  enforceIpAllowlist,
};
