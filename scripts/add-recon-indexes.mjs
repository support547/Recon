import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as ControlPrisma } from '../lib/control-prisma/generated/index.js';

const STMTS = [
  ['idx_fba_summary_active',           `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fba_summary_active           ON "fba_summary"        ("id") WHERE "deletedAt" IS NULL`],
  ['idx_sales_data_active',            `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_data_active            ON "sales_data"         ("id") WHERE "deletedAt" IS NULL`],
  ['idx_fba_receipts_active',          `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fba_receipts_active          ON "fba_receipts"       ("id") WHERE "deletedAt" IS NULL`],
  ['idx_customer_returns_active',      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_returns_active      ON "customer_returns"   ("id") WHERE "deletedAt" IS NULL`],
  ['idx_reimbursements_active',        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reimbursements_active        ON "reimbursements"     ("id") WHERE "deletedAt" IS NULL`],
  ['idx_removal_receipts_active',      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_removal_receipts_active      ON "removal_receipts"   ("id") WHERE "deletedAt" IS NULL`],
  ['idx_gnr_report_active',            `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gnr_report_active            ON "gnr_report"         ("id") WHERE "deletedAt" IS NULL`],
  ['idx_grade_resell_items_active',    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grade_resell_items_active    ON "grade_resell_items" ("id") WHERE "deletedAt" IS NULL`],
  ['idx_case_tracker_active',          `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_tracker_active          ON "case_tracker"       ("id") WHERE "deletedAt" IS NULL`],
  ['idx_manual_adjustments_active',    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manual_adjustments_active    ON "manual_adjustments" ("id") WHERE "deletedAt" IS NULL`],
  ['idx_replacements_active',          `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_replacements_active          ON "replacements"       ("id") WHERE "deletedAt" IS NULL`],
  ['idx_fc_transfers_active',          `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fc_transfers_active          ON "fc_transfers"       ("id") WHERE "deletedAt" IS NULL`],
  ['idx_shipment_status_active',       `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipment_status_active       ON "shipment_status"    ("id") WHERE "deletedAt" IS NULL`],
  ['idx_shipped_to_fba_active',        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipped_to_fba_active        ON "shipped_to_fba"     ("id") WHERE "deletedAt" IS NULL`],
  ['idx_fba_receipts_ship_active',     `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fba_receipts_ship_active     ON "fba_receipts"       ("shipmentId") WHERE "deletedAt" IS NULL`],
  ['idx_case_tracker_recon_active',    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_tracker_recon_active    ON "case_tracker"       ("reconType")  WHERE "deletedAt" IS NULL`],
  ['idx_manual_adjustments_recon_act', `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manual_adjustments_recon_act ON "manual_adjustments" ("reconType")  WHERE "deletedAt" IS NULL`],
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

console.log(`Tenant: ${company.name} (${company.slug})`);
console.log(`URL host: ${new URL(company.databaseUrl).host}, db: ${new URL(company.databaseUrl).pathname}`);

const client = new pg.Client({ connectionString: company.databaseUrl });
await client.connect();

let failed = 0;
for (const [name, sql] of STMTS) {
  const t0 = Date.now();
  try {
    await client.query(sql);
    const ms = Date.now() - t0;
    console.log(`  OK   ${name}  (${ms}ms)`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}: ${e.message}`);
  }
}

const { rows: idxRows } = await client.query(`
  SELECT indexname, tablename, indexdef
  FROM pg_indexes
  WHERE schemaname='public' AND indexname LIKE 'idx_%_active%' OR indexname LIKE 'idx_%_recon_act%' OR indexname LIKE 'idx_%_ship_active%'
  ORDER BY tablename, indexname;
`);
console.log('\nPartial indexes now present:');
for (const r of idxRows) console.log(`  ${r.tablename}.${r.indexname}`);

const { rows: invalid } = await client.query(`
  SELECT c.relname AS indexname, n.nspname AS schema
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT i.indisvalid AND n.nspname='public';
`);
if (invalid.length) {
  console.log('\nINVALID indexes (concurrent build failed mid-way):');
  for (const r of invalid) console.log(`  ${r.schema}.${r.indexname}`);
}

await client.end();
console.log(`\nDone. ${STMTS.length - failed}/${STMTS.length} statements succeeded.`);
