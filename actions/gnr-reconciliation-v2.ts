"use server";

import { Prisma, ReconType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  aggregateGnrV2,
  assignFlowToUsedSkus,
  buildAdjMapV2,
  buildCaseMapV2,
  buildInvAdjMap,
  lookupLedger,
  buildLedgerMap,
  combineGnrV2Sources,
  composeGnrV2Row,
  flowToMatchRows,
  normId,
  reimbToMatchRows,
  removalsToMatchRows,
  salesToMatchRows,
  summariseDropped,
  summaryStatsV2,
  usedKeyOf,
  type GnrV2LedgerInputRow,
} from "@/lib/gnr-reconciliation/v2/formula";
import type {
  GnrV2FlowRow,
  GnrV2InvAdjRow,
  GnrV2ReimbRow,
  GnrV2Row,
  GnrV2SaleRow,
  GnrV2Stats,
  GnrV2UsedKey,
} from "@/lib/gnr-reconciliation/v2/types";

export type GnrReconV2Payload = {
  rows: GnrV2Row[];
  stats: GnrV2Stats;
};

export type GnrReconV2Filters = {
  search?: string;
  status?: string;
};

/**
 * FBA Recon v2 data loader. Read-only; mirrors the data set of the v1 GNR tab
 * but reconciles against the Inventory Ledger Summary via the v2 formula.
 *
 * Every query filters deletedAt: null. Decimal fields are passed to the pure
 * layer as objects with toString(); the formula converts via Number(x.toString()).
 */
