const crypto = require('crypto');

const CANDIDATE_NUMBER_SEED = 50250;
const CANDIDATE_NUMBER_START = CANDIDATE_NUMBER_SEED;
const FREE_MOCK_MAX_ATTEMPTS = 1;

let sql = null;
let hasPg = false;
try {
  // Only use Postgres when POSTGRES_URL is present (Vercel/Neon integration).
  // Falls back to in-memory store for local dev.
  // eslint-disable-next-line global-require
  const pg = require('@vercel/postgres');
  sql = pg && pg.sql ? pg.sql : null;
  hasPg = !!(sql && process.env.POSTGRES_URL);
} catch (_) {
  sql = null;
  hasPg = false;
}

const mem = global.__ieltsMemStore || {
  usersById: new Map(),
  userIdByEmail: new Map(),
  tests: [],
  payments: [],
  results: [],
  activities: [],
  availability: [],
  speakingBookings: [],
  nextCandidateNumber: CANDIDATE_NUMBER_START,
};
if (!(mem.usersById instanceof Map)) mem.usersById = new Map();
if (!(mem.userIdByEmail instanceof Map)) mem.userIdByEmail = new Map();
if (!Array.isArray(mem.tests)) mem.tests = [];
if (!Array.isArray(mem.payments)) mem.payments = [];
if (!Array.isArray(mem.results)) mem.results = [];
if (!Array.isArray(mem.activities)) mem.activities = [];
if (!Array.isArray(mem.availability)) mem.availability = [];
if (!Array.isArray(mem.speakingBookings)) mem.speakingBookings = [];
if (!Number.isFinite(Number(mem.nextCandidateNumber))) mem.nextCandidateNumber = CANDIDATE_NUMBER_START;
if (Number(mem.nextCandidateNumber) < CANDIDATE_NUMBER_START) mem.nextCandidateNumber = CANDIDATE_NUMBER_START;
mem.availability = mem.availability.map((slot) => ({
  ...slot,
  status: String((slot && slot.status) || 'pending').trim().toLowerCase() || 'pending',
  durationMinutes:
    Number((slot && slot.durationMinutes) || 0) ||
    Math.max(0, Math.round((new Date(slot.endTs).valueOf() - new Date(slot.startTs).valueOf()) / 60000)),
  zoomLink: String((slot && slot.zoomLink) || '').trim(),
  sessionNote: String((slot && slot.sessionNote) || '').trim(),
  adminNote: String((slot && slot.adminNote) || '').trim(),
  approvedAt: (slot && slot.approvedAt) || '',
  approvedBy: (slot && slot.approvedBy) || '',
}));
mem.speakingBookings = mem.speakingBookings.map((booking) => ({
  id: String((booking && booking.id) || '').trim() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  userId: String((booking && booking.userId) || '').trim(),
  slotId: String((booking && booking.slotId) || '').trim(),
  packageName: String((booking && booking.packageName) || '').trim(),
  bookedAt: String((booking && booking.bookedAt) || '').trim() || new Date().toISOString(),
  createdAt: String((booking && booking.createdAt) || '').trim() || new Date().toISOString(),
  meta: booking && typeof booking.meta === 'object' ? booking.meta : {},
})).filter((booking) => booking.userId && booking.slotId);
Array.from(mem.usersById.values())
  .filter((user) => String(user && user.role || '') === 'student' && !(Number(user.candidateNumber) >= CANDIDATE_NUMBER_START))
  .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  .forEach((user) => {
    user.candidateNumber = Number(mem.nextCandidateNumber) || CANDIDATE_NUMBER_START;
    mem.nextCandidateNumber = Number(user.candidateNumber) + 1;
    mem.usersById.set(user.id, user);
  });
// Persist across hot reloads in local dev.
global.__ieltsMemStore = mem;

