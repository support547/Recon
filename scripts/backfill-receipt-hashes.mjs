import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Load DATABASE_URL from .env / .env.local if not already set.
if (!process.env.DATABASE_URL) {
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
        if (m) {
          process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
          break;
        }
      }
    } catch {
      /* file may not exist */
    }
    if (process.env.DATABASE_URL) break;
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set and not found in .env / .env.local");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
const APPLY = process.argv.includes("--apply");

// Mirror of hashOf() in actions/uploads.ts processReceipts. Inputs are the
// trimmed CSV strings (never null — empty string when absent). The INSERT then
// coalesces empty -> NULL in the DB, so when recomputing from DB columns we
// must convert NULL back to "" to reproduce the original hash input exactly.
const s = (v) => (v == null ? "" : String(v));
const hashOf = (e) => {
  const parts = [
    s(e.fnsku), s(e.msku), s(e.asin), s(e.title), s(e.eventType), s(e.shipmentId),
    String(e.quantity ?? 0), s(e.fulfillmentCenter), s(e.disposition), s(e.reason), s(e.country),
    String(e.reconciledQty ?? 0), String(e.unreconciledQty ?? 0),
    e.receiptDate ? e.receiptDate.toISOString() : "",
    e.receiptDatetime ? e.receiptDatetime.toISOString() : "",
    s(e.store),
  ];
  return createHash("sha256").update(parts.join("\x1f")).digest("hex");
};

async function main() {
  const total = await prisma.fbaReceipt.count();
  const nullRows = await prisma.fbaReceipt.findMany({
    where: { rowHash: null },
    select: {
      id: true, fnsku: true, msku: true, asin: true, title: true,
      eventType: true, shipmentId: true, quantity: true, fulfillmentCenter: true,
      disposition: true, reason: true, country: true, reconciledQty: true,
      unreconciledQty: true, receiptDate: true, receiptDatetime: true, store: true,
    },
  });

  console.log(`total receipt rows: ${total}`);
  console.log(`rows with NULL rowHash: ${nullRows.length}`);

  // Compute hashes for all NULL rows, then check how many collide with an
  // already-hashed row (the genuine duplicates) vs are unique.
  const computed = nullRows.map((r) => ({ id: r.id, hash: hashOf(r) }));

  const allHashes = computed.map((c) => c.hash);
  const existing = new Set();
  const CHUNK = 1000;
  for (let i = 0; i < allHashes.length; i += CHUNK) {
    const chunk = allHashes.slice(i, i + CHUNK);
    const found = await prisma.fbaReceipt.findMany({
      where: { rowHash: { in: chunk } },
      select: { rowHash: true },
    });
    for (const f of found) if (f.rowHash) existing.add(f.rowHash);
  }

  const willCollide = computed.filter((c) => existing.has(c.hash));
  console.log(
    `NULL rows whose computed hash matches an existing hashed row (= true duplicates): ${willCollide.length}`,
  );
  console.log(
    `NULL rows that are unique (no existing match): ${nullRows.length - willCollide.length}`,
  );

  if (!APPLY) {
    if (willCollide.length) {
      console.log("sample collisions (id -> hash):");
      for (const c of willCollide.slice(0, 5)) console.log(`  ${c.id} -> ${c.hash.slice(0, 12)}`);
    }
    console.log("\nDRY RUN — re-run with --apply to backfill hashes and delete duplicates.");
    return;
  }

  // 1. Backfill: write computed hash onto every NULL row.
  let updated = 0;
  for (const c of computed) {
    await prisma.fbaReceipt.update({ where: { id: c.id }, data: { rowHash: c.hash } });
    updated += 1;
  }
  console.log(`backfilled rowHash on ${updated} rows.`);

  // 2. Dedupe: keep the earliest-uploaded row per rowHash, delete the rest.
  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM fba_receipts r
    USING (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY "rowHash"
               ORDER BY "uploadedAt" ASC NULLS LAST, id ASC
             ) AS rn
        FROM fba_receipts
       WHERE "rowHash" IS NOT NULL
    ) ranked
    WHERE r.id = ranked.id AND ranked.rn > 1
  `);
  console.log(`deleted ${deleted} duplicate rows.`);

  const remaining = await prisma.fbaReceipt.count();
  console.log(`remaining receipt rows: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
