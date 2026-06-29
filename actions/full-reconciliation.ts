"use server";

import { revalidatePath } from "next/cache";
import { AdjType, CaseStatus, Prisma, ReconType } from "@prisma/client";
// ReconType used both for case creation (FBA_BALANCE) and to scope the
// shipment-recon shortage-hover dataset (ReconType.SHIPMENT).

import { requireAuth } from "@/actions/auth";
import { prisma } from "@/lib/prisma";
import { summaryStats } from "@/lib/full-reconciliation/aggregate";
import {
  aggregateAdjByFnsku,
  aggregateCasesByFnsku,
  aggregateReceipts,
  aggregateShipmentAdjustments,
  aggregateShipmentCases,
  aggregateShipmentLostInboundReimb,
  aggregateFbaSummary,
  aggregateFcByFnsku,
  aggregateGnrByFnsku,
  aggregateRemovalReceipts,
  aggregateReimbursements,
  aggregateReplacementsByMsku,
  aggregateReturns,
  aggregateSalesNonZero,
  aggregateShipped,
  buildReimbsByMskuOrder,
  buildReturnsByMskuOrderFromRows,
  composeFullReconRow,
  trimStr,
} from "@/lib/full-reconciliation/formula";
import type { FullReconRow, FullReconStats } from "@/lib/full-reconciliation/types";
import {
  inventoryAdjustmentSchema,
  raiseInventoryCaseSchema,
} from "@/lib/validations/full-reconciliation";

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type FullReconciliationPayload = {
  rows: FullReconRow[];
  stats: FullReconStats;
};

function revalidateAll() {
  revalidatePath("/full-reconciliation");
  revalidatePath("/cases-adjustments");
}

function statusToEnum(s: string): CaseStatus {
  const v = s.toUpperCase();
  if (v === "RAISED" || v === "PENDING") return CaseStatus.IN_PROGRESS;
  if (v === "APPROVED") return CaseStatus.RESOLVED;
  if (v in CaseStatus) return v as CaseStatus;
  return CaseStatus.OPEN;
}

export type FullReconFilters = {
  search?: string;
};

