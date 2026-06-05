import {
  isGnrMsku, norm, orderFnskuKey,
  orderMskuKey, trimStr,
} from "./matching";
import type {
  AdjMeta, CaseMeta, FbaSummaryMeta, FinalStatus,
  GnrBridgeMeta, InventoryStatus, OwnershipStatus,
  ReimbMeta, ReimbStatus, ReturnsReconRow, SalesMeta,
} from "./types";

const PROCESSING_WINDOW_DAYS = 60;
const SUMMARY_TOLERANCE_DAYS = 3;

const EMPTY_REIMB: ReimbMeta = {
  qty: 0, qtyCash: 0, qtyInventory: 0,
  amount: 0, reimbType: "NONE",
};
const EMPTY_CASE: CaseMeta = {
  count: 0, claimedQty: 0, approvedQty: 0,
  approvedAmount: 0, caseIds: [], topStatus: "No Case",
};
const EMPTY_ADJ: AdjMeta = { qty: 0, count: 0, reasons: [] };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; }
  catch { return ""; }
}

function daysBetween(from: Date | null, to: Date): number {
  if (!from) return -1;
  return Math.max(
    0,
    Math.floor((to.getTime() - new Date(from).getTime()) / 86400000),
  );
}

function classifyDispositions(
  dispositions: Set<string>,
  qty: number,
): { sellableQty: number; unsellableQty: number; isSellable: boolean } {
  const hasSellable = Array.from(dispositions).some((d) =>
    d.toUpperCase().includes("SELLABLE"),
  );
  return {
    sellableQty: hasSellable ? qty : 0,
    unsellableQty: hasSellable ? 0 : qty,
    isSellable: hasSellable,
  };
}

export type ReturnAggregate = {
  orderId: string;
  fnsku: string;
  lpn: string;  // license plate number — links return to GNR transfer
  msku: string;
  asin: string;
  title: string;
  totalReturned: number;
  returnEvents: number;
  dispositions: Set<string>;
  reasons: Set<string>;
  amazonStatus: string;
  earliestReturn: Date | null;
  latestReturn: Date | null;
};

export function aggregateReturns(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    msku: string | null;
    asin: string | null;
    title: string | null;
    quantity: number;
    disposition: string | null;
    reason: string | null;
    status: string | null;
    returnDate: Date | null;
    licensePlateNumber: string | null;
  }[],
): ReturnAggregate[] {
  const map = new Map<string, ReturnAggregate>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    const fn  = trimStr(r.fnsku);
    if (!oid && !fn) continue;
    const key = `${oid}|${fn}`;
    const p = map.get(key) ?? {
      orderId: oid, fnsku: fn,
      lpn: trimStr(r.licensePlateNumber),
      msku: trimStr(r.msku), asin: trimStr(r.asin),
      title: trimStr(r.title),
      totalReturned: 0, returnEvents: 0,
      dispositions: new Set<string>(),
      reasons: new Set<string>(),
      amazonStatus: trimStr(r.status),
      earliestReturn: null, latestReturn: null,
    };
    p.totalReturned += r.quantity || 0;
    p.returnEvents++;
    if (r.disposition) p.dispositions.add(r.disposition);
    if (r.reason) p.reasons.add(r.reason);
    if (r.status && !p.amazonStatus)
      p.amazonStatus = trimStr(r.status);
    if (r.returnDate) {
      if (!p.earliestReturn || r.returnDate < p.earliestReturn)
        p.earliestReturn = r.returnDate;
      if (!p.latestReturn || r.returnDate > p.latestReturn)
        p.latestReturn = r.returnDate;
    }
    if (!p.msku && r.msku) p.msku = trimStr(r.msku);
    if (!p.asin && r.asin) p.asin = trimStr(r.asin);
    if (!p.title && r.title) p.title = trimStr(r.title);
    if (r.licensePlateNumber && !p.lpn)
      p.lpn = trimStr(r.licensePlateNumber);
    map.set(key, p);
  }
  return Array.from(map.values());
}

