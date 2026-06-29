import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as ControlPrisma } from '../lib/control-prisma/generated/index.js';
import { PrismaClient as TenantPrisma } from '@prisma/client';

// =========================================================
// STEP A: simulate FULL cold-login tenant resolution path
//   measure each segment as the server does it per request
// =========================================================
console.log('=== A. Cold-login tenant resolution path ===\n');

const tA0 = Date.now();
const controlAdapter = new PrismaPg({ connectionString: process.env.CONTROL_DATABASE_URL });
const control = new ControlPrisma({ adapter: controlAdapter });
const tA1 = Date.now();
console.log(`  A1. Control PrismaClient instantiate (no connect): ${tA1 - tA0}ms`);

// Mirror getTenantPrisma path: findUnique on user by id, including company.databaseUrl.
// We don't have a userId here; use findFirst for a GeneralBooks user instead — same access path.
const tA2 = Date.now();
const user = await control.user.findFirst({
  where: { company: { name: { contains: 'general', mode: 'insensitive' } } },
  select: { id: true, isActive: true, company: { select: { name: true, databaseUrl: true } } },
});
const tA3 = Date.now();
console.log(`  A2. Control DB lookup (user + company.databaseUrl), cold: ${tA3 - tA2}ms`);
console.log(`      → user.isActive=${user.isActive}  company=${user.company.name}`);

// Second call — warm pool
const tA4 = Date.now();
await control.user.findUnique({
  where: { id: user.id },
  select: { isActive: true, company: { select: { databaseUrl: true } } },
});
const tA5 = Date.now();
console.log(`  A2b. Control DB lookup, warm: ${tA5 - tA4}ms`);

// Build tenant client (mirror lib/prisma.ts getTenantPrismaByUrl)
const tA6 = Date.now();
const tenantAdapter = new PrismaPg({
  connectionString: user.company.databaseUrl,
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});
const tenant = new TenantPrisma({ adapter: tenantAdapter });
const tA7 = Date.now();
console.log(`  A3. Tenant PrismaPg+PrismaClient instantiate (no connect): ${tA7 - tA6}ms`);

// FIRST tenant query — this is where TCP+TLS+PG handshake happens
const tA8 = Date.now();
const firstQ = await tenant.reconciliationSummary.aggregate({
  _count: { _all: true },
  _sum: { variance: true },
});
const tA9 = Date.now();
console.log(`  A4. FIRST tenant query (cold TCP+TLS+PG handshake + aggregate): ${tA9 - tA8}ms`);
console.log(`      → totalSkus=${firstQ._count._all} sumVariance=${firstQ._sum.variance}`);

// Second same query — warm connection
const tA10 = Date.now();
await tenant.reconciliationSummary.aggregate({ _count: { _all: true }, _sum: { variance: true } });
const tA11 = Date.now();
console.log(`  A4b. Same query, warm pool: ${tA11 - tA10}ms`);

const coldTotal = tA9 - tA0;
console.log(`\n  COLD path A1→A4 total: ${coldTotal}ms`);

// =========================================================
// STEP B: getDashboardCoverage — uploadedFile.groupBy
// =========================================================
console.log('\n=== B. getDashboardCoverage timing ===\n');

async function timeFn(label, fn) {
  const t0 = Date.now();
  const r = await fn();
  return { label, ms: Date.now() - t0, r };
}

const covCold = await timeFn('cov cold (1st)', () =>
  tenant.uploadedFile.groupBy({
    by: ['reportType'],
    _sum: { rowCount: true },
    _count: { _all: true },
    _max: { uploadedAt: true },
    orderBy: { _sum: { rowCount: 'desc' } },
  }));
const covWarm = await timeFn('cov warm', () =>
  tenant.uploadedFile.groupBy({
    by: ['reportType'],
    _sum: { rowCount: true },
    _count: { _all: true },
    _max: { uploadedAt: true },
    orderBy: { _sum: { rowCount: 'desc' } },
  }));
console.log(`  ${covCold.ms.toString().padStart(5)}ms  ${covCold.label} (rows=${covCold.r.length})`);
console.log(`  ${covWarm.ms.toString().padStart(5)}ms  ${covWarm.label}`);

// =========================================================
// STEP C: getDashboardRecentUploads — orderBy uploadedAt desc take 10
// =========================================================
console.log('\n=== C. getDashboardRecentUploads timing ===\n');

const recCold = await timeFn('rec cold (1st on tenant w/ pool warm)', () =>
  tenant.uploadedFile.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 10,
    select: { id: true, reportType: true, filename: true, rowCount: true, rowsSkipped: true, uploadedAt: true },
  }));
const recWarm = await timeFn('rec warm', () =>
  tenant.uploadedFile.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 10,
    select: { id: true, reportType: true, filename: true, rowCount: true, rowsSkipped: true, uploadedAt: true },
  }));
console.log(`  ${recCold.ms.toString().padStart(5)}ms  ${recCold.label}`);
console.log(`  ${recWarm.ms.toString().padStart(5)}ms  ${recWarm.label}`);

// Row count
const upCount = await tenant.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS n FROM uploaded_files`);
console.log(`  uploaded_files row count: ${upCount[0].n}`);

// =========================================================
// STEP D: EXPLAIN ANALYZE
// =========================================================
console.log('\n=== D. EXPLAIN ANALYZE ===\n');
const explains = [
  ['D1 coverage groupBy reportType',
    `SELECT "reportType", SUM("rowCount") AS s, COUNT(*) AS c, MAX("uploadedAt") AS mx
     FROM uploaded_files
     GROUP BY "reportType"
     ORDER BY s DESC`],
  ['D2 recent uploads orderBy uploadedAt desc limit 10',
    `SELECT id, "reportType", filename, "rowCount", "rowsSkipped", "uploadedAt"
     FROM uploaded_files
     ORDER BY "uploadedAt" DESC LIMIT 10`],
];
for (const [label, sql] of explains) {
  console.log(`>>> ${label}`);
  const rows = await tenant.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
  for (const r of rows) console.log(`   ${r['QUERY PLAN']}`);
  console.log('');
}

// =========================================================
// STEP E: indexes on uploaded_files
// =========================================================
console.log('=== E. uploaded_files indexes ===\n');
const idx = await tenant.$queryRawUnsafe(
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'uploaded_files' ORDER BY indexname`
);
for (const r of idx) console.log(`  ${r.indexname}: ${r.indexdef}`);

// =========================================================
// STEP F: Summed cold-login estimate
// =========================================================
console.log('\n=== F. Cold-login total estimate (sequential) ===\n');
// getDashboardKpis cold from prior run: ~411ms
const kpisCold = 411;
const total = (tA9 - tA0) + kpisCold + covCold.ms + recCold.ms;
console.log(`  Control lookup + tenant client + first query (A): ${tA9 - tA0}ms`);
console.log(`  getDashboardKpis cold (from prior run):           ~${kpisCold}ms`);
console.log(`  getDashboardCoverage cold:                        ${covCold.ms}ms`);
console.log(`  getDashboardRecentUploads cold:                   ${recCold.ms}ms`);
console.log(`  ----`);
console.log(`  Estimated cold dashboard total (server-side): ~${total}ms`);
console.log(`  + auth() JWT decode + Next.js dev compile + network/render: NOT measured here`);

await tenant.$disconnect();
await control.$disconnect();
