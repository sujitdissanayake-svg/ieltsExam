const RATE_LIMIT_BUCKETS = global.__IELTS_RATE_LIMIT_BUCKETS || new Map();
if (!global.__IELTS_RATE_LIMIT_BUCKETS) {
  global.__IELTS_RATE_LIMIT_BUCKETS = RATE_LIMIT_BUCKETS;
}

const normalizeEnv = (value) => String(value || '').trim();
const hasPostgresUrl = () => !!normalizeEnv(process.env.POSTGRES_URL);

let pgBucketTableReady = null;

const ensurePgRateLimitTable = async () => {
  if (pgBucketTableReady) return pgBucketTableReady;

  pgBucketTableReady = (async () => {
    const { sql } = require('@vercel/postgres');
    await sql`
      CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        key TEXT PRIMARY KEY,
        window_start_ms BIGINT NOT NULL,
        count INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })().catch((err) => {
    pgBucketTableReady = null;
    throw err;
  });

  return pgBucketTableReady;
};

const getUpstashConfig = () => {
  const url = normalizeEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = normalizeEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ''),
    token,
  };
};

const applySecurityHeaders = (res) => {
  if (!res || typeof res.setHeader !== 'function') return;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
};

const getClientIp = (req) => {
  const forwarded = String((req && req.headers && req.headers['x-forwarded-for']) || '').trim();
  if (forwarded) {
    const first = String(forwarded.split(',')[0] || '').trim();
    if (first) return first;
  }
  const realIp = String((req && req.headers && req.headers['x-real-ip']) || '').trim();
  if (realIp) return realIp;
  return String((req && req.socket && req.socket.remoteAddress) || '').trim() || 'unknown';
};

const applyRateLimitHeaders = (res, { limit, remaining, resetAt, retryAfterSeconds }) => {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(Number(resetAt || Date.now()) / 1000)));
  if (retryAfterSeconds != null) {
    res.setHeader('Retry-After', String(Math.max(1, Number(retryAfterSeconds) || 1)));
  }
};

const enforcePostgresRateLimit = async (req, res, settings) => {
  if (!hasPostgresUrl()) return { used: false, blocked: false, failed: false };

  const windowMs = Math.max(1000, Number(settings.windowMs) || 60 * 1000);
  const limit = Math.max(1, Number(settings.limit) || 30);
  const keyPrefix = String(settings.key || 'global').trim() || 'global';
  const now = Date.now();
  const bucketKey = keyPrefix + ':' + getClientIp(req);
  const windowStartMs = Math.floor(now / windowMs) * windowMs;

  try {
    await ensurePgRateLimitTable();
    const { sql } = require('@vercel/postgres');

    const result = await sql`
      INSERT INTO rate_limit_buckets (key, window_start_ms, count, updated_at)
      VALUES (${bucketKey}, ${windowStartMs}, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_buckets.window_start_ms = EXCLUDED.window_start_ms
            THEN rate_limit_buckets.count + 1
          ELSE 1
        END,
        window_start_ms = EXCLUDED.window_start_ms,
        updated_at = NOW()
      RETURNING count, window_start_ms
    `;

    const row = result && result.rows && result.rows[0] ? result.rows[0] : null;
    const count = Math.max(1, Number(row && row.count) || 1);
    const resetAt = (Number(row && row.window_start_ms) || windowStartMs) + windowMs;
    const remaining = Math.max(0, limit - count);

    if (Math.random() < 0.02) {
      // Opportunistic cleanup to keep table size bounded.
      await sql`DELETE FROM rate_limit_buckets WHERE updated_at < NOW() - INTERVAL '2 days'`;
    }

    if (count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      applyRateLimitHeaders(res, { limit, remaining, resetAt, retryAfterSeconds });
      sendJson(res, 429, {
        error: String(settings.message || 'Too many requests. Please try again soon.'),
        retryAfterSeconds,
      });
      return { used: true, blocked: true, failed: false };
    }

    applyRateLimitHeaders(res, { limit, remaining, resetAt });
    return { used: true, blocked: false, failed: false };
  } catch (_) {
    return { used: true, blocked: false, failed: true };
  }
};

const enforceInMemoryRateLimit = (req, res, settings) => {
  const windowMs = Math.max(1000, Number(settings.windowMs) || 60 * 1000);
  const limit = Math.max(1, Number(settings.limit) || 30);
  const keyPrefix = String(settings.key || 'global').trim() || 'global';
  const now = Date.now();
  const bucketKey = keyPrefix + ':' + getClientIp(req);

  const existing = RATE_LIMIT_BUCKETS.get(bucketKey);
  let bucket = existing;
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  RATE_LIMIT_BUCKETS.set(bucketKey, bucket);

  if (RATE_LIMIT_BUCKETS.size > 5000) {
    for (const [key, value] of RATE_LIMIT_BUCKETS.entries()) {
      if (!value || now >= Number(value.resetAt || 0)) RATE_LIMIT_BUCKETS.delete(key);
    }
  }

  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  applyRateLimitHeaders(res, {
    limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: bucket.count > limit ? retryAfterSeconds : null,
  });

  if (bucket.count > limit) {
    sendJson(res, 429, {
      error: String(settings.message || 'Too many requests. Please try again soon.'),
      retryAfterSeconds,
    });
    return true;
  }

  return false;
};

const enforceUpstashRateLimit = async (req, res, settings) => {
  const config = getUpstashConfig();
  if (!config) return { used: false, blocked: false, failed: false };

  const windowMs = Math.max(1000, Number(settings.windowMs) || 60 * 1000);
  const limit = Math.max(1, Number(settings.limit) || 30);
  const keyPrefix = String(settings.key || 'global').trim() || 'global';
  const now = Date.now();
  const bucketKey = keyPrefix + ':' + getClientIp(req);

  const endpoint = config.url + '/pipeline';
  const commandBody = [
    ['INCR', bucketKey],
    ['PEXPIRE', bucketKey, String(windowMs), 'NX'],
    ['PTTL', bucketKey],
  ];

  let payload;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commandBody),
    });

    if (!response.ok) throw new Error('Upstash request failed.');
    payload = await response.json();
  } catch (_) {
    return { used: true, blocked: false, failed: true };
  }

  const results = Array.isArray(payload && payload.result)
    ? payload.result
    : (Array.isArray(payload) ? payload : []);

  const readResultValue = (entry) => {
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'result')) {
      return entry.result;
    }
    return entry;
  };

  const rawCount = Number(readResultValue(results[0]));
  const rawTtl = Number(readResultValue(results[2]));
  const count = Number.isFinite(rawCount) ? rawCount : 1;
  const ttlMs = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : windowMs;
  const resetAt = now + ttlMs;
  const remaining = Math.max(0, limit - count);

  if (count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
    applyRateLimitHeaders(res, { limit, remaining, resetAt, retryAfterSeconds });
    sendJson(res, 429, {
      error: String(settings.message || 'Too many requests. Please try again soon.'),
      retryAfterSeconds,
    });
    return { used: true, blocked: true, failed: false };
  }

  applyRateLimitHeaders(res, { limit, remaining, resetAt });
  return { used: true, blocked: false, failed: false };
};

const enforceRateLimit = async (req, res, options) => {
  const settings = options && typeof options === 'object' ? options : {};
  const upstash = await enforceUpstashRateLimit(req, res, settings);
  if (upstash.blocked) return true;
  if (upstash.used && !upstash.failed) return false;

  const postgres = await enforcePostgresRateLimit(req, res, settings);
  if (postgres.blocked) return true;
  if (postgres.used && !postgres.failed) return false;

  return enforceInMemoryRateLimit(req, res, settings);
};

const sendJson = (res, statusCode, payload) => {
  applySecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
  res.end(JSON.stringify(payload));
};

const notFound = (res) => sendJson(res, 404, { error: 'Not found.' });

module.exports = {
  applySecurityHeaders,
  getClientIp,
  enforceRateLimit,
  sendJson,
  notFound,
};
