import {
  isGnrMsku, lookupFbaSummaryQty, norm, orderFnskuKey,
  orderMskuKey, trimStr,
} from "./matching";
import type {
  AdjMeta, CaseMeta, FbaSummaryMeta, FinalStatus,
  GnrBridgeMeta, InventoryStatus, OwnershipStatus,
  ReimbDetail, ReimbMeta, ReimbOrderMskuMeta, ReimbStatus,
  ReturnsReconRow, SalesMeta,
} from "./types";

const PROCESSING_WINDOW_DAYS = 60;
const SUMMARY_TOLERANCE_DAYS = 3;

const EMPTY_REIMB: ReimbMeta = {
  qty: 0, qtyCash: 0, qtyInventory: 0,
  amount: 0, reimbType: "NONE",
};
const EMPTY_CASE: CaseMeta = {
  count: 0, claimedQty: 0, approvedQty: 0,
  approvedAmount: 0, caseIds: [], topStatus: "No Case", remarks: [],
};
const EMPTY_ADJ: AdjMeta = { qty: 0, count: 0, reasons: [] };

function noSummaryStatus(
  daysSinceReturn: number,
  caseMeta: { count: number },
): "CASE_NEEDED" | "PENDING" {
  if (daysSinceReturn <= SUMMARY_TOLERANCE_DAYS) return "PENDING";
  return caseMeta.count > 0 ? "PENDING" : "CASE_NEEDED";
}

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
  // Primary key
  orderId: string;
  msku: string;

  // Fixed per row (FNSKU is always one per orderId+msku)
  fnsku: string;
  asin: string;
  title: string;

  // Primary + all collected (for tooltip)
  lpn: string;               // primary LPN (first non-null)
  lpnAll: string[];          // all LPNs — for tooltip and GNR LPN check

  fc: string;                // primary fulfillment center
  disposition: string;       // primary disposition (most common)
  // Detailed disposition for the primary disposition. FBA Summary keys on the
  // detailed form (CUSTOMER_DAMAGED / CARRIER_DAMAGED), while the return report's
  // primary `disposition` is the coarse form (CUSTOMER / CARRIER). Used for the
  // FbaSummary inventory lookup so damaged returns match.
  detailedDisposition: string;
  dispositionAll: string[];  // all unique dispositions — for tooltip

  // Aggregated
  totalReturned: number;
  returnEvents: number;
  // Full disposition set — retained for reconciliation logic
  // (classifyDispositions / sellable detection in formula + asin-formula).
  dispositions: Set<string>;
  reasons: Set<string>;
  amazonStatus: string;

  // Dates
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
    detailedDisposition?: string | null;
    reason: string | null;
    status: string | null;
    returnDate: Date | null;
    licensePlateNumber: string | null;
    fulfillmentCenterId: string | null;
  }[],
): ReturnAggregate[] {
  const map = new Map<string, ReturnAggregate>();
  // Track disposition counts for finding primary (most common)
  const dispositionCounts = new Map<string, Map<string, number>>();
  // Track the detailed disposition for each coarse disposition (1:1 in the data,
  // e.g. CUSTOMER → CUSTOMER_DAMAGED) so the primary's detailed form can be set.
  const dispositionDetailed = new Map<string, Map<string, string>>();

  for (const r of rows) {
    const oid = trimStr(r.orderId);
    const mk  = trimStr(r.msku);
    if (!oid && !mk) continue;

    // Key: orderId + msku (not fnsku)
    const key = `${oid}|${mk}`;

    const p = map.get(key) ?? {
      orderId: oid,
      msku:    mk,
      fnsku:   trimStr(r.fnsku),
      asin:    trimStr(r.asin),
      title:   trimStr(r.title),
      lpn:          trimStr(r.licensePlateNumber),
      lpnAll:       [] as string[],
      fc:           trimStr(r.fulfillmentCenterId),
      disposition:  trimStr(r.disposition),
      detailedDisposition: trimStr(r.detailedDisposition),
      dispositionAll: [] as string[],
      totalReturned: 0,
      returnEvents:  0,
      dispositions:  new Set<string>(),
      reasons:       new Set<string>(),
      amazonStatus:  trimStr(r.status),
      earliestReturn: null,
      latestReturn:   null,
    };

    p.totalReturned += r.quantity || 0;
    p.returnEvents++;

    // Fill in missing fixed fields from later rows
    if (!p.fnsku && r.fnsku) p.fnsku = trimStr(r.fnsku);
    if (!p.asin  && r.asin)  p.asin  = trimStr(r.asin);
    if (!p.title && r.title) p.title = trimStr(r.title);
    if (!p.fc    && r.fulfillmentCenterId)
      p.fc = trimStr(r.fulfillmentCenterId);
    if (!p.amazonStatus && r.status)
      p.amazonStatus = trimStr(r.status);

    // Collect all LPNs (deduplicated, primary = first)
    const lpnVal = trimStr(r.licensePlateNumber);
    if (lpnVal && !p.lpnAll.includes(lpnVal)) {
      p.lpnAll.push(lpnVal);
      if (!p.lpn) p.lpn = lpnVal;
    }

    // Full disposition set — drives sellable classification downstream
    if (r.disposition) p.dispositions.add(r.disposition);

    // Track disposition counts for primary selection
    if (r.disposition) {
      const dispKey = trimStr(r.disposition);
      if (!dispositionCounts.has(key))
        dispositionCounts.set(key, new Map());
      const counts = dispositionCounts.get(key)!;
      counts.set(dispKey, (counts.get(dispKey) ?? 0) + 1);
      // Remember the detailed disposition for this coarse disposition.
      const detailed = trimStr(r.detailedDisposition);
      if (detailed) {
        if (!dispositionDetailed.has(key))
          dispositionDetailed.set(key, new Map());
        dispositionDetailed.get(key)!.set(dispKey, detailed);
      }
    }

    // Reasons
    if (r.reason) p.reasons.add(trimStr(r.reason));

    // Dates
    if (r.returnDate) {
      if (!p.earliestReturn || r.returnDate < p.earliestReturn)
        p.earliestReturn = r.returnDate;
      if (!p.latestReturn || r.returnDate > p.latestReturn)
        p.latestReturn = r.returnDate;
    }

    map.set(key, p);
  }

  // Post-process: set primary disposition (most common) and dispositionAll
  for (const [key, agg] of map.entries()) {
    const counts = dispositionCounts.get(key);
    if (counts && counts.size > 0) {
      // Primary = most common disposition
      let maxCount = 0;
      let primary  = "";
      for (const [disp, count] of counts.entries()) {
        if (count > maxCount) { maxCount = count; primary = disp; }
      }
      agg.disposition    = primary;
      agg.detailedDisposition =
        dispositionDetailed.get(key)?.get(primary) || agg.detailedDisposition;
      agg.dispositionAll = Array.from(counts.keys());
    }
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
  reimbOrderMskuQty = 0,
  reimbNetAmount = 0,
  reimbDetails: ReimbDetail[] = [],
  fbaSummaryConfirmedQty = 0,
  fbaSummaryExpectedQty  = 0,
  gnrLpnQty = 0,
  inventoryQty = 0,
): ReturnsReconRow {
  const finalStatus: FinalStatus = gnrMatch
    ? "GNR_TRACKING" : "UNKNOWN_GNR_CASE";
  const ownershipStatus: OwnershipStatus = gnrMatch
    ? "GNR_TRACKING" : "UNKNOWN_GNR";
  return {
    orderId: agg.orderId || "—",
    returnFnsku: agg.fnsku || "—",
    lpn: lpn || agg.lpn || "",
    lpnAll: agg.lpnAll,
    fc: agg.fc || "",
    dispositionAll: agg.dispositionAll,
    msku: agg.msku || "—",
    asin: agg.asin || "—",
    title: agg.title || "—",
    totalReturned: agg.totalReturned,
    // GNR MSKUs that returned SELLABLE can still appear in FbaSummary
    // customerReturns — pass the real matched qty through (0 when no match).
    inventoryQty,
    reimbOrderMskuQty,
    reimbNetAmount,
    reimbDetails,
    gnrLpnQty,
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
    caseClaimedQty: caseMeta.claimedQty,
    caseReimbQty: caseMeta.approvedQty,
    caseReimbAmount: caseMeta.approvedAmount,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    caseRemarks: caseMeta.remarks.join(" | "),
    adjQty: adj.qty,
    adjReasons: adj.reasons.join(", "),
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
  gnrByLpnQtyMap: Map<string, number>;
  fbaSummaryMap: Map<string, FbaSummaryMeta>;
  fbaSummaryDailyMap: Map<string, number>;
  reimbOrderMskuMap: Map<string, ReimbOrderMskuMeta>;
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

  // ── Inventory confirmation via FbaSummary daily match ─────────────────────
  // Match: MSKU + primary disposition + returnDate (try -1, 0, +1)
  // Disposition must match — CUSTOMER_DAMAGED returns appear in
  // CUSTOMER_DAMAGED FbaSummary rows, not SELLABLE rows.
  const inventoryQty = lookupFbaSummaryQty(
    agg.msku,
    // FBA Summary keys on the detailed disposition (CUSTOMER_DAMAGED), not the
    // return report's coarse primary (CUSTOMER). Fall back to the coarse form.
    agg.detailedDisposition || agg.disposition,
    agg.latestReturn,
    input.fbaSummaryDailyMap,
  );

  // ── Reimbursement via exact orderId + MSKU match ──────────────────────────
  // No byMsku fallback — reflects reimbursements tied to THIS order. ALL
  // reasons, qty = qtyCash + qtyInventory. `details` feeds the hover tooltip.
  // Distinct from the reason-filtered reimbMaps used by reconciliation status.
  const reimbOrderMsku =
    input.reimbOrderMskuMap.get(orderMskuKey(agg.orderId, agg.msku));
  const reimbOrderMskuQty = reimbOrderMsku?.qty ?? 0;
  const reimbNetAmount = reimbOrderMsku?.netAmount ?? 0;
  const reimbDetails = reimbOrderMsku?.details ?? [];

  // ── GNR qty via LPN match ─────────────────────────────────────────────────
  // Sum GnrReport.quantity across all LPNs collected for this order+msku.
  const gnrLpnQty = agg.lpnAll.reduce(
    (sum, lpn) => sum + (input.gnrByLpnQtyMap.get(norm(lpn)) ?? 0),
    0,
  );

  const daysSinceReturn = daysBetween(agg.latestReturn, now);
  const isWithinWindow  =
    daysSinceReturn >= 0 && daysSinceReturn < PROCESSING_WINDOW_DAYS;

  // Precise order-scoped case match first; MSKU fallback for legacy cases.
  const caseMeta =
    caseMap.get(orderMskuKey(agg.orderId, agg.msku)) ??
    caseMap.get(agg.msku) ??
    EMPTY_CASE;
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
      reimbOrderMskuQty,
      reimbNetAmount,
      reimbDetails,
      0, 0,
      gnrLpnQty,
      inventoryQty,
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
      lpnAll: agg.lpnAll,
      fc: agg.fc || "",
      dispositionAll: agg.dispositionAll,
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      inventoryQty,
      reimbOrderMskuQty,
      reimbNetAmount,
      reimbDetails,
      gnrLpnQty,
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
      caseClaimedQty: caseMeta.claimedQty,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      caseRemarks: caseMeta.remarks.join(" | "),
      adjQty: adj.qty,
      adjReasons: adj.reasons.join(", "),
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
      lpnAll: agg.lpnAll,
      fc: agg.fc || "",
      dispositionAll: agg.dispositionAll,
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      inventoryQty,
      reimbOrderMskuQty,
      reimbNetAmount,
      reimbDetails,
      gnrLpnQty,
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
      caseClaimedQty: caseMeta.claimedQty,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      caseRemarks: caseMeta.remarks.join(" | "),
      adjQty: adj.qty,
      adjReasons: adj.reasons.join(", "),
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
            reimbOrderMskuQty,
            reimbNetAmount,
            reimbDetails,
            fbaSummaryConfirmedQty, fbaSummaryExpectedQty,
            gnrLpnQty,
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
        finalStatus = noSummaryStatus(daysSinceReturn, caseMeta);
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
            reimbOrderMskuQty,
            reimbNetAmount,
            reimbDetails,
            fbaSummaryConfirmedQty, fbaSummaryExpectedQty,
            gnrLpnQty,
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
      lpnAll: agg.lpnAll,
      fc: agg.fc || "",
      dispositionAll: agg.dispositionAll,
      msku: agg.msku || "—",
      asin: agg.asin || "—",
      title: agg.title || "—",
      totalReturned: agg.totalReturned,
      inventoryQty,
      reimbOrderMskuQty,
      reimbNetAmount,
      reimbDetails,
      gnrLpnQty,
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
      caseClaimedQty: caseMeta.claimedQty,
      caseReimbQty: caseMeta.approvedQty,
      caseReimbAmount: caseMeta.approvedAmount,
      caseStatusTop: caseMeta.topStatus,
      caseIds: caseMeta.caseIds.join(", "),
      caseRemarks: caseMeta.remarks.join(" | "),
      adjQty: adj.qty,
      adjReasons: adj.reasons.join(", "),
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
    // Use ALL LPNs collected for this order+msku (any match wins).
    const lpnGnrMatch = agg.lpnAll.length > 0
      ? agg.lpnAll.reduce<GnrBridgeMeta | undefined>(
          (found, lpn) => found ?? input.gnrByLpnMap.get(norm(lpn)),
          undefined,
        )
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
    lpnAll: agg.lpnAll,
    fc: agg.fc || "",
    dispositionAll: agg.dispositionAll,
    msku: agg.msku || "—",
    asin: agg.asin || "—",
    title: agg.title || "—",
    totalReturned: agg.totalReturned,
    inventoryQty,
    reimbOrderMskuQty,
    reimbNetAmount,
    reimbDetails,
    gnrLpnQty,
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
    caseClaimedQty: caseMeta.claimedQty,
    caseReimbQty: caseMeta.approvedQty,
    caseReimbAmount: caseMeta.approvedAmount,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    caseRemarks: caseMeta.remarks.join(" | "),
    adjQty: adj.qty,
    adjReasons: adj.reasons.join(", "),
    effReimbQty: reimb.qty + caseMeta.approvedQty + adj.qty,
    effReimbAmount: reimb.amount + caseMeta.approvedAmount,
    earliestReturn: fmtDate(agg.earliestReturn),
    latestReturn:   fmtDate(agg.latestReturn),
    daysSinceReturn, isWithinWindow,
    finalStatus,
  };
}