export async function getGnrReconV2Data(
  filters: GnrReconV2Filters = {},
): Promise<GnrReconV2Payload> {
  const search = filters.search?.trim();

  const gnrWhere: Prisma.GnrReportWhereInput = { deletedAt: null };
  const manualWhere: Prisma.GradeResellItemWhereInput = { deletedAt: null };
  if (search) {
    gnrWhere.OR = [
      { usedMsku: { contains: search, mode: "insensitive" } },
      { usedFnsku: { contains: search, mode: "insensitive" } },
      { asin: { contains: search, mode: "insensitive" } },
      { fnsku: { contains: search, mode: "insensitive" } },
    ];
    manualWhere.OR = [
      { usedMsku: { contains: search, mode: "insensitive" } },
      { usedFnsku: { contains: search, mode: "insensitive" } },
      { asin: { contains: search, mode: "insensitive" } },
      { fnsku: { contains: search, mode: "insensitive" } },
      { msku: { contains: search, mode: "insensitive" } },
    ];
  }

  const [
    reportRows,
    manualRows,
    salesRows,
    returnRows,
    shipmentRows,
    removalRows,
    reimbRows,
    summaryRows,
    caseRows,
    adjRows,
    invAdjRows,
  ] = await Promise.all([
    prisma.gnrReport.findMany({
      where: gnrWhere,
      select: {
        usedMsku: true,
        usedFnsku: true,
        fnsku: true,
        asin: true,
        usedCondition: true,
        quantity: true,
        unitStatus: true,
        orderId: true,
        lpn: true,
        reportDate: true,
      },
    }),
    prisma.gradeResellItem.findMany({
      where: manualWhere,
      select: {
        msku: true,
        fnsku: true,
        asin: true,
        usedMsku: true,
        usedFnsku: true,
        usedCondition: true,
        grade: true,
        quantity: true,
        unitStatus: true,
        orderId: true,
        lpn: true,
        gradedDate: true,
      },
    }),
    prisma.salesData.findMany({
      where: { deletedAt: null },
      select: { msku: true, fnsku: true, quantity: true, saleDate: true, productAmount: true, orderId: true },
    }),
    prisma.customerReturn.findMany({
      where: { deletedAt: null },
      select: { msku: true, fnsku: true, quantity: true, returnDate: true, orderId: true, disposition: true },
    }),
    prisma.removalShipment.findMany({
      where: { deletedAt: null },
      select: {
        msku: true,
        fnsku: true,
        shippedQty: true,
        shipmentDate: true,
        requestDate: true,
        orderId: true,
        disposition: true,
      },
    }),
    prisma.fbaRemoval.findMany({
      where: { deletedAt: null },
      select: { msku: true, fnsku: true, quantity: true, requestDate: true, orderId: true, disposition: true },
    }),
    prisma.reimbursement.findMany({
      where: { deletedAt: null },
      select: {
        msku: true,
        fnsku: true,
        quantity: true,
        amount: true,
        reason: true,
        reimbursementId: true,
        originalReimbId: true,
        originalReimbType: true,
        approvalDate: true,
      },
    }),
    prisma.fbaSummary.findMany({
      where: { deletedAt: null },
      select: {
        msku: true,
        fnsku: true,
        title: true,
        endingBalance: true,
        startingBalance: true,
        disposition: true,
        receipts: true,
        found: true,
        lost: true,
        damaged: true,
        disposedQty: true,
        otherEvents: true,
        unknownEvents: true,
        summaryDate: true,
      },
    }),
    prisma.caseTracker.findMany({
      where: { deletedAt: null, reconType: ReconType.GNR },
      select: {
        fnsku: true,
        unitsClaimed: true,
        unitsApproved: true,
        amountApproved: true,
        status: true,
        referenceId: true,
        caseReason: true,
        raisedDate: true,
      },
    }),
    prisma.manualAdjustment.findMany({
      where: { deletedAt: null, reconType: ReconType.GNR },
      select: { msku: true, qtyAdjusted: true, reason: true },
    }),
    // Inventory adjustments — ALL rows (every reason, negative qty included).
    // reason='3' arrivals: buildInvAdjMap keeps reason='3' qty>0 only (Actual In).
    // Adjustments column: buildOtherAdjMap nets every other reason (Q/P flips
    // cancel; lost/damaged/etc net per reason). The old quantity>0 filter is gone
    // so negative movement is captured.
    prisma.inventoryAdjustment.findMany({
      where: { deletedAt: null },
      select: {
        fnsku: true,
        title: true,
        quantity: true,
        reason: true,
        adjDate: true,
        referenceId: true,
        fulfillmentCenter: true,
        disposition: true,
      },
    }),
  ]);

  // ── Source combine + grading aggregation ──
  const combined = combineGnrV2Sources(reportRows, manualRows);
  const aggs = aggregateGnrV2(combined);

  // ── Ledger anchor (pair-matched on msku + fnsku) ──
  const ledgerInput: GnrV2LedgerInputRow[] = summaryRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    endingBalance: r.endingBalance,
    startingBalance: r.startingBalance,
    disposition: r.disposition,
    receipts: r.receipts,
    found: r.found,
    lost: r.lost,
    damaged: r.damaged,
    disposedQty: r.disposedQty,
    otherEvents: r.otherEvents,
    unknownEvents: r.unknownEvents,
    summaryDate: r.summaryDate,
  }));
  const ledgerIndex = buildLedgerMap(ledgerInput);

  // ── GNR arrivals (inventory_adjustments reason='3') ── (untouched: Actual In)
  const invAdjInput: GnrV2InvAdjRow[] = invAdjRows.map((r) => ({
    fnsku: r.fnsku,
    quantity: r.quantity,
    reason: r.reason,
    adjDate: r.adjDate,
    referenceId: r.referenceId,
    fulfillmentCenter: r.fulfillmentCenter,
    disposition: r.disposition,
  }));
  const inMap = buildInvAdjMap(invAdjInput);

  // Title per fnsku: prefer the first non-empty fba_summary title, else fall back
  // to the inventory_adjustments title. Keyed by trimmed fnsku (matches lookups).
  const titleByFnsku = new Map<string, string>();
  for (const r of summaryRows) {
    const f = (r.fnsku ?? "").trim();
    const t = (r.title ?? "").trim();
    if (f && t && !titleByFnsku.has(f)) titleByFnsku.set(f, t);
  }
  for (const r of invAdjRows) {
    const f = (r.fnsku ?? "").trim();
    const t = (r.title ?? "").trim();
    if (f && t && !titleByFnsku.has(f)) titleByFnsku.set(f, t);
  }

  // Account-wide adjustments coverage end = latest adjDate across ALL
  // inventory_adjustments. Drives the pending-data timing guard: grading newer
  // than this (minus a grace window) likely isn't in the uploaded report yet.
  let adjCoverageEnd: Date | null = null;
  for (const r of invAdjRows) {
    if (r.adjDate && (!adjCoverageEnd || r.adjDate > adjCoverageEnd)) {
      adjCoverageEnd = r.adjDate;
    }
  }

  // Ledger-date cutoff keyed by NORMALISED fnsku (matches normId in the matcher).
  // The matcher only knows a flow row's fnsku, so collapse both ledger groupings
  // (pair keys "msku|fnsku" and blank-msku fnsku keys) onto the fnsku; latest date
  // wins when several msku variants share an fnsku.
  const cutoffByNormFnsku = new Map<string, Date | null>();
  const noteCutoff = (normFnsku: string, d: Date | null) => {
    const prev = cutoffByNormFnsku.get(normFnsku);
    if (prev === undefined) {
      cutoffByNormFnsku.set(normFnsku, d);
    } else if (d && (!prev || d > prev)) {
      cutoffByNormFnsku.set(normFnsku, d);
    }
  };
  for (const [pairKey, l] of ledgerIndex.byPair) {
    noteCutoff(pairKey.slice(pairKey.indexOf("|") + 1), l.ledgerDate);
  }
  for (const [fnsku, l] of ledgerIndex.byFnskuBlank) noteCutoff(fnsku, l.ledgerDate);

  // Used SKUs that flows are matched against (one per aggregate bucket).
  const usedSkus: GnrV2UsedKey[] = aggs.map((a) => ({
    usedMsku: a.usedMsku,
    usedFnsku: a.usedFnsku,
  }));

  // ── Flow match rows (composite key: msku + fnsku) ──
  const salesInput: GnrV2SaleRow[] = salesRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    quantity: r.quantity,
    date: r.saleDate,
    productAmount: r.productAmount,
    orderId: r.orderId,
  }));
  const returnInput: GnrV2FlowRow[] = returnRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    quantity: r.quantity,
    date: r.returnDate,
    orderId: r.orderId,
    disposition: r.disposition,
  }));
  const shipmentInput: GnrV2FlowRow[] = shipmentRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    quantity: r.shippedQty,
    date: r.shipmentDate ?? r.requestDate,
    orderId: r.orderId,
    disposition: r.disposition,
  }));
  const removalFallbackInput: GnrV2FlowRow[] = removalRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    quantity: r.quantity,
    date: r.requestDate,
    orderId: r.orderId,
    disposition: r.disposition,
  }));
  const reimbInput: GnrV2ReimbRow[] = reimbRows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    quantity: r.quantity,
    amount: r.amount,
    reason: r.reason,
    reimbursementId: r.reimbursementId,
    originalReimbId: r.originalReimbId,
    originalReimbType: r.originalReimbType,
    date: r.approvalDate,
  }));

  const salesMatch = assignFlowToUsedSkus(salesToMatchRows(salesInput), usedSkus, cutoffByNormFnsku, "sales");
  const returnsMatch = assignFlowToUsedSkus(flowToMatchRows(returnInput), usedSkus, cutoffByNormFnsku, "returns");
  const removalsMatch = assignFlowToUsedSkus(
    removalsToMatchRows(shipmentInput, removalFallbackInput),
    usedSkus,
    cutoffByNormFnsku,
    "removals",
  );
  const reimbMatch = assignFlowToUsedSkus(reimbToMatchRows(reimbInput), usedSkus, cutoffByNormFnsku, "reimb");

  const ambiguousFlowRows =
    salesMatch.ambiguous + returnsMatch.ambiguous + removalsMatch.ambiguous + reimbMatch.ambiguous;
  const droppedPairRows = summariseDropped([salesMatch, returnsMatch, removalsMatch, reimbMatch]);

  // ── Overlays ──
  const caseMap = buildCaseMapV2(caseRows);
  const adjMap = buildAdjMapV2(adjRows);

  const today = new Date();
  let rows = aggs.map((agg) => {
    // Ledger / inventory-adjustment lookups stay fnsku-keyed (trimmed, not normed).
    const fnsku =
      agg.usedFnsku && agg.usedFnsku !== "(No Used FNSKU)" ? agg.usedFnsku.trim() : "";
    const uk = usedKeyOf(agg.usedMsku, agg.usedFnsku);
    const reimb = reimbMatch.byUsedKey.get(uk);
    return composeGnrV2Row({
      agg,
      // Ledger is pair-matched: exact (usedMsku, fnsku) else a fnsku-only
      // aggregate built from blank-msku summary rows (lookupLedger).
      ledger: fnsku ? lookupLedger(ledgerIndex, agg.usedMsku, fnsku) : undefined,
      inMeta: fnsku ? inMap.get(fnsku) : undefined,
      salesQty: salesMatch.byUsedKey.get(uk)?.qty ?? 0,
      returnQty: returnsMatch.byUsedKey.get(uk)?.qty ?? 0,
      removalQty: removalsMatch.byUsedKey.get(uk)?.qty ?? 0,
      salesMatched: salesMatch.detailsByUsedKey.get(uk),
      returnsMatched: returnsMatch.detailsByUsedKey.get(uk),
      removalsMatched: removalsMatch.detailsByUsedKey.get(uk),
      reimb: reimb ? { qty: reimb.qty, amount: reimb.amount } : undefined,
      caseMeta: fnsku ? caseMap.get(fnsku) : undefined,
      adj: adjMap.get(agg.usedMsku),
      title: fnsku ? titleByFnsku.get(fnsku) : undefined,
      adjCoverageEnd,
      today,
    });
  });

  // Sort: actionable first (claim-inbound, take-action), then by abs variance desc.
  const statusRank: Record<string, number> = {
    "claim-inbound": 0,
    "take-action": 1,
    waiting: 2,
    "over-accounted": 3,
    "pending-data": 4,
    "no-snapshot": 5,
    review: 6,
    reimbursed: 7,
    resolved: 8,
    matched: 9,
    "mixed-sku": 10,
  };
  rows.sort((a, b) => {
    const ra = statusRank[a.status] ?? 9;
    const rb = statusRank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const va = Math.abs(a.variance ?? 0);
    const vb = Math.abs(b.variance ?? 0);
    if (vb !== va) return vb - va;
    return a.usedMsku.localeCompare(b.usedMsku);
  });

  if (filters.status && filters.status !== "all" && filters.status !== "") {
    rows = rows.filter((r) => r.status === filters.status);
  }

  const stats = summaryStatsV2(rows, ambiguousFlowRows, droppedPairRows);
  return { rows, stats };
}