// Builds a complete row with GNR outcome
function gnrRow(
  agg: ReturnAggregate,
  sellableQty: number,
  unsellableQty: number,
  isSellable: boolean,
  gnrMatch: GnrBridgeMeta | undefined,
  caseMeta: CaseMeta,
  adj: AdjMeta,
  daysSinceReturn: number,
  isWithinWindow: boolean,
  lpn: string,
  fbaSummaryConfirmedQty = 0,
  fbaSummaryExpectedQty  = 0,
): ReturnsReconRow {
  const finalStatus: FinalStatus = gnrMatch
    ? "GNR_TRACKING" : "UNKNOWN_GNR_CASE";
  const ownershipStatus: OwnershipStatus = gnrMatch
    ? "GNR_TRACKING" : "UNKNOWN_GNR";
  return {
    orderId: agg.orderId || "—",
    returnFnsku: agg.fnsku || "—",
    lpn: lpn || agg.lpn || "",
    msku: agg.msku || "—",
    asin: agg.asin || "—",
    title: agg.title || "—",
    totalReturned: agg.totalReturned,
    sellableQty, unsellableQty,
    returnEvents: agg.returnEvents,
    dispositions: Array.from(agg.dispositions).join(", "),
    reasons: Array.from(agg.reasons).join(", "),
    isSellable, isGnrMsku: true,
    amazonStatus: agg.amazonStatus,
    ownershipStatus,
    salesMsku: gnrMatch?.originalMsku ?? "",
    gnrStatus: gnrMatch?.unitStatus ?? "",
    inventoryStatus: "NOT_APPLICABLE",
    fbaSummaryConfirmedQty,
    fbaSummaryExpectedQty,
    reimbStatus: "NOT_APPLICABLE",
    reimbQty: 0, reimbCashQty: 0,
    reimbInventoryQty: 0, reimbAmount: 0,
    caseCount: caseMeta.count,
    caseReimbQty: caseMeta.approvedQty,
    caseReimbAmount: caseMeta.approvedAmount,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    adjQty: adj.qty,
    effReimbQty: caseMeta.approvedQty + adj.qty,
    effReimbAmount: caseMeta.approvedAmount,
    earliestReturn: fmtDate(agg.earliestReturn),
    latestReturn:   fmtDate(agg.latestReturn),
    daysSinceReturn, isWithinWindow,
    finalStatus,
  };
}

