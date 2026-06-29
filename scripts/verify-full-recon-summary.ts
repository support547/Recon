/**
 * Verify getFullReconDashboardSummary matches getFullReconData stats for
 * GeneralBooks. Run with:
 *   npx tsx scripts/verify-full-recon-summary.ts
 *
 * Compares every dashboard-card field old (full action) vs new (summary).
 * Prints timing too.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as ControlPrisma } from "../lib/control-prisma/generated";

async function main() {
  // 1. Look up GeneralBooks tenant DB URL via control DB.
  const controlAdapter = new PrismaPg({
    connectionString: process.env.CONTROL_DATABASE_URL!,
  });
  const control = new ControlPrisma({ adapter: controlAdapter });
  const company = await control.company.findFirst({
    where: {
      OR: [
        { name: { contains: "general", mode: "insensitive" } },
        { slug: { contains: "general", mode: "insensitive" } },
      ],
    },
    select: { name: true, slug: true, databaseUrl: true },
  });
  await control.$disconnect();
  if (!company) {
    console.error("GeneralBooks company not found in control DB.");
    process.exit(1);
  }
  console.log(`Tenant: ${company.name} (${company.slug})`);

  // 2. Override env so lib/prisma's tenant proxy returns the GeneralBooks
  //    client without needing a real auth session.
  process.env.AUTH_ENABLED = "false";
  process.env.DEV_TENANT_DATABASE_URL = company.databaseUrl;

  // 3. Dynamic-import the action AFTER env overrides take effect.
  const mod = await import("../actions/full-reconciliation");
  const { getFullReconData, getFullReconDashboardSummary } = mod;

  // 4. Run new (fast) first to surface any SQL error fast.
  console.log("\nRunning getFullReconDashboardSummary...");
  const t1 = Date.now();
  const summary = await getFullReconDashboardSummary();
  const newMs = Date.now() - t1;
  console.log(`  done in ${newMs}ms`);

  // 5. Run old (slow) full action.
  console.log("\nRunning getFullReconData (old, full)...");
  const t2 = Date.now();
  const full = await getFullReconData({});
  const oldMs = Date.now() - t2;
  console.log(`  done in ${oldMs}ms (rows=${full.rows.length})`);

  // 6. Derive old card numbers exactly as app/(dashboard)/page.tsx does.
  const old = {
    takeAction: full.stats.takeAction,
    matched: full.stats.matched,
    over: full.stats.over,
    reimbursed: full.stats.reimbursed,
    noSnapshot: full.stats.noSnapshot,
    caseNeeded: full.rows.filter(
      (r) => r.reconStatus === "Take Action" && r.caseCount === 0,
    ).length,
    takeActionVariance: full.stats.takeActionVariance,
  };

  // 7. Compare.
  const fields: (keyof typeof old)[] = [
    "takeAction",
    "matched",
    "over",
    "reimbursed",
    "noSnapshot",
    "caseNeeded",
    "takeActionVariance",
  ];
  console.log("\n=== Comparison (old full action vs new summary) ===\n");
  console.log(
    `${"field".padEnd(22)} | ${"old".padStart(12)} | ${"new".padStart(12)} | match`,
  );
  console.log("-".repeat(70));
  let allMatch = true;
  for (const f of fields) {
    const ov = old[f];
    const nv = summary[f];
    const ok = ov === nv;
    if (!ok) allMatch = false;
    console.log(
      `${f.padEnd(22)} | ${String(ov).padStart(12)} | ${String(nv).padStart(12)} | ${
        ok ? "OK" : "MISMATCH (Δ=" + (Number(nv) - Number(ov)) + ")"
      }`,
    );
  }
  console.log("-".repeat(70));
  console.log(`\nTiming: old=${oldMs}ms  new=${newMs}ms  speedup=${(oldMs / newMs).toFixed(1)}x`);
  console.log(`Overall: ${allMatch ? "ALL FIELDS MATCH" : "MISMATCH — investigate"}`);

  // Dispose tenant clients to free pool.
  const prismaMod = await import("../lib/prisma");
  await prismaMod.disposeTenantClients();
  process.exit(allMatch ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