const makeId = () => {
  try {
    return crypto.randomUUID();
  } catch (_) {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

let schemaReady = false;
const ensureSchema = async () => {
  if (!hasPg) return;
  if (schemaReady) return;

  await sql`
    create table if not exists users (
      id text primary key,
      email text unique not null,
      name text,
      whatsapp text,
      dob text,
      target_band_score numeric(2,1),
      role text not null default 'student',
      candidate_number integer unique,
      password_hash text,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    alter table users add column if not exists dob text;
  `;

  await sql`
    alter table users add column if not exists target_band_score numeric(2,1);
  `;

  await sql`
    create sequence if not exists candidate_number_seq;
  `;

  await sql`
    select setval(
      'candidate_number_seq',
      greatest(
        ${CANDIDATE_NUMBER_START - 1},
        coalesce((select max(candidate_number) from users where role = 'student'), ${CANDIDATE_NUMBER_START - 1})
      ),
      true
    );
  `;

  await sql`
    alter table users add column if not exists candidate_number integer unique;
  `;

  await sql`
    update users
    set candidate_number = nextval('candidate_number_seq')
    where role = 'student' and candidate_number is null;
  `;

  await sql`
    create table if not exists tests (
      id serial primary key,
      name text not null,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists payments (
      id text primary key,
      user_id text references users(id) on delete set null,
      amount integer not null default 0,
      currency text not null default 'LKR',
      status text not null default 'paid',
      method text not null default 'manual',
      meta jsonb,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists results (
      id text primary key,
      user_id text references users(id) on delete cascade,
      test_name text,
      module text not null,
      source text not null default 'manual',
      band_score numeric(3,1),
      raw_score integer,
      max_score integer,
      status text not null default 'draft',
      notes text,
      artifact_url text,
      meta jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists activity (
      id text primary key,
      user_id text references users(id) on delete cascade,
      type text not null,
      meta jsonb,
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists examiner_availability (
      id text primary key,
      examiner_id text references users(id) on delete cascade,
      start_ts timestamptz not null,
      end_ts timestamptz not null,
      duration_minutes integer not null default 10,
      status text not null default 'pending',
      zoom_link text,
      session_note text,
      admin_note text,
      approved_at timestamptz,
      approved_by text,
      created_at timestamptz not null default now(),
      unique (examiner_id, start_ts, end_ts)
    );
  `;

  await sql`
    create table if not exists speaking_bookings (
      id text primary key,
      user_id text references users(id) on delete cascade,
      slot_id text references examiner_availability(id) on delete cascade,
      package_name text,
      booked_at timestamptz not null default now(),
      meta jsonb,
      created_at timestamptz not null default now(),
      unique (slot_id),
      unique (user_id, slot_id)
    );
  `;

  await sql`alter table examiner_availability add column if not exists duration_minutes integer not null default 10;`;
  await sql`alter table examiner_availability add column if not exists status text not null default 'pending';`;
  await sql`alter table examiner_availability add column if not exists zoom_link text;`;
  await sql`alter table examiner_availability add column if not exists session_note text;`;
  await sql`alter table examiner_availability add column if not exists admin_note text;`;
  await sql`alter table examiner_availability add column if not exists approved_at timestamptz;`;
  await sql`alter table examiner_availability add column if not exists approved_by text;`;
  await sql`alter table speaking_bookings add column if not exists package_name text;`;
  await sql`alter table speaking_bookings add column if not exists booked_at timestamptz not null default now();`;
  await sql`alter table speaking_bookings add column if not exists meta jsonb;`;
  await sql`alter table speaking_bookings add column if not exists created_at timestamptz not null default now();`;

  schemaReady = true;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeMockPackageName = (value) => {
  const raw = String(value || '').trim();
  if (raw === 'Lite' || raw === 'Basic' || raw === 'Standard' || raw === 'Pro') return raw;
  return '';
};

const isVerifiedPaidMockPayment = (payment) => {
  if (!payment || String((payment && payment.status) || '').toLowerCase() !== 'paid') return false;

  const meta = payment && payment.meta && typeof payment.meta === 'object' ? payment.meta : {};
  const packageName = normalizeMockPackageName(meta.package || '');
  if (!packageName) return false;

  const method = String((payment && payment.method) || '').trim().toLowerCase();
  const stripeSessionId = String(meta.stripeSessionId || meta.sessionId || '').trim();
  const sessionLinked = meta.sessionLinked === true || String(meta.sessionLinked || '').trim().toLowerCase() === 'true';

  if (method === 'stripe') {
    return !!stripeSessionId || sessionLinked;
  }

  return true;
};

const isModernCandidateNumber = (value) => {
  const candidateNumber = Number(value) || 0;
  return candidateNumber >= CANDIDATE_NUMBER_START && candidateNumber < 250000;
};

const normalizeMemCandidateNumbers = () => {
  const students = Array.from(mem.usersById.values())
    .filter((user) => String(user && user.role || '') === 'student')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  if (!students.length) {
    mem.nextCandidateNumber = CANDIDATE_NUMBER_START;
    return;
  }

  const hasModernNumbers = students.some((user) => isModernCandidateNumber(user.candidateNumber));
  if (!hasModernNumbers) {
    let nextNumber = CANDIDATE_NUMBER_START;
    students.forEach((user) => {
      user.candidateNumber = nextNumber;
      nextNumber += 1;
      mem.usersById.set(user.id, user);
    });
    mem.nextCandidateNumber = nextNumber;
    return;
  }

  let nextNumber = students.reduce((maxValue, user) => {
    const candidateNumber = Number(user.candidateNumber) || 0;
    return isModernCandidateNumber(candidateNumber) ? Math.max(maxValue, candidateNumber) : maxValue;
  }, CANDIDATE_NUMBER_START - 1) + 1;

  students.forEach((user) => {
    if (isModernCandidateNumber(user.candidateNumber)) return;
    user.candidateNumber = nextNumber;
    nextNumber += 1;
    mem.usersById.set(user.id, user);
  });
  mem.nextCandidateNumber = nextNumber;
};

const normalizePgCandidateNumbers = async () => {
  await sql`
    with student_stats as (
      select
        count(*) filter (where candidate_number >= ${CANDIDATE_NUMBER_START} and candidate_number < 250000) as modern_count,
        count(*) filter (where candidate_number is null or candidate_number >= 250000 or candidate_number < ${CANDIDATE_NUMBER_START}) as legacy_count
      from users
      where role = 'student'
    ),
    ordered_students as (
      select id, row_number() over (order by created_at asc, id asc) as seq
      from users
      where role = 'student'
    )
    update users u
    set candidate_number = ${CANDIDATE_NUMBER_START - 1} + ordered_students.seq
    from ordered_students, student_stats
    where u.id = ordered_students.id
      and student_stats.legacy_count > 0
      and student_stats.modern_count = 0;
  `;

  await sql`
    select setval(
      'candidate_number_seq',
      greatest(
        ${CANDIDATE_NUMBER_START - 1},
        coalesce((select max(candidate_number) from users where role = 'student'), ${CANDIDATE_NUMBER_START - 1})
      ),
      true
    );
  `;
};

const getNextCandidateNumber = async () => {
  if (!hasPg) {
    normalizeMemCandidateNumbers();
    const next = Number(mem.nextCandidateNumber) || CANDIDATE_NUMBER_START;
    mem.nextCandidateNumber = next + 1;
    return next;
  }

  await ensureSchema();
  await normalizePgCandidateNumbers();
  const result = await sql`select nextval('candidate_number_seq') as candidate_number;`;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  return Number(row && row.candidate_number) || CANDIDATE_NUMBER_START;
};

const getCandidateProgressRows = ({ students, payments, results, activities }) => {
  const paymentCounts = new Map();
  const completedCounts = new Map();
  const lastActivityAt = new Map();

  (payments || []).forEach((payment) => {
    const userId = String((payment && payment.userId) || '').trim();
    if (!userId) return;
    if (!isVerifiedPaidMockPayment(payment)) return;
    paymentCounts.set(userId, (paymentCounts.get(userId) || 0) + 1);
  });

  (results || []).forEach((result) => {
    const userId = String((result && result.userId) || '').trim();
    if (!userId) return;
    const resultStatus = String((result && result.status) || '').toLowerCase();
    if (resultStatus !== 'published' && resultStatus !== 'review' && resultStatus !== 'draft') return;
    completedCounts.set(userId, (completedCounts.get(userId) || 0) + 1);
  });

  (activities || []).forEach((activity) => {
    const userId = String((activity && activity.userId) || '').trim();
    if (!userId) return;
    const createdAt = String((activity && activity.createdAt) || '');
    if (!createdAt) return;
    const previous = String(lastActivityAt.get(userId) || '');
    if (!previous || previous.localeCompare(createdAt) < 0) {
      lastActivityAt.set(userId, createdAt);
    }
  });

  return (students || []).map((student) => {
    const userId = String((student && student.id) || '').trim();
    const purchasedCount = paymentCounts.get(userId) || 0;
    const completedCount = completedCounts.get(userId) || 0;
    return {
      ...student,
      paidMockTestsPurchased: purchasedCount,
      completedMockTests: completedCount,
      remainingMockTests: Math.max(0, purchasedCount - completedCount),
      paymentStatus: purchasedCount > 0 ? 'paid' : 'free',
      lastActivityAt: String(student && student.lastActivityAt || '') || String(lastActivityAt.get(userId) || ''),
    };
  });
};

const upsertStudent = async ({ email, name = '', whatsapp = '', dob = '', targetBandScore = 0, passwordHash = '' }) => {
  const e = normalizeEmail(email);
  if (!e) throw new Error('Missing email.');
  const normalizedTargetBandScore = Number(targetBandScore);
  const sanitizedTargetBandScore = Number.isFinite(normalizedTargetBandScore)
    ? Math.max(0, Math.min(9, normalizedTargetBandScore))
    : 0;

  if (!hasPg) {
    const existingId = mem.userIdByEmail.get(e);
    if (existingId) {
      const user = mem.usersById.get(existingId);
      const updated = {
        ...user,
        name: name || user.name || '',
        whatsapp: whatsapp || user.whatsapp || '',
        dob: dob || user.dob || '',
        targetBandScore: sanitizedTargetBandScore || Number(user.targetBandScore) || 0,
        passwordHash: passwordHash || user.passwordHash || '',
      };
      mem.usersById.set(existingId, updated);
      return updated;
    }

    const id = makeId();
    const user = {
      id,
      email: e,
      name: name || '',
      whatsapp: whatsapp || '',
      dob: dob || '',
      targetBandScore: sanitizedTargetBandScore,
      role: 'student',
      candidateNumber: await getNextCandidateNumber(),
      passwordHash: passwordHash || '',
      createdAt: new Date().toISOString(),
    };
    mem.usersById.set(id, user);
    mem.userIdByEmail.set(e, id);
    return user;
  }

  await ensureSchema();

  const id = makeId();
  const result = await sql`
    insert into users (id, email, name, whatsapp, dob, target_band_score, role, candidate_number, password_hash)
    values (
      ${id},
      ${e},
      ${String(name || '')},
      ${String(whatsapp || '')},
      ${String(dob || '')},
      ${sanitizedTargetBandScore || null},
      'student',
      nextval('candidate_number_seq'),
      ${String(passwordHash || '')}
    )
    on conflict (email) do update set
      name = case when excluded.name <> '' then excluded.name else users.name end,
      whatsapp = case when excluded.whatsapp <> '' then excluded.whatsapp else users.whatsapp end,
      dob = case when excluded.dob <> '' then excluded.dob else users.dob end,
      target_band_score = case when excluded.target_band_score is not null and excluded.target_band_score > 0 then excluded.target_band_score else users.target_band_score end,
      password_hash = case when excluded.password_hash <> '' then excluded.password_hash else users.password_hash end,
      role = users.role
    returning id, email, name, whatsapp, dob, target_band_score, role, candidate_number, created_at;
  `;

  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    whatsapp: row.whatsapp || '',
    dob: row.dob || '',
    targetBandScore: Number(row.target_band_score) || 0,
    role: row.role,
    candidateNumber: Number(row.candidate_number) || 0,
    createdAt: row.created_at,
  };
};

const promoteToExaminer = async ({ email, name = '', passwordHash }) => {
  const e = normalizeEmail(email);
  if (!e) throw new Error('Missing email.');
  if (!passwordHash) throw new Error('Missing password.');

  if (!hasPg) {
    const existingId = mem.userIdByEmail.get(e);
    if (existingId) {
      const user = mem.usersById.get(existingId);
      const updated = {
        ...user,
        role: 'examiner',
        name: name || user.name || '',
        passwordHash,
      };
      mem.usersById.set(existingId, updated);
      return updated;
    }

    const id = makeId();
    const user = {
      id,
      email: e,
      name: name || '',
      whatsapp: '',
      role: 'examiner',
      candidateNumber: 0,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    mem.usersById.set(id, user);
    mem.userIdByEmail.set(e, id);
    return user;
  }

  await ensureSchema();

  const id = makeId();
  const result = await sql`
    insert into users (id, email, name, role, password_hash)
    values (${id}, ${e}, ${String(name || '')}, 'examiner', ${String(passwordHash)})
    on conflict (email) do update set
      role = 'examiner',
      name = case when excluded.name <> '' then excluded.name else users.name end,
      password_hash = excluded.password_hash
    returning id, email, name, whatsapp, role, candidate_number, created_at;
  `;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    whatsapp: row.whatsapp || '',
    role: row.role,
    candidateNumber: Number(row.candidate_number) || 0,
    createdAt: row.created_at,
  };
};

const getUserByEmail = async (email) => {
  const e = normalizeEmail(email);
  if (!e) return null;

  if (!hasPg) {
    const id = mem.userIdByEmail.get(e);
    return id ? mem.usersById.get(id) : null;
  }

  await ensureSchema();
  const result = await sql`select id, email, name, whatsapp, dob, target_band_score, role, candidate_number, password_hash, created_at from users where email = ${e} limit 1;`;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    whatsapp: row.whatsapp || '',
    dob: row.dob || '',
    targetBandScore: Number(row.target_band_score) || 0,
    role: row.role,
    candidateNumber: Number(row.candidate_number) || 0,
    passwordHash: row.password_hash || '',
    createdAt: row.created_at,
  };
};

const updateStudentPasswordByEmail = async ({ email, passwordHash }) => {
  const e = normalizeEmail(email);
  const nextHash = String(passwordHash || '').trim();
  if (!e) throw new Error('Missing email.');
  if (!nextHash) throw new Error('Missing password hash.');

  if (!hasPg) {
    const id = mem.userIdByEmail.get(e);
    if (!id) return null;
    const user = mem.usersById.get(id);
    if (!user || String(user.role || '').toLowerCase() !== 'student') return null;

    const updated = {
      ...user,
      passwordHash: nextHash,
    };
    mem.usersById.set(id, updated);
    return updated;
  }

  await ensureSchema();
  const result = await sql`
    update users
    set password_hash = ${nextHash}
    where email = ${e} and role = 'student'
    returning id, email, name, whatsapp, dob, target_band_score, role, candidate_number, password_hash, created_at;
  `;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    whatsapp: row.whatsapp || '',
    dob: row.dob || '',
    targetBandScore: Number(row.target_band_score) || 0,
    role: row.role,
    candidateNumber: Number(row.candidate_number) || 0,
    passwordHash: row.password_hash || '',
    createdAt: row.created_at,
  };
};

