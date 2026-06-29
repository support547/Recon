import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as ControlPrisma } from '../lib/control-prisma/generated/index.js';
import { PrismaClient as TenantPrisma } from '@prisma/client';

const controlAdapter = new PrismaPg({ connectionString: process.env.CONTROL_DATABASE_URL });
const control = new ControlPrisma({ adapter: controlAdapter });
const company = await control.company.findFirst({
  where: {
    OR: [
      { name: { contains: 'general', mode: 'insensitive' } },
      { slug: { contains: 'general', mode: 'insensitive' } },
    ],
  },
  select: { name: true, slug: true, databaseUrl: true },
});
await control.$disconnect();
console.log(`Tenant: ${company.name} (${company.slug})`);

const tenantAdapter = new PrismaPg({ connectionString: company.databaseUrl, max: 4 });
const p = new TenantPrisma({ adapter: tenantAdapter });

async function time(label, fn) {
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  return { label, ms, r };
}

async function runE2E() {
  const t0 = Date.now();
  const [agg, statusGroups, topMismatch] = await Promise.all([
    p.reconciliationSummary.aggregate({ _count: { _all: true }, _sum: { variance: true } }),
    p.reconciliationSummary.groupBy({ by: ['status'], _count: { _all: true } }),
    p.reconciliationSummary.findMany({
      where: { status: 'mismatch' },
      orderBy: { variance: 'desc' },
      take: 10,
      select: { msku: true, variance: true, expectedQty: true, actualQty: true },
    }),
  ]);
  const [topPending, lastRefreshed] = await Promise.all([
    p.reconciliationSummary.findMany({
      where: { status: 'pending' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { msku: true, expectedQty: true, actualQty: true },
    }),
    p.reconciliationSummary.findFirst({
      orderBy: { lastRefreshedAt: 'desc' },
      select: { lastRefreshedAt: true },
    }),
  ]);
  const topVarianceRows = await p.reconciliationSummary.findMany({
    orderBy: { variance: 'desc' },
    take: 10,
    select: { msku: true, variance: true, title: true },
    where: { NOT: { variance: 0 } },
  });
  return Date.now() - t0;
}

async function perQuery() {
  const out = [];
  out.push(await time('1.aggregate(count+sumVariance)', () =>
    p.reconciliationSummary.aggregate({ _count: { _all: true }, _sum: { variance: true } })));
  out.push(await time('2.groupBy(status)', () =>
    p.reconciliationSummary.groupBy({ by: ['status'], _count: { _all: true } })));
  out.push(await time('3.findMany mismatch top10 variance desc', () =>
    p.reconciliationSummary.findMany({
      where: { status: 'mismatch' },
      orderBy: { variance: 'desc' },
      take: 10,
      select: { msku: true, variance: true, expectedQty: true, actualQty: true },
    })));
  out.push(await time('4.findMany pending top10 updatedAt desc', () =>
    p.reconciliationSummary.findMany({
      where: { status: 'pending' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { msku: true, expectedQty: true, actualQty: true },
    })));
  out.push(await time('5.findFirst lastRefreshedAt desc', () =>
    p.reconciliationSummary.findFirst({
      orderBy: { lastRefreshedAt: 'desc' },
      select: { lastRefreshedAt: true },
    })));
  out.push(await time('6.findMany top10 variance desc NOT 0', () =>
    p.reconciliationSummary.findMany({
      orderBy: { variance: 'desc' },
      take: 10,
      select: { msku: true, variance: true, title: true },
      where: { NOT: { variance: 0 } },
    })));
  return out;
}

// Row count
const rowCount = await p.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS n FROM reconciliation_summary`);
console.log(`\nRow count: ${rowCount[0].n}`);

// Clear PG cache impossible without superuser; cold means first-touch after process boot.
console.log('\n--- E2E timing ---');
const cold = await runE2E();
console.log(`Cold E2E: ${cold}ms`);
const warm = await runE2E();
console.log(`Warm E2E: ${warm}ms`);
const warm2 = await runE2E();
console.log(`Warm2 E2E: ${warm2}ms`);

console.log('\n--- Per-query (warm, after E2E above) ---');
const perWarm = await perQuery();
for (const q of perWarm) console.log(`  ${q.ms.toString().padStart(5)}ms  ${q.label}`);

// Restart connection to approximate cold
await p.$disconnect();
const tenantAdapter2 = new PrismaPg({ connectionString: company.databaseUrl, max: 4 });
const p2 = new TenantPrisma({ adapter: tenantAdapter2 });

console.log('\n--- Per-query (fresh connection, approx cold) ---');
const perCold = [];
async function timeP2(label, fn) {
  const t0 = Date.now();
  const r = await fn();
  return { label, ms: Date.now() - t0, r };
}
perCold.push(await timeP2('1.aggregate(count+sumVariance)', () =>
  p2.reconciliationSummary.aggregate({ _count: { _all: true }, _sum: { variance: true } })));
perCold.push(await timeP2('2.groupBy(status)', () =>
  p2.reconciliationSummary.groupBy({ by: ['status'], _count: { _all: true } })));
perCold.push(await timeP2('3.findMany mismatch top10 variance desc', () =>
  p2.reconciliationSummary.findMany({
    where: { status: 'mismatch' },
    orderBy: { variance: 'desc' },
    take: 10,
    select: { msku: true, variance: true, expectedQty: true, actualQty: true },
  })));
perCold.push(await timeP2('4.findMany pending top10 updatedAt desc', () =>
  p2.reconciliationSummary.findMany({
    where: { status: 'pending' },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { msku: true, expectedQty: true, actualQty: true },
  })));
perCold.push(await timeP2('5.findFirst lastRefreshedAt desc', () =>
  p2.reconciliationSummary.findFirst({
    orderBy: { lastRefreshedAt: 'desc' },
    select: { lastRefreshedAt: true },
  })));
perCold.push(await timeP2('6.findMany top10 variance desc NOT 0', () =>
  p2.reconciliationSummary.findMany({
    orderBy: { variance: 'desc' },
    take: 10,
    select: { msku: true, variance: true, title: true },
    where: { NOT: { variance: 0 } },
  })));
for (const q of perCold) console.log(`  ${q.ms.toString().padStart(5)}ms  ${q.label}`);

// Status distribution
console.log('\n--- Status distribution ---');
const dist = await p2.$queryRawUnsafe(`SELECT status, COUNT(*)::bigint AS n FROM reconciliation_summary GROUP BY status ORDER BY n DESC`);
for (const r of dist) console.log(`  ${r.status}: ${r.n}`);

// EXPLAIN ANALYZE on each query — equivalent SQL
console.log('\n--- EXPLAIN ANALYZE (raw SQL approx of each Prisma query) ---');
const explains = [
  ['Q1 aggregate', `SELECT COUNT(*) AS c, SUM(variance) AS s FROM reconciliation_summary`],
  ['Q2 groupBy status', `SELECT status, COUNT(*) FROM reconciliation_summary GROUP BY status`],
  ['Q3 mismatch top10', `SELECT msku, variance, "expectedQty", "actualQty" FROM reconciliation_summary WHERE status = 'mismatch' ORDER BY variance DESC LIMIT 10`],
  ['Q4 pending top10 updatedAt', `SELECT msku, "expectedQty", "actualQty" FROM reconciliation_summary WHERE status = 'pending' ORDER BY "updatedAt" DESC LIMIT 10`],
  ['Q5 findFirst lastRefreshedAt', `SELECT "lastRefreshedAt" FROM reconciliation_summary ORDER BY "lastRefreshedAt" DESC LIMIT 1`],
  ['Q6 top10 variance NOT 0', `SELECT msku, variance, title FROM reconciliation_summary WHERE variance <> 0 ORDER BY variance DESC LIMIT 10`],
];
for (const [label, sql] of explains) {
  console.log(`\n>>> ${label}`);
  console.log(`SQL: ${sql}`);
  try {
    const rows = await p2.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
    for (const r of rows) console.log(`   ${r['QUERY PLAN']}`);
  } catch (e) {
    console.log(`   ERROR: ${e.message}`);
  }
}

await p2.$disconnect();