export async function getFullReconData(
  filters: FullReconFilters = {},
): Promise<FullReconciliationPayload> {
  const search = filters.search?.trim();
  const searchPattern = search ? { contains: search, mode: "insensitive" as const } : undefined;

  // Search applies only to the anchor (ShippedToFba); auxiliary tables are joined post-hoc
  const shippedWhere: Prisma.ShippedToFbaWhereInput = { deletedAt: null };
  if (searchPattern) {
    shippedWhere.OR = [
      { msku: searchPattern },
      { fnsku: searchPattern },
      { asin: searchPattern },
      { title: searchPattern },
    ];
  }

  // Chunked to peak at 2 concurrent prisma queries against the tenant pool
  // (max:4), leaving 2 slots for the parallel callers running during the same
  // RSC render (getFullReconRemarks, getEffectiveLevelsForCurrentUser).
  // Identical query set + selects + destructure order to the prior implementation.
  const [shippedRows, receiptRows] = await Promise.all([
    prisma.shippedToFba.findMany({
      where: shippedWhere,
      select: {
        msku: true, title: true, asin: true, fnsku: true,
        shipDate: true, quantity: true, shipmentId: true,
      },
    }),
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, quantity: true, receiptDate: true,
        shipmentId: true, fulfillmentCenter: true,
      },
    }),
  ]);

  const [saleRows, returnRows] = await Promise.all([
    prisma.salesData.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, saleDate: true, productAmount: true },
    }),
    prisma.customerReturn.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, msku: true, quantity: true, status: true,
        disposition: true, reason: true, orderId: true,
      },
    }),
  ]);

  const [reimbRows, removalRcptRows] = await Promise.all([
    prisma.reimbursement.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, msku: true, quantity: true, amount: true,
        reason: true, amazonOrderId: true, caseId: true,
        reimbursementId: true, originalReimbId: true, originalReimbType: true,
      },
    }),
    prisma.removalReceipt.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, orderId: true, receivedQty: true,
        sellableQty: true, unsellableQty: true,
        conditionReceived: true, status: true, receivedDate: true,
      },
    }),
  ]);

  const [gnrRows, gnrManualRows] = await Promise.all([
    prisma.gnrReport.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, usedMsku: true, usedFnsku: true,
        usedCondition: true, quantity: true, unitStatus: true,
      },
    }),
    prisma.gradeResellItem.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, usedMsku: true, usedFnsku: true,
        usedCondition: true, quantity: true, unitStatus: true,
      },
    }),
  ]);

  const [caseRows, adjRows] = await Promise.all([
    prisma.caseTracker.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, status: true, unitsApproved: true, amountApproved: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, qtyAdjusted: true },
    }),
  ]);

  const [replacementRows, fcRows] = await Promise.all([
    prisma.replacement.findMany({
      where: { deletedAt: null },
      select: {
        msku: true, quantity: true,
        replacementOrderId: true, originalOrderId: true,
      },
    }),
    prisma.fcTransfer.findMany({
      where: { deletedAt: null },
      select: { fnsku: true, quantity: true, transferDate: true },
    }),
  ]);

  const [fbaSummaryRows, shipStatusRows] = await Promise.all([
    prisma.fbaSummary.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true, disposition: true, endingBalance: true,
        vendorReturns: true, found: true, lost: true, damaged: true,
        disposedQty: true, otherEvents: true, unknownEvents: true,
        summaryDate: true,
      },
    }),
    prisma.shipmentStatus.findMany({
      where: { deletedAt: null },
      select: { shipmentId: true, status: true },
    }),
  ]);

  const [receiptForLatestRows, shipmentCaseRows] = await Promise.all([
    prisma.fbaReceipt.findMany({
      where: { deletedAt: null, shipmentId: { not: null } },
      select: { shipmentId: true, receiptDate: true },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.SHIPMENT },
      select: { fnsku: true, status: true, unitsClaimed: true, unitsApproved: true },
    }),
  ]);

  const [shipmentAdjRows] = await Promise.all([
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.SHIPMENT },
      select: { fnsku: true, qtyAdjusted: true },
    }),
  ]);

  // Shipment status map
  const shipStatusMap = new Map<string, string>();
  for (const s of shipStatusRows) {
    const id = trimStr(s.shipmentId);
    if (id && s.status) shipStatusMap.set(id, s.status);
  }

  // Latest receipt date per shipment_id
  const shipLatestReceiptMap = new Map<string, Date>();
  for (const r of receiptForLatestRows) {
    const id = trimStr(r.shipmentId);
    if (!id || !r.receiptDate) continue;
    const prev = shipLatestReceiptMap.get(id);
    if (!prev || r.receiptDate > prev) shipLatestReceiptMap.set(id, r.receiptDate);
  }

  // Aggregates by FNSKU
  const shippedAgg = aggregateShipped(
    shippedRows.map((r) => ({ ...r, msku: r.msku ?? "" })),
    shipStatusMap,
    shipLatestReceiptMap,
  );
  const receiptsAgg = aggregateReceipts(receiptRows);
  const salesAgg = aggregateSalesNonZero(saleRows);
  const returnsAgg = aggregateReturns(returnRows);
  const reimbAgg = aggregateReimbursements(reimbRows);
  const removalRcptAgg = aggregateRemovalReceipts(removalRcptRows);
  const gnrAgg = aggregateGnrByFnsku([...gnrRows, ...gnrManualRows]);
  const casesAgg = aggregateCasesByFnsku(caseRows);
  const adjAgg = aggregateAdjByFnsku(adjRows);
  const fcAgg = aggregateFcByFnsku(fcRows);
  const fbaSummaryAgg = aggregateFbaSummary(fbaSummaryRows);

  // Shipment-recon view (powers Shortage cell hover)
  const shipmentReimbAgg = aggregateShipmentLostInboundReimb(reimbRows);
  const shipmentCaseAgg = aggregateShipmentCases(shipmentCaseRows);
  const shipmentAdjAgg = aggregateShipmentAdjustments(shipmentAdjRows);

  // Replacement lookup maps
  const returnsByMskuOrder = buildReturnsByMskuOrderFromRows(
    returnRows.map((r) => ({ msku: r.msku, orderId: r.orderId, quantity: r.quantity })),
  );
  const reimbsByMskuOrder = buildReimbsByMskuOrder(
    reimbRows.map((r) => ({
      msku: r.msku, amazonOrderId: r.amazonOrderId, quantity: r.quantity, amount: r.amount,
    })),
  );
  const replAgg = aggregateReplacementsByMsku(
    replacementRows,
    returnsByMskuOrder,
    reimbsByMskuOrder,
  );

  // Compose rows
  const today = new Date();
  const rows: FullReconRow[] = [];
  for (const [fnsku, shipped] of shippedAgg) {
    const repl = shipped.msku ? replAgg.get(shipped.msku) : undefined;
    rows.push(
      composeFullReconRow({
        fnsku,
        shipped,
        receipts: receiptsAgg.get(fnsku),
        sales: salesAgg.get(fnsku),
        returns: returnsAgg.get(fnsku),
        reimb: reimbAgg.get(fnsku),
        removalRcpt: removalRcptAgg.get(fnsku),
        gnr: gnrAgg.get(fnsku),
        cases: casesAgg.get(fnsku),
        adj: adjAgg.get(fnsku),
        repl,
        fc: fcAgg.get(fnsku),
        fbaSummary: fbaSummaryAgg.get(fnsku),
        shipmentReimb: shipmentReimbAgg.get(fnsku),
        shipmentCase: shipmentCaseAgg.get(fnsku),
        shipmentAdjQty: shipmentAdjAgg.get(fnsku),
        today,
      }),
    );
  }

  rows.sort((a, b) => a.msku.localeCompare(b.msku));

  const stats = summaryStats(rows);
  return { rows, stats };
}

