import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as ControlPrisma } from '../lib/control-prisma/generated/index.js';

const STMTS = [
  ['idx_recon_summary_status_variance',   `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recon_summary_status_variance   ON "reconciliation_summary" ("status", "variance" DESC)`],
  ['idx_recon_summary_status_updated_at', `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recon_summary_status_updated_at ON "reconciliation_summary" ("status", "updatedAt" DESC)`],
];

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

if (!company) {
  console.error('ABORT: no GeneralBooks company');
  process.exit(1);
}

console.log(`Tenant: ${company.name}`);
const u = new URL(company.databaseUrl);
console.log(`Target: ${u.host}${u.pathname}`);

const client = new pg.Client({ connectionString: company.databaseUrl });
await client.connect();

const { rows: cnt } = await client.query(`SELECT count(*)::int AS n FROM "reconciliation_summary"`);
console.log(`reconciliation_summary rows: ${cnt[0].n}`);

let failed = 0;
for (const [name, sql] of STMTS) {
  const t0 = Date.now();
  try {
    await client.query(sql);
    console.log(`  OK   ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}: ${e.message}`);
  }
}

const { rows: idxRows } = await client.query(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname='public' AND tablename='reconciliation_summary'
  ORDER BY indexname;
`);
console.log('\nAll indexes on reconciliation_summary:');
for (const r of idxRows) console.log(`  ${r.indexname}`);

const { rows: invalid } = await client.query(`
  SELECT c.relname AS indexname
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT i.indisvalid AND n.nspname='public' AND c.relname LIKE 'idx_recon_summary_%';
`);
if (invalid.length) {
  console.log('\nINVALID indexes:');
  for (const r of invalid) console.log(`  ${r.indexname}`);
}

await client.end();
console.log(`\nDone. ${STMTS.length - failed}/${STMTS.length} statements succeeded.`);
