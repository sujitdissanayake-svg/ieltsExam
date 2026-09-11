import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

const PORT = Number.parseInt(process.env.PORT || '5500', 10);
const ROOT = __dirname;
const PUBLIC_ORIGIN = 'https://www.ieltscambridge.com';

const isPortLike = (value) => /^[0-9]+$/.test(String(value || '').trim());

const deriveStudentPortalOrigin = (hostHeader) => {
  const rawHost = String(hostHeader || '').trim();
  if (!rawHost) return null;

  const [hostname, maybePort] = rawHost.split(':');
  const port = isPortLike(maybePort) ? maybePort : '';
  const mappedPort = port === '5500' ? '3000' : (port || '3000');
  return `http://${hostname}:${mappedPort}`;
};

const getStudentPortalOrigin = (hostHeader) => {
  const configured = String(process.env.STUDENT_PORTAL_DEV_ORIGIN || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const derived = deriveStudentPortalOrigin(hostHeader);
  if (derived) return derived;
  return 'http://0.0.0.0:3000';
};

const probeStudentPortal = (hostHeader) => {
  return new Promise((resolve) => {
    const origin = getStudentPortalOrigin(hostHeader);
    try {
      const target = new URL('/dashboard', origin);
      const probeReq = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          method: 'HEAD',
          path: target.pathname,
          timeout: 2000,
        },
        (probeRes) => {
          resolve({
            reachable: Boolean(probeRes.statusCode && probeRes.statusCode < 500),
            statusCode: probeRes.statusCode || 0,
            origin,
          });
        }
      );

      probeReq.on('timeout', () => {
        probeReq.destroy(new Error('Timed out while probing student portal.'));
      });

      probeReq.on('error', (err) => {
        resolve({
          reachable: false,
          statusCode: 0,
          origin,
          error: err && err.message ? err.message : 'Probe failed.',
        });
      });

      probeReq.end();
    } catch (err) {
      resolve({
        reachable: false,
        statusCode: 0,
        origin,
        error: err && err.message ? err.message : 'Invalid probe target.',
      });
    }
  });
};

const tryHandleDevHealth = async (req, res, pathname) => {
  if (pathname !== '/_dev/health' && pathname !== '/_dev/health/proxy') return false;

  const body = {
    ok: true,
    service: 'ielts-dev-server',
    timestamp: new Date().toISOString(),
    port: PORT,
  };

  if (pathname === '/_dev/health/proxy') {
    body.proxy = await probeStudentPortal(req.headers.host);
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(JSON.stringify(body));
  return true;
};

const loadEnvFile = async (relativePath) => {
  const filePath = path.join(ROOT, relativePath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return;

  const raw = await readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

await loadEnvFile('.env');
await loadEnvFile('.env.local');

// Explicit marker consumed by API handlers to distinguish local dev-server runtime
// from hosted/serverless environments.
process.env.IS_LOCAL_DEV_SERVER = '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const applySecurityHeaders = (res) => {
  if (!res || typeof res.setHeader !== 'function') return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
};

const applyApiCorsHeaders = (res, req) => {
  if (!res || typeof res.setHeader !== 'function') return;
  const requestOrigin = String((req && req.headers && req.headers.origin) || '').trim();

  // Local file protocol sends Origin: null. Reflect specific origins when available.
  if (requestOrigin && requestOrigin !== 'null') {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const safeJoin = (base, target) => {
  const normalized = path.normalize(target).replace(/^([/\\])+/, '');
  const joined = path.join(base, normalized);
  if (!joined.startsWith(base)) return null;
  return joined;
};

const tryHandleApi = async (req, res, pathname) => {
  if (!pathname.startsWith('/api/')) return false;

  applyApiCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    applySecurityHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // Map "/api/foo/bar" -> "api/foo/bar.js"
  const rel = pathname.replace(/^\//, '');
  const fileNoExt = safeJoin(ROOT, rel);
  if (!fileNoExt) return false;
  const handlerPath = `${fileNoExt}.js`;

  if (!existsSync(handlerPath) || !statSync(handlerPath).isFile()) {
    applySecurityHeaders(res);
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found.' }));
    return true;
  }

  try {
    // Avoid stale handlers/helpers in local dev.
    try {
      const apiRoot = path.join(ROOT, 'api') + path.sep;
      for (const key of Object.keys(require.cache || {})) {
        if (key && key.startsWith(apiRoot)) {
          delete require.cache[key];
        }
      }
    } catch (_) {}

    const mod = require(handlerPath);
    const handler = (mod && mod.default) ? mod.default : mod;
    if (typeof handler !== 'function') {
      applySecurityHeaders(res);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Invalid API handler.' }));
      return true;
    }

    await handler(req, res);
    return true;
  } catch (err) {
    applySecurityHeaders(res);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err && err.message ? err.message : 'Server error' }));
    return true;
  }
};

const shouldProxyToStudentPortal = (pathname) => {
  if (pathname === '/dashboard') return true;
  if (pathname.startsWith('/dashboard/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/student-portal-next/')) return true;
  return false;
};

const proxyToStudentPortal = (req, res, incomingUrl) => {
  return new Promise((resolve) => {
    try {
      const origin = getStudentPortalOrigin(req.headers.host);
      const target = new URL(`${incomingUrl.pathname}${incomingUrl.search || ''}`, origin);
      const requestHeaders = { ...req.headers };
      requestHeaders.host = target.host;

      const upstream = http.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          method: req.method,
          path: `${target.pathname}${target.search}`,
          headers: requestHeaders,
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
          upstreamRes.pipe(res);
          upstreamRes.on('end', () => resolve(true));
        }
      );

      upstream.on('error', () => {
        applySecurityHeaders(res);
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Student portal dev server is unavailable.' }));
        resolve(true);
      });

      req.pipe(upstream);
    } catch (err) {
      applySecurityHeaders(res);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err && err.message ? err.message : 'Proxy error.' }));
      resolve(true);
    }
  });
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `${PUBLIC_ORIGIN}`);
    let pathname = decodeURIComponent(url.pathname || '/');

    if (await tryHandleDevHealth(req, res, pathname)) return;

    if (await tryHandleApi(req, res, pathname)) return;

    if (shouldProxyToStudentPortal(pathname)) {
      await proxyToStudentPortal(req, res, url);
      return;
    }

    if (pathname === '/') pathname = '/index.html';

    let filePath = safeJoin(ROOT, pathname);
    if (!filePath) {
      applySecurityHeaders(res);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }

    if ((!existsSync(filePath) || !statSync(filePath).isFile()) && !path.extname(pathname)) {
      const htmlPath = safeJoin(ROOT, `${pathname}.html`);
      if (htmlPath && existsSync(htmlPath) && statSync(htmlPath).isFile()) {
        filePath = htmlPath;
      }
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      applySecurityHeaders(res);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    // Basic no-cache for dev so changes appear immediately.
    applySecurityHeaders(res);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, max-age=0',
    });

    createReadStream(filePath).pipe(res);
  } catch (err) {
    applySecurityHeaders(res);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err && err.message ? err.message : 'Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dev server running: http://0.0.0.0:${PORT}/`);
});
