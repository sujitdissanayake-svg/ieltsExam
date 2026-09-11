# IELTS Web Application

## Local dev

- Run: `npm run dev`
- Default URL: `http://0.0.0.0:5500/`
- The dev server loads `.env` and `.env.local` automatically before serving pages and `/api/*` handlers.
- The dev server also supports clean routes (for example `/portal`, `/free-mock-test`, `/dashboard`) and proxies `/dashboard` plus `/_next/*` to the student portal dev server.

This repo includes a simple Node dev server (`dev-server.mjs`) that serves static pages **and** runs the `/api/*` handlers locally.

### Email OTP registration

To activate registration with email OTP locally or on Vercel, configure:

- `VERIFICATION_TOKEN_SECRET` — random secret used to sign OTP tokens
- `ZOHO_SMTP_USER` — SMTP mailbox username
- `ZOHO_SMTP_PASS` — SMTP mailbox password or app password
- `ZOHO_SMTP_HOST` — optional, defaults to `smtppro.zoho.com`
- `ZOHO_SMTP_PORT` — optional, defaults to `465`
- `ZOHO_SMTP_SECURE` — optional, `true` or `false`
- `SENDER_NAME` — optional display name shown in the recipient inbox, defaults to `IELTS Cambridge`
- `SENDER_EMAIL` — optional sender address
- `REPLY_TO_EMAIL` — optional reply-to address

Example local `.env.local`:

```env
VERIFICATION_TOKEN_SECRET=replace-with-a-long-random-string
ZOHO_SMTP_USER=info@example.com
ZOHO_SMTP_PASS=replace-with-app-password
ZOHO_SMTP_HOST=smtppro.zoho.com
ZOHO_SMTP_PORT=465
ZOHO_SMTP_SECURE=true
SENDER_NAME=IELTS Cambridge
SENDER_EMAIL=info@example.com
REPLY_TO_EMAIL=info@example.com
```

### Admin panel

- Admin page: `/director-panel.html`
- In local dev (no env configured), the Live Dashboard password is `admin`.

## Production (Vercel)

Vercel hosts:

- Static pages (the `.html`, `.css`, assets)
- Serverless Functions (the `/api` folder)

To make the admin dashboard show **real student counts / activity / examiner slots across devices**, you need a database connection.

### Recommended: Vercel Postgres / Neon

Deploy with a Postgres database connected to your Vercel project. The API layer auto-creates tables on first use.

### Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**:

- `POSTGRES_URL` — provided by the Vercel Postgres/Neon integration
- `AUTH_TOKEN_SECRET` — a long random string (used to sign admin/examiner JWTs)
- `DIRECTOR_PASSWORD_HASH` — SHA-256 hex of: `DIRECTOR_PASSWORD + ':' + AUTH_TOKEN_SECRET`
- `ADMIN_IP_ALLOWLIST` — optional comma-separated IP rules allowed for admin login and all `/api/admin/*` endpoints (examples: `203.0.113.10,198.51.100.*`)
- `ADMIN_SECURITY_ALERT_EMAIL` — optional override recipient for repeated failed admin login alerts (default: `sujit.dissanayake@gmail.com`)
- `ADMIN_SECURITY_ALERT_BACKUP_EMAIL` — optional backup recipient for repeated failed admin login alerts (default: `info@ieltscambridge.com`)
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST URL for distributed API rate limiting
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token for distributed API rate limiting

Rate-limit backend priority:

1. Upstash Redis (when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set)
2. Postgres shared buckets (when `POSTGRES_URL` is set)
3. In-memory per instance fallback (when neither shared backend is available)

How to generate `DIRECTOR_PASSWORD_HASH` locally:

```powershell
node -e "const crypto=require('crypto'); const pwd='YOUR_DIRECTOR_PASSWORD'; const secret='YOUR_AUTH_TOKEN_SECRET'; console.log(crypto.createHash('sha256').update(pwd+':'+secret,'utf8').digest('hex'))"
```

### Examiner portal

- Examiner login page: `/examiner-portal.html`
- Examiners are created from the Admin Panel (Live Dashboard → Examiners).
- Local dev-server fallback: when no examiner record exists, the server can auto-bootstrap a dev examiner login (enabled by default with `ALLOW_EXAMINER_DEV_BOOTSTRAP=1`).
- Default dev examiner credentials: `sujit.dissanayake@gmail.com` / `sujit@Exam001` (override via `EXAMINER_DEV_EMAIL` and `EXAMINER_DEV_PASSWORD`).

Students will later be able to see speaking slots via:

- `GET /api/speaking/slots?date=YYYY-MM-DD`

### Admin security events

- Admin-only endpoint: `GET /api/admin/security-events?limit=100`
- Returns latest in-memory security events such as blocked network attempts, failed logins, alert send status, and successful admin logins.
