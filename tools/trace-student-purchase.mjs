import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadEnvFile(filePath) {
  const absPath = path.resolve(filePath);
  const text = fs.readFileSync(absPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const envFile = String(process.argv[3] || '.env.prod.tmp').trim();
  if (!email) throw new Error('Usage: node tools/trace-student-purchase.mjs <email> [envFile]');

  loadEnvFile(envFile);

  const store = require('../api/_store');
  const user = await store.getUserByEmail(email);
  const allPayments = await store.listPayments({ limit: 500 });
  const userId = String((user && user.id) || '').trim();
  const userActivities = userId ? await store.listActivities({ userId, limit: 40 }) : [];

  const linkedPayments = allPayments
    .filter((p) => String((p && p.userId) || '').trim() === userId)
    .sort((a, b) => String((b && b.createdAt) || '').localeCompare(String((a && a.createdAt) || '')));

  const linkedPaidCount = linkedPayments.filter((p) => String((p && p.status) || '').toLowerCase() === 'paid').length;

  const paymentSyncActivities = userActivities
    .filter((a) => String((a && a.type) || '').toLowerCase() === 'payment_sync')
    .map((a) => ({ id: a.id, createdAt: a.createdAt, meta: a.meta || {} }));

  console.log(JSON.stringify({
    email,
    userFound: !!user,
    user: user ? {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      candidateNumber: user.candidateNumber,
      createdAt: user.createdAt,
    } : null,
    linkedPaymentsCount: linkedPayments.length,
    linkedPaidCount,
    linkedPaymentsRecent: linkedPayments.slice(0, 10).map((p) => ({
      id: p.id,
      userId: p.userId,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      createdAt: p.createdAt,
      meta: p.meta || {},
    })),
    paymentSyncActivities,
    recentActivities: userActivities.slice(0, 15).map((a) => ({
      id: a.id,
      type: a.type,
      createdAt: a.createdAt,
      meta: a.meta || {},
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
