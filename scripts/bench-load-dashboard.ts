/**
 * Bench loadDashboard equivalent (Promise.all of every action the dashboard
 * fires) for GeneralBooks, comparing OLD (getFullReconData) vs NEW
 * (getFullReconDashboardSummary) in the Full Inventory slot.
 *
 * Run:  npx tsx scripts/bench-load-dashboard.ts
 *
 * Reports cold + warm timings for both variants so the perf delta is real
 * rather than a one-shot fluke.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as ControlPrisma } from "../lib/control-prisma/generated";

async function main() {
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
    select: { name: true, databaseUrl: true },
  });
  await control.$disconnect();
  if (!company) throw new Error("GeneralBooks not found in control DB.");
  console.log(`Tenant: ${company.name}`);

  process.env.AUTH_ENABLED = "false";
  process.env.DEV_TENANT_DATABASE_URL = company.databaseUrl;

  const [
    shipMod,
    removalMod,
    returnsMod,
    replMod,
    fcMod,
    gnrMod,
    adjMod,
    fullMod,
    casesMod,
    prismaMod,
  ] = await Promise.all([
    import("../actions/shipment-reconciliation"),
    import("../actions/removal-reconciliation"),
    import("../actions/returns-reconciliation"),
    import("../actions/replacement-reconciliation"),
    import("../actions/fc-transfer-reconciliation"),
    import("../actions/gnr-reconciliation-v2"),
    import("../actions/adjustment-reconciliation"),
    import("../actions/full-reconciliation"),
    import("../actions/cases"),
    import("../lib/prisma"),
  ]);

  const { prisma } = prismaMod;

  async function flowAndMeta() {
    return Promise.all([
      Promise.all([
        prisma.shippedToFba.aggregate({ _sum: { quantity: true }, where: { deletedAt: null } }),
        prisma.fbaReceipt.aggregate({ _sum: { quantity: true }, where: { deletedAt: null } }),
        prisma.salesData.aggregate({ _sum: { quantity: true }, where: { deletedAt: null } }),
        prisma.customerReturn.aggregate({ _sum: { quantity: true }, where: { deletedAt: null } }),
        prisma.reimbursement.aggregate({ _sum: { quantity: true }, where: { deletedAt: null } }),
      ]),
      prisma.reconciliationSummary.findFirst({
        orderBy: { lastRefreshedAt: "desc" },
        select: { lastRefreshedAt: true },
      }),
    ]);
  }

  async function loadDashboardOLD() {
    const t0 = Date.now();
    await Promise.all([
      shipMod.getShipmentReconciliationData({ shipmentStatus: "all", shipmentId: "all" }),
      removalMod.getRemovalReconData({}),
      returnsMod.getReturnsReconData({}),
      replMod.getReplacementReconData({}),
      fcMod.getFcTransferFullRecon({}),
      gnrMod.getGnrReconV2Data({}),
      adjMod.getAdjReconData({ groupBy: "msku" }),
      fullMod.getFullReconData({}),
      casesMod.getCases({}),
      casesMod.getAdjustments({}),
      flowAndMeta(),
    ]);
    return Date.now() - t0;
  }

  async function loadDashboardNEW() {
    const t0 = Date.now();
    await Promise.all([
      shipMod.getShipmentReconciliationData({ shipmentStatus: "all", shipmentId: "all" }),
      removalMod.getRemovalReconData({}),
      returnsMod.getReturnsReconData({}),
      replMod.getReplacementReconData({}),
      fcMod.getFcTransferFullRecon({}),
      gnrMod.getGnrReconV2Data({}),
      adjMod.getAdjReconData({ groupBy: "msku" }),
      fullMod.getFullReconDashboardSummary(),
      casesMod.getCases({}),
      casesMod.getAdjustments({}),
      flowAndMeta(),
    ]);
    return Date.now() - t0;
  }

  // Warm pool first so cold-handshake doesn't skew either variant.
  console.log("\nWarmup (1 run each, discarded)...");
  await loadDashboardOLD();
  await loadDashboardNEW();

  console.log("\nTimed runs (interleaved x3 each):");
  const oldTimes: number[] = [];
  const newTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const o = await loadDashboardOLD();
    const n = await loadDashboardNEW();
    oldTimes.push(o);
    newTimes.push(n);
    console.log(`  run ${i + 1}: OLD ${o}ms   NEW ${n}ms`);
  }

  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  console.log(`\nAvg OLD: ${avg(oldTimes)}ms  |  Avg NEW: ${avg(newTimes)}ms  |  Saved: ${avg(oldTimes) - avg(newTimes)}ms (${(avg(oldTimes) / avg(newTimes)).toFixed(2)}x)`);

  await prismaMod.disposeTenantClients();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