const listUsers = async ({ limit = 50, offset = 0 } = {}) => {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);

  if (!hasPg) {
    normalizeMemCandidateNumbers();
    const arr = Array.from(mem.usersById.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const slice = arr.slice(off, off + lim);
    const withLast = slice.map((u) => {
      const last = mem.activities
        .filter((ev) => ev.userId === u.id)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      return {
        id: u.id,
        email: u.email,
        name: u.name || '',
        whatsapp: u.whatsapp || '',
        dob: u.dob || '',
        targetBandScore: Number(u.targetBandScore) || 0,
        role: u.role || 'student',
        candidateNumber: Number(u.candidateNumber) || 0,
        createdAt: u.createdAt,
        lastActivityAt: last ? last.createdAt : '',
      };
    });
    return withLast;
  }

  await ensureSchema();
  await normalizePgCandidateNumbers();
  const result = await sql`
    select
      u.id, u.email, u.name, u.whatsapp, u.dob, u.target_band_score, u.role, u.candidate_number, u.created_at,
      (select max(a.created_at) from activity a where a.user_id = u.id) as last_activity_at
    from users u
    order by u.created_at desc;
  `;

  return (result.rows || [])
    .slice(off, off + lim)
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name || '',
      whatsapp: row.whatsapp || '',
      dob: row.dob || '',
      targetBandScore: Number(row.target_band_score) || 0,
      role: row.role,
      candidateNumber: Number(row.candidate_number) || 0,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at || '',
    }));
};

const deleteUsersByEmails = async (emails) => {
  const targets = Array.isArray(emails)
    ? emails.map(normalizeEmail).filter(Boolean)
    : [];
  if (!targets.length) return { deleted: 0 };

  if (!hasPg) {
    let deleted = 0;
    targets.forEach((email) => {
      const id = mem.userIdByEmail.get(email);
      if (!id) return;
      mem.userIdByEmail.delete(email);
      mem.usersById.delete(id);
      mem.activities = mem.activities.filter((item) => item.userId !== id);
      mem.results = mem.results.filter((item) => item.userId !== id);
      mem.payments = mem.payments.filter((item) => item.userId !== id);
      deleted += 1;
    });
    return { deleted };
  }

  await ensureSchema();
  const result = await sql`delete from users where email = any(${targets})`;
  return { deleted: Number(result.rowCount) || 0 };
};

const logActivity = async ({ userId, type, meta }) => {
  if (!userId) throw new Error('Missing userId.');
  const t = String(type || '').trim();
  if (!t) throw new Error('Missing type.');

  const id = makeId();
  const createdAt = new Date().toISOString();
  const record = {
    id,
    userId,
    type: t,
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt,
  };

  if (!hasPg) {
    mem.activities.push(record);
    return record;
  }

  await ensureSchema();
  await sql`
    insert into activity (id, user_id, type, meta)
    values (${id}, ${String(userId)}, ${t}, ${record.meta});
  `;
  return record;
};

const listActivities = async ({ userId, limit = 100 } = {}) => {
  if (!userId) throw new Error('Missing userId.');
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));

  if (!hasPg) {
    return mem.activities
      .filter((ev) => ev.userId === userId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim);
  }

  await ensureSchema();
  const result = await sql`
    select id, user_id, type, meta, created_at
    from activity
    where user_id = ${String(userId)}
    order by created_at desc
    limit ${lim};
  `;
  return (result.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    meta: row.meta || {},
    createdAt: row.created_at,
  }));
};

const getMetrics = async () => {
  if (!hasPg) {
    const totalUsers = mem.usersById.size;
    const totalPayments = mem.payments.length;
    const totalExaminers = Array.from(mem.usersById.values()).filter((u) => u.role === 'examiner').length;
    return {
      users: totalUsers,
      payments: totalPayments,
      examiners: totalExaminers,
    };
  }

  await ensureSchema();
  const users = await sql`select count(*)::int as c from users;`;
  const payments = await sql`select count(*)::int as c from payments;`;
  const examiners = await sql`select count(*)::int as c from users where role = 'examiner';`;
  return {
    users: (users.rows && users.rows[0] && users.rows[0].c) || 0,
    payments: (payments.rows && payments.rows[0] && payments.rows[0].c) || 0,
    examiners: (examiners.rows && examiners.rows[0] && examiners.rows[0].c) || 0,
  };
};

