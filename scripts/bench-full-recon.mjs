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

// ReconType.SHIPMENT enum string
const SHIPMENT = 'SHIPMENT';

async function run() {
  const t0 = Date.now();

  const [shippedRows, receiptRows] = await Promise.all([
    p.shippedToFba.findMany({
      where: { deletedAt: null },
      select: { msku: true, title: true, asin: true, fnsku: true, shipDate: true, quantity: true, shipmentId: true },
    }),
    p.fbaReceipt.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, receiptDate: true, shipmentId: true, fulfillmentCenter: true },
    }),
  ]);

  const [saleRows, returnRows] = await Promise.all([
    p.salesData.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, saleDate: true, productAmount: true },
    }),
    p.customerReturn.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, msku: true, quantity: true, status: true, disposition: true, reason: true, orderId: true },
    }),
  ]);

  const [reimbRows, removalRcptRows] = await Promise.all([
    p.reimbursement.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, msku: true, quantity: true, amount: true, reason: true, amazonOrderId: true, caseId: true, reimbursementId: true, originalReimbId: true, originalReimbType: true },
    }),
    p.removalReceipt.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, orderId: true, receivedQty: true, sellableQty: true, unsellableQty: true, conditionReceived: true, status: true, receivedDate: true },
    }),
  ]);

  const [gnrRows, gnrManualRows] = await Promise.all([
    p.gnrReport.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, usedMsku: true, usedFnsku: true, usedCondition: true, quantity: true, unitStatus: true },
    }),
    p.gradeResellItem.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, usedMsku: true, usedFnsku: true, usedCondition: true, quantity: true, unitStatus: true },
    }),
  ]);

  const [caseRows, adjRows] = await Promise.all([
    p.caseTracker.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, status: true, unitsApproved: true, amountApproved: true },
    }),
    p.manualAdjustment.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, qtyAdjusted: true },
    }),
  ]);

  const [replacementRows, fcRows] = await Promise.all([
    p.replacement.findMany({
      where: { deletedAt: null },
      select: { msku: true, quantity: true, replacementOrderId: true, originalOrderId: true },
    }),
    p.fcTransfer.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, transferDate: true },
    }),
  ]);

  const [fbaSummaryRows, shipStatusRows] = await Promise.all([
    p.fbaSummary.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, disposition: true, endingBalance: true,
        vendorReturns: true, found: true, lost: true, damaged: true,
        disposedQty: true, otherEvents: true, unknownEvents: true, summaryDate: true,
      },
    }),
    p.shipmentStatus.findMany({
      where: { deletedAt: null },
      select: { shipmentId: true, status: true },
    }),
  ]);

  const [receiptForLatestRows, shipmentCaseRows] = await Promise.all([
    p.fbaReceipt.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      select: { shipmentId: true, receiptDate: true },
    }),
    p.caseTracker.findMany({
      where: { deletedAt: null, reconType: SHIPMENT },
      select: { fnsku: true, status: true, unitsClaimed: true, unitsApproved: true },
    }),
  ]);

  const [shipmentAdjRows] = await Promise.all([
    p.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: SHIPMENT },
      select: { fnsku: true, qtyAdjusted: true },
    }),
  ]);

  const ms = Date.now() - t0;
  return {
    ms,
    counts: {
      shipped: shippedRows.length,
      receipt: receiptRows.length,
      sale: saleRows.length,
      return: returnRows.length,
      reimb: reimbRows.length,
      removalRcpt: removalRcptRows.length,
      gnr: gnrRows.length,
      gnrManual: gnrManualRows.length,
      case: caseRows.length,
      adj: adjRows.length,
      replacement: replacementRows.length,
      fc: fcRows.length,
      fbaSummary: fbaSummaryRows.length,
      shipStatus: shipStatusRows.length,
      receiptForLatest: receiptForLatestRows.length,
      shipmentCase: shipmentCaseRows.length,
      shipmentAdj: shipmentAdjRows.length,
    },
  };
}

console.log('Warmup run (caches cold)...');
const warm = await run();
console.log(`Warmup: ${warm.ms}ms`);
console.log('Counts:', warm.counts);

console.log('\nHot run (caches warm)...');
const hot = await run();
console.log(`Hot: ${hot.ms}ms`);

await p.$disconnect();
console.log(`\nBaseline (pre-index): ~100,000ms`);
console.log(`Warmup (post-index, cold): ${warm.ms}ms`);
console.log(`Hot    (post-index, warm): ${hot.ms}ms`);