export function computeReturnRow(input: {
  agg: ReturnAggregate;
  salesMap: Map<string, SalesMeta>;
  gnrBridge: {
    byUsedFnsku: Map<string, GnrBridgeMeta>;
    byOrderId:   Map<string, GnrBridgeMeta>;
  };
  gnrByLpnMap: Map<string, GnrBridgeMeta>;
  fbaSummaryMap: Map<string, FbaSummaryMeta>;
  mskuSellableTotals: Map<string, number>;
  reimbMaps: {
    byOrderMsku: Map<string, ReimbMeta>;
    byMsku:      Map<string, ReimbMeta>;
  };
  caseMap: Map<string, CaseMeta>;
  adjMap:  Map<string, AdjMeta>;
  now: Date;
}): ReturnsReconRow {
  const {
    agg, salesMap, gnrBridge, fbaSummaryMap,
    mskuSellableTotals, reimbMaps, caseMap, adjMap, now,
  } = input;

  const fnskuNorm    = norm(agg.fnsku);
  const mskuNorm     = norm(agg.msku);
  const gnrMsku      = isGnrMsku(agg.msku);
  const amazonStatus = agg.amazonStatus || "Unit returned to inventory";
  const amazonSaysReimbursed = amazonStatus === "Reimbursed";

  const { sellableQty, unsellableQty, isSellable } =
    classifyDispositions(agg.dispositions, agg.totalReturned);

  const daysSinceReturn = daysBetween(agg.latestReturn, now);
  const isWithinWindow  =
    daysSinceReturn >= 0 && daysSinceReturn < PROCESSING_WINDOW_DAYS;

  const caseMeta = caseMap.get(agg.msku) ?? EMPTY_CASE;
  const adj = adjMap.get(orderFnskuKey(agg.orderId, agg.fnsku)) ?? EMPTY_ADJ;

  // ── PATH 0: GNR MSKU (sku prefix "amzn.gr.") ──────────────────────────
  if (gnrMsku) {
    const gnrMatch =
      (fnskuNorm ? gnrBridge.byUsedFnsku.get(fnskuNorm) : undefined) ??
      gnrBridge.byOrderId.get(agg.orderId);
    return gnrRow(
      agg, sellableQty, unsellableQty, isSellable,
      gnrMatch, caseMeta, adj, daysSinceReturn, isWithinWindow,
      agg.lpn || "",
    );
  }

  // ── PATH A: Amazon says "Reimbursed" ───────────────────────────────────
  if (amazonSaysReimbursed) {
    const reimb =
      reimbMaps.byOrderMsku.get(orderMskuKey(agg.orderId, agg.msku)) ??
      reimbMaps.byMsku.get(agg.msku);

    const verified = reimb && reimb.qty > 0;
    const reimbStatus: ReimbStatus = !verified
      ? "REIMBURSED_UNVERIFIED"
      : reimb!.qtyCash > 0
        ? "REIMBURSED_CASH"
        : "REIMBURSED_INVENTORY";
    const finalStatus: FinalStatus = verified ? "RESOLVED" : "INVESTIGATE";

    return {
      orderId: agg.orderId || "—",
      returnFnsku: agg.fnsku || "—",
      lpn: agg.lpn || "",
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      sellableQty, unsellableQty,
      returnEvents: agg.returnEvents,
      dispositions: Array.from(agg.dispositions).join(", "),
      reasons: Array.from(agg.reasons).join(", "),
      isSellable, isGnrMsku: false, amazonStatus,
      ownershipStatus: "CONFIRMED",
      salesMsku: salesMap.get(agg.orderId)?.msku ?? "",
      gnrStatus: "",
      inventoryStatus: "NOT_APPLICABLE",
      fbaSummaryConfirmedQty: 0, fbaSummaryExpectedQty: 0,
      reimbStatus,
      reimbQty: reimb?.qty ?? 0,
      reimbCashQty: reimb?.qtyCash ?? 0,
      reimbInventoryQty: reimb?.qtyInventory ?? 0,
      reimbAmount: reimb?.amount ?? 0,
      caseCount: caseMeta.count,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      adjQty: adj.qty,
      effReimbQty: (reimb?.qty ?? 0) + caseMeta.approvedQty + adj.qty,
      effReimbAmount: (reimb?.amount ?? 0) + caseMeta.approvedAmount,
      earliestReturn: fmtDate(agg.earliestReturn),
      latestReturn:   fmtDate(agg.latestReturn),
      daysSinceReturn, isWithinWindow,
      finalStatus,
    };
  }

  // ── PATH B: "Unit returned to inventory" ──────────────────────────────
  // Step 1: ownership (orderId + MSKU in SalesData)
  const sale = salesMap.get(agg.orderId);
  const mskuMatches =
    sale && mskuNorm && norm(sale.msku) === mskuNorm;
  const ownershipStatus: OwnershipStatus =
    mskuMatches ? "CONFIRMED" : "ORDER_NOT_FOUND";
  const salesMsku = sale?.msku ?? "";

  if (ownershipStatus === "ORDER_NOT_FOUND") {
    return {
      orderId: agg.orderId || "—",
      returnFnsku: agg.fnsku || "—",
      lpn: agg.lpn || "",
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      sellableQty, unsellableQty,
      returnEvents: agg.returnEvents,
      dispositions: Array.from(agg.dispositions).join(", "),
      reasons: Array.from(agg.reasons).join(", "),
      isSellable, isGnrMsku: false, amazonStatus,
      ownershipStatus: "ORDER_NOT_FOUND",
      salesMsku: "", gnrStatus: "",
      inventoryStatus: "NOT_APPLICABLE",
      fbaSummaryConfirmedQty: 0, fbaSummaryExpectedQty: 0,
      reimbStatus: "NOT_APPLICABLE",
      reimbQty: 0, reimbCashQty: 0,
      reimbInventoryQty: 0, reimbAmount: 0,
      caseCount: caseMeta.count,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      adjQty: adj.qty,
      effReimbQty: caseMeta.approvedQty + adj.qty,
      effReimbAmount: caseMeta.approvedAmount,
      earliestReturn: fmtDate(agg.earliestReturn),
      latestReturn:   fmtDate(agg.latestReturn),
      daysSinceReturn, isWithinWindow,
      finalStatus: "INVESTIGATE",
    };
  }

  // ── SELLABLE branch: FbaSummary → GNR fallback ────────────────────────
  if (isSellable) {
    const fbaSummary = fbaSummaryMap.get(mskuNorm);
    const fbaSummaryConfirmedQty = fbaSummary?.confirmedQty ?? 0;
    const fbaSummaryExpectedQty  =
      mskuSellableTotals.get(mskuNorm) ?? sellableQty;

    let inventoryStatus: InventoryStatus;
    let finalStatus: FinalStatus;
    const gnrStatus = "";

    if (!fbaSummary) {
      if (daysSinceReturn <= SUMMARY_TOLERANCE_DAYS) {
        inventoryStatus = "PENDING_SUMMARY";
        finalStatus = "PENDING";
      } else {
        // No FbaSummary at all — check GNR bridge
        const gnrFallback = fnskuNorm
          ? gnrBridge.byUsedFnsku.get(fnskuNorm)
          : undefined;
        if (gnrFallback) {
          return gnrRow(
            agg, sellableQty, unsellableQty, isSellable,
            gnrFallback, caseMeta, adj, daysSinceReturn, isWithinWindow,
            agg.lpn || "",
            fbaSummaryConfirmedQty, fbaSummaryExpectedQty,
          );
        }
        inventoryStatus = "NOT_IN_INVENTORY";
        finalStatus = caseMeta.count > 0 ? "PENDING" : "CASE_NEEDED";
      }
    } else {
      const daysBetweenReturnAndSummary =
        fbaSummary.latestSummaryDate
          ? daysBetween(agg.latestReturn, fbaSummary.latestSummaryDate)
          : daysSinceReturn;

      if (daysBetweenReturnAndSummary < SUMMARY_TOLERANCE_DAYS) {
        inventoryStatus = "PENDING_SUMMARY";
        finalStatus = "PENDING";
      } else if (fbaSummaryConfirmedQty >= fbaSummaryExpectedQty) {
        inventoryStatus = "IN_INVENTORY";
        finalStatus = "RESOLVED";
      } else {
        // Gap found — check GNR bridge before CASE_NEEDED
        const gnrFallback = fnskuNorm
          ? gnrBridge.byUsedFnsku.get(fnskuNorm)
          : undefined;
        if (gnrFallback) {
          return gnrRow(
            agg, sellableQty, unsellableQty, isSellable,
            gnrFallback, caseMeta, adj, daysSinceReturn, isWithinWindow,
            agg.lpn || "",
            fbaSummaryConfirmedQty, fbaSummaryExpectedQty,
          );
        }
        inventoryStatus = "NOT_IN_INVENTORY";
        finalStatus = caseMeta.count > 0 ? "PENDING" : "CASE_NEEDED";
      }
    }

    return {
      orderId: agg.orderId || "—",
      returnFnsku: agg.fnsku || "—",
      lpn: agg.lpn || "",
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      sellableQty, unsellableQty,
      returnEvents: agg.returnEvents,
      dispositions: Array.from(agg.dispositions).join(", "),
      reasons: Array.from(agg.reasons).join(", "),
      isSellable, isGnrMsku: false, amazonStatus,
      ownershipStatus, salesMsku, gnrStatus,
      inventoryStatus,
      fbaSummaryConfirmedQty, fbaSummaryExpectedQty,
      reimbStatus: "NOT_APPLICABLE",
      reimbQty: 0, reimbCashQty: 0,
      reimbInventoryQty: 0, reimbAmount: 0,
      caseCount: caseMeta.count,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      adjQty: adj.qty,
      effReimbQty: caseMeta.approvedQty + adj.qty,
      effReimbAmount: caseMeta.approvedAmount,
      earliestReturn: fmtDate(agg.earliestReturn),
      latestReturn:   fmtDate(agg.latestReturn),
      daysSinceReturn, isWithinWindow,
      finalStatus,
    };
  }

  // ── DAMAGED / DEFECTIVE branch: check reimbursement ──────────────────
  const reimb =
    reimbMaps.byOrderMsku.get(orderMskuKey(agg.orderId, agg.msku)) ??
    reimbMaps.byMsku.get(agg.msku) ??
    EMPTY_REIMB;

  let reimbStatus: ReimbStatus;
  let finalStatus: FinalStatus;

  if (reimb.qty > 0) {
    reimbStatus = reimb.qtyCash > 0
      ? "REIMBURSED_CASH" : "REIMBURSED_INVENTORY";
    finalStatus = "RESOLVED";
  } else {
    // Check LPN — did Amazon transfer this damaged item to GNR?
    const lpnGnrMatch = agg.lpn
      ? input.gnrByLpnMap.get(norm(agg.lpn))
      : undefined;

    if (lpnGnrMatch) {
      // Confirmed transferred to GNR — no reimbursement expected.
      // Financial reconciliation moves to GNR Recon module.
      reimbStatus = "NOT_APPLICABLE";
      finalStatus = "TRANSFERRED_TO_GNR";
    } else if (caseMeta.count > 0 || isWithinWindow) {
      reimbStatus = "NOT_REIMBURSED";
      finalStatus = "PENDING";
    } else {
      reimbStatus = "NOT_REIMBURSED";
      finalStatus = "CASE_NEEDED";
    }
  }

  return {
    orderId: agg.orderId || "—",
    returnFnsku: agg.fnsku || "—",
    lpn: agg.lpn || "",
    msku: agg.msku || "—",
    asin: agg.asin || "—",
    title: agg.title || "—",
    totalReturned: agg.totalReturned,
    sellableQty, unsellableQty,
    returnEvents: agg.returnEvents,
    dispositions: Array.from(agg.dispositions).join(", "),
    reasons: Array.from(agg.reasons).join(", "),
    isSellable, isGnrMsku: false, amazonStatus,
    ownershipStatus, salesMsku, gnrStatus: "",
    inventoryStatus: "NOT_APPLICABLE",
    fbaSummaryConfirmedQty: 0, fbaSummaryExpectedQty: 0,
    reimbStatus,
    reimbQty: reimb.qty, reimbCashQty: reimb.qtyCash,
    reimbInventoryQty: reimb.qtyInventory, reimbAmount: reimb.amount,
    caseCount: caseMeta.count,
    caseReimbQty: caseMeta.approvedQty,
    caseReimbAmount: caseMeta.approvedAmount,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    adjQty: adj.qty,
    effReimbQty: reimb.qty + caseMeta.approvedQty + adj.qty,
    effReimbAmount: reimb.amount + caseMeta.approvedAmount,
    earliestReturn: fmtDate(agg.earliestReturn),
    latestReturn:   fmtDate(agg.latestReturn),
    daysSinceReturn, isWithinWindow,
    finalStatus,
  };
}