const listPayments = async ({ status = '', limit = 200 } = {}) => {
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const wantedStatus = String(status || '').trim().toLowerCase();

  if (!hasPg) {
    return mem.payments
      .filter((payment) => !wantedStatus || String(payment.status || '').toLowerCase() === wantedStatus)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, lim);
  }

  await ensureSchema();
  const result = wantedStatus
    ? await sql`
        select p.id, p.user_id, p.amount, p.currency, p.status, p.method, p.meta, p.created_at,
               u.name, u.email, u.whatsapp, u.candidate_number
        from payments p
        left join users u on u.id = p.user_id
        where lower(p.status) = ${wantedStatus}
        order by p.created_at desc
        limit ${lim};
      `
    : await sql`
        select p.id, p.user_id, p.amount, p.currency, p.status, p.method, p.meta, p.created_at,
               u.name, u.email, u.whatsapp, u.candidate_number
        from payments p
        left join users u on u.id = p.user_id
        order by p.created_at desc
        limit ${lim};
      `;

  return (result.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id || '',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'LKR',
    status: row.status || 'paid',
    method: row.method || 'manual',
    meta: row.meta || {},
    createdAt: row.created_at,
    name: row.name || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    candidateNumber: Number(row.candidate_number) || 0,
  }));
};

const createPayment = async ({ userId, amount, currency = 'LKR', status = 'paid', method = 'manual', meta } = {}) => {
  if (!userId) throw new Error('Missing userId.');
  const normalizedAmount = Math.max(0, Number(amount) || 0);
  const record = {
    id: makeId(),
    userId: String(userId),
    amount: normalizedAmount,
    currency: String(currency || 'LKR').trim().toUpperCase() || 'LKR',
    status: String(status || 'paid').trim().toLowerCase() || 'paid',
    method: String(method || 'manual').trim().toLowerCase() || 'manual',
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: new Date().toISOString(),
  };

  if (!hasPg) {
    const user = mem.usersById.get(record.userId);
    mem.payments.push({
      ...record,
      name: user && user.name ? user.name : '',
      email: user && user.email ? user.email : '',
      whatsapp: user && user.whatsapp ? user.whatsapp : '',
      candidateNumber: user && user.candidateNumber ? user.candidateNumber : 0,
    });
    return record;
  }

  await ensureSchema();
  await sql`
    insert into payments (id, user_id, amount, currency, status, method, meta)
    values (${record.id}, ${record.userId}, ${record.amount}, ${record.currency}, ${record.status}, ${record.method}, ${record.meta});
  `;
  return record;
};

const listResults = async ({ limit = 200, module = '', userId = '' } = {}) => {
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const wantedModule = String(module || '').trim().toLowerCase();
  const wantedUserId = String(userId || '').trim();

  if (!hasPg) {
    return mem.results
      .filter((result) => (!wantedModule || result.module === wantedModule) && (!wantedUserId || result.userId === wantedUserId))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, lim);
  }

  await ensureSchema();
  let result;
  if (wantedModule && wantedUserId) {
    result = await sql`
      select r.id, r.user_id, r.test_name, r.module, r.source, r.band_score, r.raw_score, r.max_score, r.status,
             r.notes, r.artifact_url, r.meta, r.created_at, r.updated_at,
             u.name, u.email, u.whatsapp, u.candidate_number
      from results r
      left join users u on u.id = r.user_id
      where lower(r.module) = ${wantedModule} and r.user_id = ${wantedUserId}
      order by r.updated_at desc
      limit ${lim};
    `;
  } else if (wantedModule) {
    result = await sql`
      select r.id, r.user_id, r.test_name, r.module, r.source, r.band_score, r.raw_score, r.max_score, r.status,
             r.notes, r.artifact_url, r.meta, r.created_at, r.updated_at,
             u.name, u.email, u.whatsapp, u.candidate_number
      from results r
      left join users u on u.id = r.user_id
      where lower(r.module) = ${wantedModule}
      order by r.updated_at desc
      limit ${lim};
    `;
  } else if (wantedUserId) {
    result = await sql`
      select r.id, r.user_id, r.test_name, r.module, r.source, r.band_score, r.raw_score, r.max_score, r.status,
             r.notes, r.artifact_url, r.meta, r.created_at, r.updated_at,
             u.name, u.email, u.whatsapp, u.candidate_number
      from results r
      left join users u on u.id = r.user_id
      where r.user_id = ${wantedUserId}
      order by r.updated_at desc
      limit ${lim};
    `;
  } else {
    result = await sql`
      select r.id, r.user_id, r.test_name, r.module, r.source, r.band_score, r.raw_score, r.max_score, r.status,
             r.notes, r.artifact_url, r.meta, r.created_at, r.updated_at,
             u.name, u.email, u.whatsapp, u.candidate_number
      from results r
      left join users u on u.id = r.user_id
      order by r.updated_at desc
      limit ${lim};
    `;
  }

  return (result.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    testName: row.test_name || '',
    module: row.module || '',
    source: row.source || 'manual',
    bandScore: row.band_score == null ? null : Number(row.band_score),
    rawScore: row.raw_score == null ? null : Number(row.raw_score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    status: row.status || 'draft',
    notes: row.notes || '',
    artifactUrl: row.artifact_url || '',
    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    candidateNumber: Number(row.candidate_number) || 0,
  }));
};

