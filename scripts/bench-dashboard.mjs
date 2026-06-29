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
  select: { databaseUrl: true },
});
await control.$disconnect();

const tenantAdapter = new PrismaPg({ connectionString: company.databaseUrl, max: 4 });
const p = new TenantPrisma({ adapter: tenantAdapter });

async function run() {
  const t0 = Date.now();

  const [agg, statusGroups, topMismatch] = await Promise.all([
    p.reconciliationSummary.aggregate({
      _count: { _all: true },
      _sum: { variance: true },
    }),
    p.reconciliationSummary.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
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

  return {
    ms: Date.now() - t0,
    totals: {
      totalSkus: agg._count._all,
      statusBuckets: statusGroups.length,
      topMismatch: topMismatch.length,
      topPending: topPending.length,
      lastRefreshed: lastRefreshed?.lastRefreshedAt ?? null,
      topVariance: topVarianceRows.length,
    },
  };
}

console.log('Cold run...');
const cold = await run();
console.log(`Cold: ${cold.ms}ms`);
console.log('Totals:', cold.totals);

console.log('\nWarm run...');
const warm = await run();
console.log(`Warm: ${warm.ms}ms`);

console.log('\nWarm run 2...');
const warm2 = await run();
console.log(`Warm2: ${warm2.ms}ms`);

await p.$disconnect();
console.log(`\nPost-index — cold: ${cold.ms}ms | warm: ${warm.ms}ms | warm2: ${warm2.ms}ms`);
