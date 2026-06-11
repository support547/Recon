import { readFileSync } from "node:fs";
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

async function main() {
  const total = await prisma.shipmentStatus.count();
  const dupGroups = await prisma.$queryRawUnsafe(
    `SELECT "shipmentId", COUNT(*)::int AS c
       FROM shipment_status
      WHERE "shipmentId" IS NOT NULL
      GROUP BY "shipmentId"
     HAVING COUNT(*) > 1
      ORDER BY c DESC`,
  );

  const extra = dupGroups.reduce((s, g) => s + (g.c - 1), 0);
  console.log(`total rows: ${total}`);
  console.log(`shipmentIds with duplicates: ${dupGroups.length}`);
  console.log(`extra rows to remove: ${extra}`);
  if (dupGroups.length) console.log("sample:", dupGroups.slice(0, 10));

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to delete extras.");
    return;
  }

  // Keep the newest row per shipmentId (latest lastUpdated, then uploadedAt,
  // then id). Delete the rest.
  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM shipment_status s
    USING (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY "shipmentId"
               ORDER BY "lastUpdated" DESC NULLS LAST,
                        "uploadedAt"  DESC NULLS LAST,
                        id DESC
             ) AS rn
        FROM shipment_status
       WHERE "shipmentId" IS NOT NULL
    ) ranked
    WHERE s.id = ranked.id AND ranked.rn > 1
  `);
  console.log(`deleted ${deleted} duplicate rows.`);

  const after = await prisma.$queryRawUnsafe(
    `SELECT "shipmentId", COUNT(*)::int AS c
       FROM shipment_status
      WHERE "shipmentId" IS NOT NULL
      GROUP BY "shipmentId" HAVING COUNT(*) > 1`,
  );
  console.log(`remaining duplicate groups: ${after.length}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