const upsertResult = async ({ id = '', userId, testName = '', module, source = 'manual', bandScore = null, rawScore = null, maxScore = null, status = 'draft', notes = '', artifactUrl = '', meta } = {}) => {
  if (!userId) throw new Error('Missing userId.');
  const normalizedModule = String(module || '').trim().toLowerCase();
  if (!normalizedModule) throw new Error('Missing module.');

  const record = {
    id: String(id || makeId()),
    userId: String(userId),
    testName: String(testName || '').trim(),
    module: normalizedModule,
    source: String(source || 'manual').trim().toLowerCase() || 'manual',
    bandScore: bandScore === '' || bandScore == null ? null : Number(bandScore),
    rawScore: rawScore === '' || rawScore == null ? null : Number(rawScore),
    maxScore: maxScore === '' || maxScore == null ? null : Number(maxScore),
    status: String(status || 'draft').trim().toLowerCase() || 'draft',
    notes: String(notes || ''),
    artifactUrl: String(artifactUrl || '').trim(),
    meta: meta && typeof meta === 'object' ? meta : {},
    updatedAt: new Date().toISOString(),
  };

  if (!hasPg) {
    const existingIndex = mem.results.findIndex((item) => item.id === record.id);
    const user = mem.usersById.get(record.userId);
    const nextRecord = {
      ...record,
      createdAt: existingIndex >= 0 ? mem.results[existingIndex].createdAt : record.updatedAt,
      name: user && user.name ? user.name : '',
      email: user && user.email ? user.email : '',
      whatsapp: user && user.whatsapp ? user.whatsapp : '',
      candidateNumber: user && user.candidateNumber ? user.candidateNumber : 0,
    };
    if (existingIndex >= 0) mem.results[existingIndex] = nextRecord;
    else mem.results.push(nextRecord);
    return nextRecord;
  }

  await ensureSchema();
  const result = await sql`
    insert into results (id, user_id, test_name, module, source, band_score, raw_score, max_score, status, notes, artifact_url, meta)
    values (
      ${record.id},
      ${record.userId},
      ${record.testName},
      ${record.module},
      ${record.source},
      ${record.bandScore},
      ${record.rawScore},
      ${record.maxScore},
      ${record.status},
      ${record.notes},
      ${record.artifactUrl},
      ${record.meta}
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      test_name = excluded.test_name,
      module = excluded.module,
      source = excluded.source,
      band_score = excluded.band_score,
      raw_score = excluded.raw_score,
      max_score = excluded.max_score,
      status = excluded.status,
      notes = excluded.notes,
      artifact_url = excluded.artifact_url,
      meta = excluded.meta,
      updated_at = now()
    returning id, user_id, test_name, module, source, band_score, raw_score, max_score, status, notes, artifact_url, meta, created_at, updated_at;
  `;

  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  return {
    id: row.id,
    userId: row.user_id,
    testName: row.test_name || '',
    module: row.module || '',
    source: row.source || 'manual',
    bandScore: row.band_score == null ? null : Number(row.band_score),
    rawScore: row.raw_score == null ? null : Number(row.raw_score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    status: row.status || 'draft',
    notes: row.notes || '',
    artifactUrl: row.artifact_url || '',
    meta: row.meta || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const getAdminOverview = async () => {
  if (!hasPg) normalizeMemCandidateNumbers();
  const users = await listUsers({ limit: 500, offset: 0 });
  const students = users.filter((user) => String(user.role || '') === 'student');
  const examiners = users.filter((user) => String(user.role || '') === 'examiner');
  const payments = await listPayments({ limit: 500 });
  const results = await listResults({ limit: 500 });
  const speakingSlots = await listSpeakingSlots({ limit: 1000 });
  const activities = hasPg
    ? await ensureSchema().then(function () {
        return normalizePgCandidateNumbers();
      }).then(function () {
        return sql`
        select user_id, max(created_at) as created_at
        from activity
        group by user_id;
      `;
      }).then(function (result) {
        return (result.rows || []).map(function (row) {
          return { userId: row.user_id, createdAt: row.created_at };
        });
      })
    : mem.activities.slice();

  const candidateRows = getCandidateProgressRows({ students, payments, results, activities });

  const paidUserIds = new Set(
    candidateRows
      .filter((student) => Number(student.paidMockTestsPurchased || 0) > 0 && student.id)
      .map((student) => String(student.id))
  );
  const freeOnlyStudents = candidateRows.filter((student) => !paidUserIds.has(String(student.id)));
  const paidStudents = candidateRows.filter((student) => paidUserIds.has(String(student.id)));
  const activeStudentIds = new Set(students.map((student) => String(student.id || '')).filter(Boolean));
  const totalRevenue = payments
    .filter((payment) => {
      const userId = String((payment && payment.userId) || '').trim();
      if (!userId || !activeStudentIds.has(userId)) return false;
      return isVerifiedPaidMockPayment(payment);
    })
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      registeredCandidates: candidateRows.length,
      paidCandidates: paidStudents.length,
      freeOnlyCandidates: freeOnlyStudents.length,
      examiners: examiners.length,
      speakingSlots: speakingSlots.length,
      results: results.length,
      totalRevenue,
    },
    students: candidateRows,
    freeOnlyStudents,
    paidStudents,
    payments,
    examiners,
    speakingSlots,
    results,
    roadmap: {},
  };
};

const listExaminers = async () => {
  if (!hasPg) {
    return Array.from(mem.usersById.values()).filter((u) => u.role === 'examiner');
  }

  await ensureSchema();
  const result = await sql`select id, email, name, created_at from users where role = 'examiner' order by created_at desc;`;
  return (result.rows || []).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name || '',
    role: 'examiner',
    createdAt: r.created_at,
  }));
};

const deleteExaminerByEmail = async (email) => {
  const e = normalizeEmail(email);
  if (!e) throw new Error('Email is required.');

  if (!hasPg) {
    const id = mem.userIdByEmail.get(e);
    if (!id) return { deleted: 0 };

    const user = mem.usersById.get(id);
    if (!user || String(user.role || '') !== 'examiner') return { deleted: 0 };

    mem.userIdByEmail.delete(e);
    mem.usersById.delete(id);
    mem.availability = mem.availability.filter((slot) => String(slot.examinerId || '') !== id);
    mem.activities = mem.activities.filter((item) => String(item.userId || '') !== id);
    mem.results = mem.results.filter((item) => String(item.userId || '') !== id);
    return { deleted: 1 };
  }

  await ensureSchema();
  const result = await sql`
    delete from users
    where email = ${e} and role = 'examiner';
  `;
  return { deleted: Number(result && result.rowCount) || 0 };
};

const normalizeSpeakingStatus = (value) => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'approved' || status === 'booked' || status === 'blocked' || status === 'pending' || status === 'completed') return status;
  return 'pending';
};

const upsertAvailabilitySlots = async ({ examinerId, slots }) => {
  if (!examinerId) throw new Error('Missing examinerId.');
  const list = Array.isArray(slots) ? slots : [];

  const normalized = list
    .map((s) => ({
      start: new Date(String(s.start || '')),
      end: new Date(String(s.end || '')),
      zoomLink: String(s.zoomLink || '').trim(),
      sessionNote: String(s.sessionNote || '').trim(),
    }))
    .filter((s) => {
      if (Number.isNaN(s.start.valueOf()) || Number.isNaN(s.end.valueOf()) || s.end <= s.start) return false;
      const minutes = Math.round((s.end.valueOf() - s.start.valueOf()) / 60000);
      return minutes >= 10 && minutes <= 13;
    });

  if (!normalized.length) return { added: 0 };

  if (!hasPg) {
    let added = 0;
    for (const s of normalized) {
      const startIso = s.start.toISOString();
      const endIso = s.end.toISOString();
      const createdAt = new Date().toISOString();
      const exists = mem.availability.some(
        (a) => a.examinerId === examinerId && a.startTs === startIso && a.endTs === endIso
      );
      if (exists) continue;
      mem.availability.push({
        id: makeId(),
        examinerId,
        startTs: startIso,
        endTs: endIso,
        durationMinutes: Math.round((s.end.valueOf() - s.start.valueOf()) / 60000),
        status: 'approved',
        zoomLink: s.zoomLink,
        sessionNote: s.sessionNote,
        adminNote: '',
        approvedAt: createdAt,
        approvedBy: 'system',
        createdAt: createdAt,
      });
      added += 1;
    }
    return { added };
  }

  await ensureSchema();
  let added = 0;
  for (const s of normalized) {
    const id = makeId();
    const result = await sql`
      insert into examiner_availability (id, examiner_id, start_ts, end_ts, duration_minutes, status, zoom_link, session_note)
      values (
        ${id},
        ${String(examinerId)},
        ${s.start.toISOString()},
        ${s.end.toISOString()},
        ${Math.round((s.end.valueOf() - s.start.valueOf()) / 60000)},
        'approved',
        ${s.zoomLink},
        ${s.sessionNote}
      )
      on conflict (examiner_id, start_ts, end_ts) do nothing;
    `;
    if (result && typeof result.rowCount === 'number') {
      if (result.rowCount > 0) added += 1;
    } else {
      added += 1;
    }
  }

  return { added };
};

