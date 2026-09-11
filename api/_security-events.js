const crypto = require('crypto');

const MAX_EVENTS = 500;

let sql = null;
let hasPg = false;
try {
  // eslint-disable-next-line global-require
  const pg = require('@vercel/postgres');
  sql = pg && pg.sql ? pg.sql : null;
  hasPg = !!(sql && process.env.POSTGRES_URL);
} catch (_) {
  sql = null;
  hasPg = false;
}

let schemaReady = false;

function makeId() {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }
}

function getStore() {
  if (!global.__securityEventsStore) {
    global.__securityEventsStore = [];
  }
  return global.__securityEventsStore;
}

async function ensureSchema() {
  if (!hasPg || schemaReady) return;

  await sql`
    create table if not exists security_events (
      id text primary key,
      event_type text not null,
      details jsonb,
      created_at timestamptz not null default now()
    );
  `;
  await sql`create index if not exists security_events_created_at_idx on security_events (created_at desc);`;
  schemaReady = true;
}

async function logSecurityEvent(type, details) {
  const eventType = String(type || '').trim() || 'unknown';
  const event = {
    id: makeId(),
    type: eventType,
    createdAt: new Date().toISOString(),
    details: details && typeof details === 'object' ? details : {},
  };

  if (!hasPg) {
    const store = getStore();
    store.push(event);
    if (store.length > MAX_EVENTS) {
      store.splice(0, store.length - MAX_EVENTS);
    }
    return event;
  }

  try {
    await ensureSchema();
    await sql`
      insert into security_events (id, event_type, details)
      values (${event.id}, ${event.type}, ${event.details});
    `;
    return event;
  } catch (_) {
    const store = getStore();
    store.push(event);
    if (store.length > MAX_EVENTS) {
      store.splice(0, store.length - MAX_EVENTS);
    }
    return event;
  }
}

async function getSecurityEvents(limit) {
  const n = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!hasPg) {
    const store = getStore();
    return store.slice(-n).reverse();
  }

  try {
    await ensureSchema();
    const result = await sql`
      select id, event_type, details, created_at
      from security_events
      order by created_at desc
      limit ${n};
    `;
    return (result.rows || []).map((row) => ({
      id: row.id,
      type: row.event_type,
      details: row.details || {},
      createdAt: row.created_at,
    }));
  } catch (_) {
    const store = getStore();
    return store.slice(-n).reverse();
  }
}

module.exports = {
  logSecurityEvent,
  getSecurityEvents,
};