export async function saveInventoryCaseAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = raiseInventoryCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const today = new Date();
    const row = await prisma.caseTracker.create({
      data: {
        msku: v.msku,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.FBA_BALANCE,
        caseReason: v.caseType,
        unitsClaimed: v.unitsClaimed,
        unitsApproved: 0,
        amountClaimed: new Prisma.Decimal(v.amountClaimed),
        amountApproved: new Prisma.Decimal(0),
        currency: "USD",
        status: statusToEnum("OPEN"),
        issueDate: today,
        raisedDate: today,
        notes: v.notes,
      },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function saveInventoryAdjustmentAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  try {
    await requireAuth();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unauthorized." };
  }
  const parsed = inventoryAdjustmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const row = await prisma.manualAdjustment.create({
      data: {
        msku: v.msku,
        fnsku: v.fnsku,
        asin: v.asin,
        title: v.title,
        reconType: ReconType.FBA_BALANCE,
        adjType: AdjType.QUANTITY,
        qtyBefore: 0,
        qtyAdjusted: v.qtyAdjusted,
        qtyAfter: v.qtyAdjusted,
        reason: v.reason,
        notes: v.notes,
      },
    });
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type FullReconDashboardSummary = {
  takeAction: number;
  matched: number;
  over: number;
  reimbursed: number;
  noSnapshot: number;
  caseNeeded: number;
  takeActionVariance: number;
};

/**
 * Lightweight per-FNSKU aggregate for the dashboard's Full Inventory card.
 * Mirrors getFullReconData's stats without loading the full row set:
 *  - All numeric components fetched server-side via groupBy / CTEs.
 *  - reconStatus computed per FNSKU in JS using the same formula as
 *    composeFullReconRow + computeReconStatus.
 */
export async function getFullReconDashboardSummary(): Promise<FullReconDashboardSummary> {
  type FnskuMsku = { fnsku: string; msku: string | null };
  type FnskuQty = { fnsku: string; qty: bigint | null };
  type MskuQty = { msku: string; qty: bigint | null };
  type FnskuEnd = { fnsku: string; ending_balance: number };
  type FnskuCount = { fnsku: string; count: bigint };

  const [
    anchor,
    receipts,
    sales,
    returns,
    removals,
    gnr,
    fc,
    fba,
    cases,
    reimb,
    repl,
  ] = await Promise.all([
    prisma.$queryRaw<FnskuMsku[]>`
      SELECT DISTINCT ON (TRIM(fnsku))
        TRIM(fnsku) AS fnsku,
        NULLIF(TRIM(msku), '') AS msku
      FROM shipped_to_fba
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      ORDER BY TRIM(fnsku), id
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT TRIM(fnsku) AS fnsku, SUM(quantity)::bigint AS qty
      FROM fba_receipts
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT TRIM(fnsku) AS fnsku, SUM(quantity)::bigint AS qty
      FROM sales_data
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
        AND "productAmount" IS NOT NULL AND "productAmount" <> 0
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT TRIM(fnsku) AS fnsku, SUM(quantity)::bigint AS qty
      FROM customer_returns
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT TRIM(fnsku) AS fnsku, SUM("receivedQty")::bigint AS qty
      FROM removal_receipts
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> '' AND "receivedQty" > 0
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT fnsku, SUM(qty)::bigint AS qty FROM (
        SELECT TRIM(fnsku) AS fnsku, quantity AS qty FROM gnr_report
          WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
        UNION ALL
        SELECT TRIM(fnsku) AS fnsku, quantity AS qty FROM grade_resell_items
          WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      ) t
      GROUP BY fnsku
    `,
    prisma.$queryRaw<FnskuQty[]>`
      SELECT TRIM(fnsku) AS fnsku, SUM(quantity)::bigint AS qty
      FROM fc_transfers
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuEnd[]>`
      SELECT DISTINCT ON (TRIM(fnsku))
        TRIM(fnsku) AS fnsku,
        "endingBalance" AS ending_balance
      FROM fba_summary
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
        AND LOWER(disposition) = 'sellable'
      ORDER BY TRIM(fnsku), "summaryDate" DESC NULLS LAST
    `,
    prisma.$queryRaw<FnskuCount[]>`
      SELECT TRIM(fnsku) AS fnsku, COUNT(*)::bigint AS count
      FROM case_tracker
      WHERE "deletedAt" IS NULL AND fnsku IS NOT NULL AND TRIM(fnsku) <> ''
      GROUP BY TRIM(fnsku)
    `,
    prisma.$queryRaw<FnskuQty[]>`
      WITH id_to_reason AS (
        SELECT "reimbursementId" AS rid, MAX(reason) AS reason
        FROM reimbursements
        WHERE "deletedAt" IS NULL AND "reimbursementId" IS NOT NULL AND reason IS NOT NULL
        GROUP BY "reimbursementId"
      ),
      effective AS (
        SELECT
          TRIM(r.fnsku) AS fnsku,
          r.quantity,
          CASE WHEN LOWER(TRIM(r.reason)) = 'reimbursement_reversal' THEN
            COALESCE(NULLIF(TRIM(r."originalReimbType"), ''),
                     (SELECT i.reason FROM id_to_reason i WHERE i.rid = r."originalReimbId"))
          ELSE TRIM(r.reason) END AS eff_reason,
          CASE WHEN LOWER(TRIM(r.reason)) = 'reimbursement_reversal' THEN -1 ELSE 1 END AS sign
        FROM reimbursements r
        WHERE r."deletedAt" IS NULL AND r.fnsku IS NOT NULL AND TRIM(r.fnsku) <> ''
      )
      SELECT fnsku, SUM(sign * quantity)::bigint AS qty
      FROM effective
      WHERE LOWER(eff_reason) IN ('damaged_warehouse','lost_warehouse','customerserviceissue','returnadjustment','generaladjustment')
      GROUP BY fnsku
    `,
    prisma.$queryRaw<MskuQty[]>`
      WITH return_orders AS (
        SELECT DISTINCT TRIM(msku) AS msku, TRIM("orderId") AS oid
        FROM customer_returns
        WHERE "deletedAt" IS NULL AND msku IS NOT NULL AND "orderId" IS NOT NULL
          AND TRIM(msku) <> '' AND TRIM("orderId") <> ''
      )
      SELECT TRIM(r.msku) AS msku, SUM(r.quantity)::bigint AS qty
      FROM replacements r
      WHERE r."deletedAt" IS NULL AND r.msku IS NOT NULL AND TRIM(r.msku) <> ''
        AND (
          EXISTS (
            SELECT 1 FROM return_orders ro
            WHERE ro.msku = TRIM(r.msku) AND ro.oid = TRIM(r."replacementOrderId")
          )
          OR EXISTS (
            SELECT 1 FROM return_orders ro
            WHERE ro.msku = TRIM(r.msku) AND ro.oid = TRIM(r."originalOrderId")
          )
        )
      GROUP BY TRIM(r.msku)
    `,
  ]);

  const toNum = (b: bigint | null | undefined): number => (b == null ? 0 : Number(b));
  const receiptsMap = new Map(receipts.map((r) => [r.fnsku, toNum(r.qty)]));
  const salesMap = new Map(sales.map((r) => [r.fnsku, toNum(r.qty)]));
  const returnsMap = new Map(returns.map((r) => [r.fnsku, toNum(r.qty)]));
  const removalsMap = new Map(removals.map((r) => [r.fnsku, toNum(r.qty)]));
  const gnrMap = new Map(gnr.map((r) => [r.fnsku, toNum(r.qty)]));
  const fcMap = new Map(fc.map((r) => [r.fnsku, toNum(r.qty)]));
  const fbaMap = new Map(fba.map((r) => [r.fnsku, r.ending_balance]));
  const reimbMap = new Map(reimb.map((r) => [r.fnsku, toNum(r.qty)]));
  const replMap = new Map(repl.map((r) => [r.msku, toNum(r.qty)]));
  const casesMap = new Map(cases.map((r) => [r.fnsku, Number(r.count)]));

  let matched = 0;
  let over = 0;
  let takeAction = 0;
  let reimbursed = 0;
  let noSnapshot = 0;
  let caseNeeded = 0;
  let takeActionVariance = 0;

  for (const { fnsku, msku } of anchor) {
    const receipt = receiptsMap.get(fnsku) ?? 0;
    const sold = salesMap.get(fnsku) ?? 0;
    const ret = returnsMap.get(fnsku) ?? 0;
    const reimbQ = reimbMap.get(fnsku) ?? 0;
    const removal = removalsMap.get(fnsku) ?? 0;
    const gnrQ = gnrMap.get(fnsku) ?? 0;
    const fcNet = fcMap.get(fnsku) ?? 0;
    const replQ = msku ? replMap.get(msku) ?? 0 : 0;
    const ending = receipt - sold + ret - reimbQ - removal - replQ - gnrQ + fcNet;
    const fbaEnd = fbaMap.has(fnsku) ? fbaMap.get(fnsku)! : null;

    if (fbaEnd === null) {
      noSnapshot++;
      continue;
    }
    const variance = fbaEnd - ending;
    if (variance === 0) {
      matched++;
      continue;
    }
    if (variance > 0) {
      over++;
      continue;
    }
    if (reimbQ > 0 && reimbQ >= -variance) {
      reimbursed++;
      continue;
    }
    takeAction++;
    takeActionVariance += Math.abs(variance);
    if ((casesMap.get(fnsku) ?? 0) === 0) caseNeeded++;
  }

  return {
    takeAction,
    matched,
    over,
    reimbursed,
    noSnapshot,
    caseNeeded,
    takeActionVariance,
  };
}

export async function getFullReconRemarks(): Promise<Record<string, string>> {
  const rows = await prisma.fullReconRemark.findMany({
    select: { fnsku: true, remarks: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.fnsku && r.remarks) map[r.fnsku] = r.remarks;
  }
  return map;
}

export async function saveFullReconRemark(
  fnsku: string,
  remarks: string | null,
): Promise<MutationResult> {
  try {
    await requireAuth();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unauthorized.",
    };
  }
  const key = (fnsku ?? "").trim();
  if (!key) return { ok: false, error: "fnsku required" };
  const value = remarks != null ? String(remarks).trim() || null : null;
  try {
    const existing = await prisma.fullReconRemark.findFirst({
      where: { fnsku: key, store: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.fullReconRemark.update({
        where: { id: existing.id },
        data: { remarks: value },
      });
    } else {
      await prisma.fullReconRemark.create({
        data: { fnsku: key, store: null, remarks: value },
      });
    }
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}