const listAvailabilityByDate = async ({ date, status = 'approved', examinerId = '' } = {}) => {
  const d = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Invalid date.');
  const start = new Date(`${d}T00:00:00.000Z`);
  const end = new Date(`${d}T23:59:59.999Z`);
  const wantedStatus = String(status || '').trim().toLowerCase();
  const wantedExaminerId = String(examinerId || '').trim();

  if (!hasPg) {
    return mem.availability
      .filter((a) => {
        const st = new Date(a.startTs);
        if (!(st >= start && st <= end)) return false;
        if (wantedStatus && String(a.status || '').toLowerCase() !== wantedStatus) return false;
        if (wantedExaminerId && String(a.examinerId || '') !== wantedExaminerId) return false;
        return true;
      })
      .sort((a, b) => String(a.startTs).localeCompare(String(b.startTs)))
      .map((a) => ({
        id: a.id,
        examinerId: a.examinerId,
        start: a.startTs,
        end: a.endTs,
        durationMinutes: Number(a.durationMinutes) || 0,
        status: a.status || 'pending',
        zoomLink: a.zoomLink || '',
        sessionNote: a.sessionNote || '',
        adminNote: a.adminNote || '',
        approvedAt: a.approvedAt || '',
        approvedBy: a.approvedBy || '',
      }));
  }

  await ensureSchema();
  let result;
  if (wantedStatus && wantedExaminerId) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by
      from examiner_availability a
      where a.start_ts >= ${start.toISOString()} and a.start_ts <= ${end.toISOString()}
        and lower(a.status) = ${wantedStatus}
        and a.examiner_id = ${wantedExaminerId}
      order by a.start_ts asc;
    `;
  } else if (wantedStatus) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by
      from examiner_availability a
      where a.start_ts >= ${start.toISOString()} and a.start_ts <= ${end.toISOString()}
        and lower(a.status) = ${wantedStatus}
      order by a.start_ts asc;
    `;
  } else if (wantedExaminerId) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by
      from examiner_availability a
      where a.start_ts >= ${start.toISOString()} and a.start_ts <= ${end.toISOString()}
        and a.examiner_id = ${wantedExaminerId}
      order by a.start_ts asc;
    `;
  } else {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by
      from examiner_availability a
      where a.start_ts >= ${start.toISOString()} and a.start_ts <= ${end.toISOString()}
      order by a.start_ts asc;
    `;
  }

  return (result.rows || []).map((r) => ({
    id: r.id,
    examinerId: r.examiner_id,
    start: r.start_ts,
    end: r.end_ts,
    durationMinutes: Number(r.duration_minutes) || 0,
    status: r.status || 'pending',
    zoomLink: r.zoom_link || '',
    sessionNote: r.session_note || '',
    adminNote: r.admin_note || '',
    approvedAt: r.approved_at || '',
    approvedBy: r.approved_by || '',
  }));
};

const listSpeakingSlots = async ({ status = '', examinerId = '', limit = 500 } = {}) => {
  const wantedStatus = String(status || '').trim().toLowerCase();
  const wantedExaminerId = String(examinerId || '').trim();
  const lim = Math.min(1000, Math.max(1, Number(limit) || 500));

  if (!hasPg) {
    return mem.availability
      .filter((slot) => (!wantedStatus || String(slot.status || '').toLowerCase() === wantedStatus) && (!wantedExaminerId || String(slot.examinerId || '') === wantedExaminerId))
      .sort((a, b) => String(a.startTs).localeCompare(String(b.startTs)))
      .slice(0, lim)
      .map((slot) => {
        const examiner = mem.usersById.get(slot.examinerId);
        return {
          id: slot.id,
          examinerId: slot.examinerId,
          examinerName: examiner && examiner.name ? examiner.name : '',
          examinerEmail: examiner && examiner.email ? examiner.email : '',
          startTs: slot.startTs,
          endTs: slot.endTs,
          durationMinutes: Number(slot.durationMinutes) || 0,
          status: slot.status || 'pending',
          zoomLink: slot.zoomLink || '',
          sessionNote: slot.sessionNote || '',
          adminNote: slot.adminNote || '',
          approvedAt: slot.approvedAt || '',
          approvedBy: slot.approvedBy || '',
          createdAt: slot.createdAt || '',
        };
      });
  }

  await ensureSchema();
  let result;
  if (wantedStatus && wantedExaminerId) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by, a.created_at,
             u.name, u.email
      from examiner_availability a
      left join users u on u.id = a.examiner_id
      where lower(a.status) = ${wantedStatus} and a.examiner_id = ${wantedExaminerId}
      order by a.start_ts asc
      limit ${lim};
    `;
  } else if (wantedStatus) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by, a.created_at,
             u.name, u.email
      from examiner_availability a
      left join users u on u.id = a.examiner_id
      where lower(a.status) = ${wantedStatus}
      order by a.start_ts asc
      limit ${lim};
    `;
  } else if (wantedExaminerId) {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by, a.created_at,
             u.name, u.email
      from examiner_availability a
      left join users u on u.id = a.examiner_id
      where a.examiner_id = ${wantedExaminerId}
      order by a.start_ts asc
      limit ${lim};
    `;
  } else {
    result = await sql`
      select a.id, a.examiner_id, a.start_ts, a.end_ts, a.duration_minutes, a.status, a.zoom_link, a.session_note, a.admin_note, a.approved_at, a.approved_by, a.created_at,
             u.name, u.email
      from examiner_availability a
      left join users u on u.id = a.examiner_id
      order by a.start_ts asc
      limit ${lim};
    `;
  }

  return (result.rows || []).map((row) => ({
    id: row.id,
    examinerId: row.examiner_id,
    examinerName: row.name || '',
    examinerEmail: row.email || '',
    startTs: row.start_ts,
    endTs: row.end_ts,
    durationMinutes: Number(row.duration_minutes) || 0,
    status: row.status || 'pending',
    zoomLink: row.zoom_link || '',
    sessionNote: row.session_note || '',
    adminNote: row.admin_note || '',
    approvedAt: row.approved_at || '',
    approvedBy: row.approved_by || '',
    createdAt: row.created_at || '',
  }));
};

const listSpeakingBookingsByUser = async ({ userId = '', limit = 200 } = {}) => {
  const wantedUserId = String(userId || '').trim();
  const lim = Math.min(1000, Math.max(1, Number(limit) || 200));

  if (!wantedUserId) return [];

  if (!hasPg) {
    return mem.speakingBookings
      .filter((booking) => String(booking.userId || '') === wantedUserId)
      .map((booking) => {
        const slot = mem.availability.find((item) => String(item.id || '') === String(booking.slotId || '')) || null;
        const examiner = slot ? mem.usersById.get(String(slot.examinerId || '')) : null;
        return {
          id: booking.id,
          userId: booking.userId,
          slotId: booking.slotId,
          packageName: booking.packageName || '',
          bookedAt: booking.bookedAt || booking.createdAt || '',
          createdAt: booking.createdAt || '',
          slotStatus: slot ? String(slot.status || 'pending').toLowerCase() : 'unknown',
          examinerId: slot ? String(slot.examinerId || '') : '',
          examinerName: examiner && examiner.name ? examiner.name : '',
          examinerEmail: examiner && examiner.email ? examiner.email : '',
          startTs: slot ? slot.startTs : '',
          endTs: slot ? slot.endTs : '',
          durationMinutes: slot ? Number(slot.durationMinutes) || 0 : 0,
          zoomLink: slot ? String(slot.zoomLink || '') : '',
          sessionNote: slot ? String(slot.sessionNote || '') : '',
        };
      })
      .sort((a, b) => String(a.startTs || a.bookedAt || '').localeCompare(String(b.startTs || b.bookedAt || '')))
      .slice(0, lim);
  }

  await ensureSchema();
  const result = await sql`
    select
      b.id,
      b.user_id,
      b.slot_id,
      b.package_name,
      b.booked_at,
      b.created_at,
      a.status as slot_status,
      a.examiner_id,
      a.start_ts,
      a.end_ts,
      a.duration_minutes,
      a.zoom_link,
      a.session_note,
      u.name as examiner_name,
      u.email as examiner_email
    from speaking_bookings b
    left join examiner_availability a on a.id = b.slot_id
    left join users u on u.id = a.examiner_id
    where b.user_id = ${wantedUserId}
    order by a.start_ts asc nulls last, b.booked_at asc
    limit ${lim};
  `;

  return (result.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    slotId: row.slot_id,
    packageName: row.package_name || '',
    bookedAt: row.booked_at || '',
    createdAt: row.created_at || '',
    slotStatus: row.slot_status ? String(row.slot_status).toLowerCase() : 'unknown',
    examinerId: row.examiner_id || '',
    examinerName: row.examiner_name || '',
    examinerEmail: row.examiner_email || '',
    startTs: row.start_ts || '',
    endTs: row.end_ts || '',
    durationMinutes: Number(row.duration_minutes) || 0,
    zoomLink: row.zoom_link || '',
    sessionNote: row.session_note || '',
  }));
};

const updateSpeakingSlot = async ({ slotId, status, zoomLink, adminNote, approvedBy = '' } = {}) => {
  const id = String(slotId || '').trim();
  if (!id) throw new Error('Missing slotId.');
  const nextStatus = normalizeSpeakingStatus(status);
  const nextZoomLink = String(zoomLink || '').trim();
  const nextAdminNote = String(adminNote || '').trim();
  const nextApprovedBy = String(approvedBy || '').trim();

  if (!hasPg) {
    const index = mem.availability.findIndex((slot) => String(slot.id) === id);
    if (index < 0) throw new Error('Slot not found.');
    const existing = mem.availability[index];
    const approvedAt = nextStatus === 'approved'
      ? new Date().toISOString()
      : (nextStatus === 'completed' ? String(existing.approvedAt || '') : '');
    const updated = {
      ...existing,
      status: nextStatus,
      zoomLink: nextZoomLink || existing.zoomLink || '',
      adminNote: nextAdminNote || existing.adminNote || '',
      approvedAt,
      approvedBy: nextApprovedBy || existing.approvedBy || '',
    };
    mem.availability[index] = updated;
    return updated;
  }

  await ensureSchema();
  const current = await sql`
    select id, examiner_id, start_ts, end_ts, duration_minutes, status, zoom_link, session_note, admin_note, approved_at, approved_by, created_at
    from examiner_availability
    where id = ${id}
    limit 1;
  `;
  const existing = current.rows && current.rows[0] ? current.rows[0] : null;
  if (!existing) throw new Error('Slot not found.');

  const approvedAt = nextStatus === 'approved'
    ? new Date().toISOString()
    : (nextStatus === 'completed' ? existing.approved_at || null : null);
  const result = await sql`
    update examiner_availability
    set status = ${nextStatus},
        zoom_link = ${nextZoomLink || existing.zoom_link || ''},
        admin_note = ${nextAdminNote || existing.admin_note || ''},
        approved_at = ${approvedAt || null},
        approved_by = ${nextApprovedBy || existing.approved_by || null}
    where id = ${id}
    returning id, examiner_id, start_ts, end_ts, duration_minutes, status, zoom_link, session_note, admin_note, approved_at, approved_by, created_at;
  `;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  if (!row) throw new Error('Slot not found.');
  return {
    id: row.id,
    examinerId: row.examiner_id,
    startTs: row.start_ts,
    endTs: row.end_ts,
    durationMinutes: Number(row.duration_minutes) || 0,
    status: row.status || 'pending',
    zoomLink: row.zoom_link || '',
    sessionNote: row.session_note || '',
    adminNote: row.admin_note || '',
    approvedAt: row.approved_at || '',
    approvedBy: row.approved_by || '',
    createdAt: row.created_at || '',
  };
};

const bookSpeakingSlot = async ({ slotId, userId, packageName = '', meta = {} } = {}) => {
  const id = String(slotId || '').trim();
  const studentId = String(userId || '').trim();
  const bookingPackage = String(packageName || '').trim();
  const bookingMeta = meta && typeof meta === 'object' ? meta : {};
  if (!id) throw new Error('Missing slotId.');
  if (!studentId) throw new Error('Missing userId.');

  if (!hasPg) {
    const index = mem.availability.findIndex((slot) => String(slot.id) === id);
    if (index < 0) throw new Error('Slot not found.');

    var existingBooking = mem.speakingBookings.find((booking) => String(booking.slotId || '') === id);
    if (existingBooking) {
      throw new Error('Slot is no longer available.');
    }

    const existing = mem.availability[index];
    if (String(existing.status || '').toLowerCase() !== 'approved') {
      throw new Error('Slot is no longer available.');
    }

    const nowIso = new Date().toISOString();
    const booking = {
      id: makeId(),
      userId: studentId,
      slotId: id,
      packageName: bookingPackage,
      bookedAt: nowIso,
      createdAt: nowIso,
      meta: bookingMeta,
    };

    const updated = {
      ...existing,
      status: 'booked',
      approvedAt: String(existing.approvedAt || ''),
      approvedBy: String(existing.approvedBy || ''),
    };
    mem.availability[index] = updated;
    mem.speakingBookings.push(booking);
    return {
      slot: updated,
      booking: {
        id: booking.id,
        userId: booking.userId,
        slotId: booking.slotId,
        packageName: booking.packageName,
        bookedAt: booking.bookedAt,
        createdAt: booking.createdAt,
      },
    };
  }

  await ensureSchema();
  const result = await sql`
    update examiner_availability
    set status = 'booked'
    where id = ${id}
      and lower(status) = 'approved'
    returning id, examiner_id, start_ts, end_ts, duration_minutes, status, zoom_link, session_note, admin_note, approved_at, approved_by, created_at;
  `;

  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  if (!row) {
    const current = await sql`
      select id, status
      from examiner_availability
      where id = ${id}
      limit 1;
    `;
    const existing = current.rows && current.rows[0] ? current.rows[0] : null;
    if (!existing) throw new Error('Slot not found.');
    throw new Error('Slot is no longer available.');
  }

  const bookingId = makeId();
  const bookingResult = await sql`
    insert into speaking_bookings (id, user_id, slot_id, package_name, booked_at, meta)
    values (
      ${bookingId},
      ${studentId},
      ${id},
      ${bookingPackage || null},
      now(),
      ${bookingMeta}
    )
    on conflict (slot_id) do nothing
    returning id, user_id, slot_id, package_name, booked_at, created_at;
  `;

  const bookingRow = bookingResult.rows && bookingResult.rows[0] ? bookingResult.rows[0] : null;
  if (!bookingRow) {
    throw new Error('Slot is no longer available.');
  }

  return {
    slot: {
      id: row.id,
      examinerId: row.examiner_id,
      startTs: row.start_ts,
      endTs: row.end_ts,
      durationMinutes: Number(row.duration_minutes) || 0,
      status: row.status || 'pending',
      zoomLink: row.zoom_link || '',
      sessionNote: row.session_note || '',
      adminNote: row.admin_note || '',
      approvedAt: row.approved_at || '',
      approvedBy: row.approved_by || '',
      createdAt: row.created_at || '',
    },
    booking: {
      id: bookingRow.id,
      userId: bookingRow.user_id,
      slotId: bookingRow.slot_id,
      packageName: bookingRow.package_name || '',
      bookedAt: bookingRow.booked_at || '',
      createdAt: bookingRow.created_at || '',
    },
  };
};

const deleteSpeakingSlotsByIds = async (slotIds) => {
  const targets = Array.isArray(slotIds)
    ? slotIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (!targets.length) return { deleted: 0 };

  if (!hasPg) {
    var deleted = 0;
    mem.availability = mem.availability.filter((slot) => {
      const shouldDelete = targets.includes(String(slot.id || ''));
      if (shouldDelete) deleted += 1;
      return !shouldDelete;
    });
    return { deleted: deleted };
  }

  await ensureSchema();
  const result = await sql`delete from examiner_availability where id = any(${targets})`;
  return { deleted: Number(result.rowCount) || 0 };
};

const listTests = async () => {
  if (!hasPg) {
    if (!mem.tests.length) {
      mem.tests = [
        { id: 1, name: 'Mock Test 1' },
        { id: 2, name: 'Mock Test 2' },
        { id: 3, name: 'Mock Test 3' },
        { id: 4, name: 'Mock Test 4' },
      ];
    }
    return mem.tests.slice().sort((a, b) => a.id - b.id);
  }

  await ensureSchema();
  const result = await sql`select id, name from tests order by id asc;`;
  const rows = result.rows || [];
  if (!rows.length) {
    // Seed defaults once.
    await sql`insert into tests (name) values ('Mock Test 1'), ('Mock Test 2'), ('Mock Test 3'), ('Mock Test 4');`;
    const seeded = await sql`select id, name from tests order by id asc;`;
    return (seeded.rows || []).map((r) => ({ id: r.id, name: r.name }));
  }
  return rows.map((r) => ({ id: r.id, name: r.name }));
};

const createTest = async ({ name }) => {
  const n = String(name || '').trim();
  if (!n) throw new Error('Missing test name.');

  if (!hasPg) {
    const tests = await listTests();
    const maxId = tests.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
    const next = maxId + 1;
    const test = { id: next, name: n };
    mem.tests.push(test);
    return test;
  }

  await ensureSchema();
  const result = await sql`insert into tests (name) values (${n}) returning id, name;`;
  const row = result.rows && result.rows[0] ? result.rows[0] : null;
  return { id: row.id, name: row.name };
};

const normalizeTestMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'free' || mode === 'free-mock' || mode === 'free_mock') return 'free';
  if (mode === 'mock' || mode === 'paid' || mode === 'mock-test' || mode === 'mock_test') return 'mock';
  return '';
};

const normalizeDeviceKey = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '')
    .slice(0, 160);
};

const getAttemptIdFromResult = (result) => {
  const metaAttemptId = String(result && result.meta && result.meta.attemptId || '').trim();
  if (metaAttemptId) return metaAttemptId;

  const resultId = String((result && result.id) || '').trim();
  const moduleName = String((result && result.module) || '').trim().toLowerCase();
  const userId = String((result && result.userId) || '').trim();
  if (!resultId || !moduleName || !userId) return '';

  const prefix = `${moduleName}-${userId}-`;
  if (resultId.indexOf(prefix) === 0) {
    return String(resultId.slice(prefix.length) || '').trim();
  }
  return '';
};

const getFreeMockAttemptSummary = async ({ userId, currentAttemptId = '', deviceKey = '' } = {}) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedCurrentAttemptId = String(currentAttemptId || '').trim();
  const normalizedDeviceKey = normalizeDeviceKey(deviceKey);
  if (!normalizedUserId) throw new Error('Missing userId.');

  const results = await listResults({ limit: 1500 });
  const freeAttemptIdsByUser = new Set();
  const freeAttemptIdsByDevice = new Set();

  results.forEach((result) => {
    const moduleName = String((result && result.module) || '').trim().toLowerCase();
    if (moduleName !== 'listening' && moduleName !== 'reading' && moduleName !== 'writing') return;

    const resultUserId = String((result && result.userId) || '').trim();
    const resultDeviceKey = normalizeDeviceKey(result && result.meta && result.meta.deviceKey);
    const matchesUser = resultUserId === normalizedUserId;
    const matchesDevice = normalizedDeviceKey && resultDeviceKey && resultDeviceKey === normalizedDeviceKey;
    if (!matchesUser && !matchesDevice) return;

    const explicitMode = normalizeTestMode(result && result.meta && result.meta.testMode);
    if (explicitMode && explicitMode !== 'free') return;

    if (!explicitMode) {
      const fallbackSource = String((result && result.source) || '').trim().toLowerCase();
      if (fallbackSource !== 'system-auto' && fallbackSource !== 'openai' && fallbackSource !== 'heuristic-fallback') {
        return;
      }
    }

    const attemptId = getAttemptIdFromResult(result);
    if (!attemptId) return;
    if (matchesUser) freeAttemptIdsByUser.add(attemptId);
    if (matchesDevice) freeAttemptIdsByDevice.add(attemptId);
  });

  const freeAttemptIds = new Set([
    ...Array.from(freeAttemptIdsByUser.values()),
    ...Array.from(freeAttemptIdsByDevice.values()),
  ]);
  const usedAttempts = freeAttemptIds.size;
  const remainingAttempts = Math.max(0, FREE_MOCK_MAX_ATTEMPTS - usedAttempts);
  const isCurrentAttemptKnown = normalizedCurrentAttemptId ? freeAttemptIds.has(normalizedCurrentAttemptId) : false;
  const canSubmit = isCurrentAttemptKnown || usedAttempts < FREE_MOCK_MAX_ATTEMPTS;

  return {
    limit: FREE_MOCK_MAX_ATTEMPTS,
    usedAttempts,
    usedAttemptsByUser: freeAttemptIdsByUser.size,
    usedAttemptsByDevice: freeAttemptIdsByDevice.size,
    remainingAttempts,
    isCurrentAttemptKnown,
    hasDeviceKey: !!normalizedDeviceKey,
    canSubmit,
    nextRemainingAfterSubmit: isCurrentAttemptKnown
      ? remainingAttempts
      : Math.max(0, FREE_MOCK_MAX_ATTEMPTS - (usedAttempts + 1)),
  };
};

const clearStudentResultData = async () => {
  const isResultActivityType = (type) => {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
      normalized.indexOf('result') >= 0 ||
      normalized.indexOf('listening') >= 0 ||
      normalized.indexOf('reading') >= 0 ||
      normalized.indexOf('writing') >= 0 ||
      normalized.indexOf('speaking') >= 0
    );
  };

  if (!hasPg) {
    const studentIds = new Set(
      Array.from(mem.usersById.values())
        .filter((user) => String((user && user.role) || '').trim().toLowerCase() === 'student')
        .map((user) => String((user && user.id) || '').trim())
        .filter(Boolean)
    );

    const beforeResults = mem.results.length;
    const beforeActivities = mem.activities.length;

    mem.results = mem.results.filter((item) => !studentIds.has(String((item && item.userId) || '').trim()));
    mem.activities = mem.activities.filter((item) => {
      const activityUserId = String((item && item.userId) || '').trim();
      if (!studentIds.has(activityUserId)) return true;
      return !isResultActivityType(item && item.type);
    });

    return {
      resultsDeleted: Math.max(0, beforeResults - mem.results.length),
      activitiesDeleted: Math.max(0, beforeActivities - mem.activities.length),
    };
  }

  await ensureSchema();

  const deleteResults = await sql`
    delete from results
    where user_id in (select id from users where role = 'student');
  `;

  const deleteActivities = await sql`
    delete from activity
    where user_id in (select id from users where role = 'student')
      and (
        lower(type) like '%result%'
        or lower(type) like '%listening%'
        or lower(type) like '%reading%'
        or lower(type) like '%writing%'
        or lower(type) like '%speaking%'
      );
  `;

  return {
    resultsDeleted: Number(deleteResults && deleteResults.rowCount) || 0,
    activitiesDeleted: Number(deleteActivities && deleteActivities.rowCount) || 0,
  };
};

module.exports = {
  hasPg,
  ensureSchema,
  upsertStudent,
  promoteToExaminer,
  getUserByEmail,
  updateStudentPasswordByEmail,
  listUsers,
  deleteUsersByEmails,
  logActivity,
  listActivities,
  getMetrics,
  getAdminOverview,
  listExaminers,
  deleteExaminerByEmail,
  listPayments,
  createPayment,
  listResults,
  upsertResult,
  upsertAvailabilitySlots,
  listAvailabilityByDate,
  listSpeakingSlots,
  listSpeakingBookingsByUser,
  updateSpeakingSlot,
  bookSpeakingSlot,
  deleteSpeakingSlotsByIds,
  normalizeTestMode,
  normalizeDeviceKey,
  getAttemptIdFromResult,
  getFreeMockAttemptSummary,
  clearStudentResultData,
  listTests,
  createTest,
};
