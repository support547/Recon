import type {
  AdjMeta, AsinReturnRow, CaseMeta, FbaSummaryMeta,
  GnrBridgeMeta, ReimbMeta, ReimbOrderMskuMeta,
  ReturnsReconRow, SalesMeta,
} from "./types";

export const trimStr = (s: string | null | undefined) => (s ?? "").trim();
export const norm = (s: string | null | undefined) =>
  trimStr(s).toLowerCase();
export const orderMskuKey = (o: string, m: string) =>
  `${o.trim()}|${m.trim()}`;
export const orderFnskuKey = (o: string, f: string) =>
  `${o.trim()}|${f.trim()}`;

export function isGnrMsku(sku: string | null | undefined): boolean {
  return trimStr(sku).toLowerCase().startsWith("amzn.gr.");
}

export function buildGnrBridgeMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    msku: string | null;
    usedFnsku: string | null;
    usedMsku: string | null;
    unitStatus: string | null;
  }[],
): {
  byUsedFnsku: Map<string, GnrBridgeMeta>;
  byOrderId: Map<string, GnrBridgeMeta>;
} {
  const byUsedFnsku = new Map<string, GnrBridgeMeta>();
  const byOrderId = new Map<string, GnrBridgeMeta>();
  for (const r of rows) {
    const usedFk = norm(r.usedFnsku);
    const oid = trimStr(r.orderId);
    if (!usedFk && !oid) continue;
    const meta: GnrBridgeMeta = {
      originalFnsku: trimStr(r.fnsku),
      originalMsku: trimStr(r.msku),
      usedFnsku: trimStr(r.usedFnsku),
      usedMsku: trimStr(r.usedMsku),
      unitStatus: trimStr(r.unitStatus),
      orderId: oid,
    };
    if (usedFk && !byUsedFnsku.has(usedFk))
      byUsedFnsku.set(usedFk, meta);
    if (oid && !byOrderId.has(oid))
      byOrderId.set(oid, meta);
  }
  return { byUsedFnsku, byOrderId };
}

export function buildSalesMap(
  rows: {
    orderId: string | null;
    msku: string | null;
    fnsku: string | null;
    asin: string | null;
  }[],
): Map<string, SalesMeta> {
  const map = new Map<string, SalesMeta>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    if (!oid || map.has(oid)) continue;
    map.set(oid, {
      msku: trimStr(r.msku),
      fnsku: trimStr(r.fnsku),
      asin: trimStr(r.asin),
    });
  }
  return map;
}

export function buildFbaSummaryMap(
  rows: {
    msku: string | null;
    customerReturns: number;
    summaryDate: Date | null;
  }[],
): Map<string, FbaSummaryMeta> {
  const map = new Map<string, FbaSummaryMeta>();
  for (const r of rows) {
    const mk = norm(r.msku);
    if (!mk) continue;
    const prev = map.get(mk) ??
      { confirmedQty: 0, latestSummaryDate: null };
    prev.confirmedQty += r.customerReturns || 0;
    if (r.summaryDate) {
      const d = new Date(r.summaryDate);
      if (!prev.latestSummaryDate || d > prev.latestSummaryDate)
        prev.latestSummaryDate = d;
    }
    map.set(mk, prev);
  }
  return map;
}

const RETURN_REASONS = new Set([
  "fbacustomerreturn","customerreturn","customer_return",
  "fba_customer_return_perishable_item","reversal_reimbursement",
  "cs_error_items_lost","compensated_clawback",
  "free_replacement_refund_items","return_reimbursement","fba_return",
]);

function isReturnRelated(reason: string | null): boolean {
  if (!reason) return false;
  const n = reason.toLowerCase().replace(/[_ ]/g, "");
  return RETURN_REASONS.has(n) || reason.toLowerCase().includes("return");
}

export function buildReimbMap(
  rows: {
    msku: string | null;
    reason: string | null;
    quantity: number;
    amount: { toString(): string } | null;
    qtyCash: number;
    qtyInventory: number;
    amazonOrderId: string | null;
  }[],
): {
  byOrderMsku: Map<string, ReimbMeta>;
  byMsku: Map<string, ReimbMeta>;
} {
  const byOrderMsku = new Map<string, ReimbMeta>();
  const byMsku = new Map<string, ReimbMeta>();
  function add(map: Map<string, ReimbMeta>, key: string,
    r: (typeof rows)[0]) {
    const p = map.get(key) ?? {
      qty: 0, qtyCash: 0, qtyInventory: 0,
      amount: 0, reimbType: "NONE" as const,
    };
    p.qty += r.quantity || 0;
    p.qtyCash += r.qtyCash || 0;
    p.qtyInventory += r.qtyInventory || 0;
    p.amount += r.amount ? Number(r.amount.toString()) : 0;
    p.reimbType =
      p.qtyCash > 0 && p.qtyInventory > 0 ? "BOTH"
      : p.qtyCash > 0 ? "CASH"
      : p.qtyInventory > 0 ? "INVENTORY"
      : "NONE";
    map.set(key, p);
  }
  for (const r of rows) {
    if (!isReturnRelated(r.reason)) continue;
    const msku = trimStr(r.msku);
    if (!msku) continue;
    const oid = trimStr(r.amazonOrderId);
    if (oid) add(byOrderMsku, orderMskuKey(oid, msku), r);
    add(byMsku, msku, r);
  }
  return { byOrderMsku, byMsku };
}

// ── Reimbursement map keyed by orderId + MSKU ─────────────────────────────
// For the By-MSKU "Reimb Qty" column + hover detail. NOT reason-filtered —
// counts ALL reimbursements tied to the order+MSKU.
//
// Qty = NET qtyCash (cash only; qtyInventory is Amazon moving units, not a
// cash reimbursement). Amount = NET signed amount.
//
// Reversals: Amazon claws back a prior reimbursement with a row whose
// originalReimbId points at the earlier reimbursementId and whose qtyCash /
// amount are negative. Reversal rows often have a BLANK order ID, so they
// can't key by order+MSKU directly — we bucket them into the ORIGINAL
// reimbursement's order+MSKU so the negative nets against it.
type ReimbInput = {
  msku: string | null;
  reason: string | null;
  amount: { toString(): string } | null;
  qtyCash: number;
  qtyInventory: number;
  amazonOrderId: string | null;
  reimbursementId: string | null;
  originalReimbId: string | null;
  approvalDate: Date | null;
  caseId: string | null;
};

export function buildReimbOrderMskuMap(
  rows: ReimbInput[],
): Map<string, ReimbOrderMskuMeta> {
  // Pass 1: index every reimbursement's order+MSKU key by reimbursementId,
  // so a reversal can find the original it claws back.
  const keyByReimbId = new Map<string, string>();
  for (const r of rows) {
    const rid  = trimStr(r.reimbursementId);
    const msku = trimStr(r.msku);
    const oid  = trimStr(r.amazonOrderId);
    if (rid && msku && oid) {
      keyByReimbId.set(rid, orderMskuKey(oid, msku));
    }
  }

  const map = new Map<string, ReimbOrderMskuMeta>();
  for (const r of rows) {
    const msku       = trimStr(r.msku);
    const oid        = trimStr(r.amazonOrderId);
    const origReimb  = trimStr(r.originalReimbId);
    const isReversal = !!origReimb;

    // Resolve the bucket key:
    //   1. own order ID (when present)
    //   2. else, for a reversal, the original reimbursement's key
    let key = oid && msku ? orderMskuKey(oid, msku) : "";
    if (!key && isReversal) {
      key = keyByReimbId.get(origReimb) ?? "";
    }
    if (!key) continue; // can't tie to any order+MSKU → skip

    const qtyCash = r.qtyCash || 0;       // signed; reversals negative
    const amount  = r.amount ? Number(r.amount.toString()) : 0;

    let dateStr = "";
    if (r.approvalDate) {
      try {
        dateStr = new Date(r.approvalDate).toISOString().split("T")[0];
      } catch {
        dateStr = "";
      }
    }

    const meta = map.get(key) ?? { qty: 0, netAmount: 0, details: [] };
    meta.qty       += qtyCash;
    meta.netAmount += amount;
    meta.details.push({
      date:    dateStr,
      reimbId: trimStr(r.reimbursementId),
      caseId:  trimStr(r.caseId),
      reason:  trimStr(r.reason),
      qty:     qtyCash,
      amount,
      isReversal,
    });
    map.set(key, meta);
  }
  return map;
}

const CASE_RANK: Record<string, number> = {
  RESOLVED: 5, IN_PROGRESS: 4, OPEN: 3, REJECTED: 2, CLOSED: 1,
};
const CASE_LABEL: Record<string, string> = {
  RESOLVED: "Resolved", IN_PROGRESS: "In Progress",
  OPEN: "Open", REJECTED: "Rejected", CLOSED: "Closed",
};

export function buildCaseMap(
  rows: {
    orderId?: string | null;
    fnsku?: string | null;
    msku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
    notes?: string | null;
  }[],
): Map<string, CaseMeta> {
  const map = new Map<string, CaseMeta>();
  // Index each case under both an order-scoped key (orderId+MSKU) and the bare
  // MSKU. The By-MSKU rows look up the precise order key so a case stays on the
  // exact row it was raised against; the ASIN tab (and legacy cases with no
  // orderId) fall back to the MSKU key.
  const accumulate = (key: string, r: (typeof rows)[number]) => {
    if (!key) return;
    const p = map.get(key) ?? {
      count: 0, claimedQty: 0, approvedQty: 0,
      approvedAmount: 0, caseIds: [] as string[], topStatus: "No Case",
      remarks: [] as string[],
    };
    p.count++;
    p.claimedQty += r.unitsClaimed || 0;
    p.approvedQty += r.unitsApproved || 0;
    p.approvedAmount += r.amountApproved
      ? Number(r.amountApproved.toString()) : 0;
    if (r.referenceId && !p.caseIds.includes(r.referenceId))
      p.caseIds.push(r.referenceId);
    const note = trimStr(r.notes ?? "");
    if (note && !p.remarks.includes(note)) p.remarks.push(note);
    const sk = (r.status ?? "").toUpperCase();
    const rank = CASE_RANK[sk] ?? 0;
    const cur =
      CASE_RANK[p.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > cur) p.topStatus = CASE_LABEL[sk] ?? "Pending";
    map.set(key, p);
  };
  for (const r of rows) {
    const mk = trimStr(r.msku);
    if (!mk) continue;
    const oid = trimStr(r.orderId ?? "");
    // Order-scoped cases index ONLY under orderId+MSKU so a case stays on the
    // exact order's row. Legacy cases with no orderId index under bare MSKU as a
    // fallback. Indexing an order-scoped case under bare MSKU too would bleed it
    // onto every other order sharing that MSKU.
    if (oid) accumulate(orderMskuKey(oid, mk), r);
    else accumulate(mk, r);
  }
  return map;
}

export function buildAdjMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    qtyAdjusted: number;
    reason: string | null;
  }[],
): Map<string, AdjMeta> {
  const map = new Map<string, AdjMeta>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    if (!oid) continue;
    const key = orderFnskuKey(oid, trimStr(r.fnsku));
    const p = map.get(key) ??
      { qty: 0, count: 0, reasons: [] as string[] };
    p.qty += r.qtyAdjusted || 0;
    p.count++;
    if (r.reason && !p.reasons.includes(r.reason))
      p.reasons.push(r.reason);
    map.set(key, p);
  }
  return map;
}

// ── GNR bridge map keyed by LPN ──────────────────────────────────────────
// Used to detect CUSTOMER_DAMAGED returns that were transferred to GNR.
// When CustomerReturn.licensePlateNumber matches GnrReport.lpn → TRANSFERRED_TO_GNR.
export function buildGnrLpnMap(
  rows: {
    lpn: string | null;
    orderId: string | null;
    fnsku: string | null;
    msku: string | null;
    usedFnsku: string | null;
    usedMsku: string | null;
    unitStatus: string | null;
  }[],
): Map<string, GnrBridgeMeta> {
  const map = new Map<string, GnrBridgeMeta>();
  for (const r of rows) {
    const lpnKey = norm(r.lpn);
    if (!lpnKey) continue;
    if (!map.has(lpnKey)) {
      map.set(lpnKey, {
        originalFnsku: trimStr(r.fnsku),
        originalMsku:  trimStr(r.msku),
        usedFnsku:     trimStr(r.usedFnsku),
        usedMsku:      trimStr(r.usedMsku),
        unitStatus:    trimStr(r.unitStatus),
        orderId:       trimStr(r.orderId),
      });
    }
  }
  return map;
}

// ── GNR quantity map keyed by LPN ────────────────────────────────────────
// Sums GnrReport.quantity per LPN. Used to surface the GNR qty for a return
// whose LPN matches a GNR report row.
export function buildGnrLpnQtyMap(
  rows: { lpn: string | null; quantity: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const lpnKey = norm(r.lpn);
    if (!lpnKey) continue;
    map.set(lpnKey, (map.get(lpnKey) ?? 0) + (r.quantity || 0));
  }
  return map;
}

// ── FbaSummary map keyed by ASIN ─────────────────────────────────────────
// Sums customerReturns (CUST RETURNS column) across all FNSKU rows
// for the same ASIN. Used for By ASIN view inventory column.
export function buildFbaSummaryByAsinMap(
  rows: {
    asin: string | null;
    customerReturns: number;
  }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const ak = norm(r.asin);
    if (!ak) continue;
    map.set(ak, (map.get(ak) ?? 0) + (r.customerReturns || 0));
  }
  return map;
}

// ── Build ASIN-level return summary from existing row data ─────────────────
export function buildAsinReturnSummary(
  rows: ReturnsReconRow[],
  fbaSummaryByAsin: Map<string, number>,
): AsinReturnRow[] {
  const map = new Map<string, AsinReturnRow>();

  for (const row of rows) {
    const ak = norm(row.asin);
    if (!ak) continue;

    const prev = map.get(ak) ?? {
      asin: row.asin,
      title: row.title,
      returnedQty: 0,
      inventoryQty: 0,
      inventoryFbaQty: fbaSummaryByAsin.get(ak) ?? 0,
      gnrQty: 0,
      transferredGnrQty: 0,
      reimbursedQty: 0,
      adjustedQty: 0,
      pendingQty: 0,
      asinStatus: "RESOLVED" as const,
      rows: [] as ReturnsReconRow[],
    };

    prev.returnedQty    += row.totalReturned;
    prev.adjustedQty    += row.adjQty;
    prev.rows.push(row);

    // GNR (regular + LPN transfer) is part of inventory — units back in FBA.
    switch (row.finalStatus) {
      case "GNR_TRACKING":
        prev.gnrQty += row.totalReturned; break;
      case "TRANSFERRED_TO_GNR":
        prev.transferredGnrQty += row.totalReturned; break;
    }

    if (
      row.reimbStatus === "REIMBURSED_CASH" ||
      row.reimbStatus === "REIMBURSED_INVENTORY"
    ) {
      prev.reimbursedQty += row.reimbQty + row.caseReimbQty;
    }

    map.set(ak, prev);
  }

  // Reconcile each ASIN against returnedQty.
  //   inventory = FbaSummary + GNR + Transfer GNR
  //   resolved when inventory (+ reimbursed (+ adjusted)) covers returned
  //   else the shortfall lands in pending → status CASE_NEEDED (take action)
  for (const summary of map.values()) {
    summary.inventoryQty =
      summary.inventoryFbaQty + summary.gnrQty + summary.transferredGnrQty;

    const accounted =
      summary.inventoryQty + summary.reimbursedQty + summary.adjustedQty;
    summary.pendingQty = Math.max(0, summary.returnedQty - accounted);
    summary.asinStatus = summary.pendingQty > 0 ? "CASE_NEEDED" : "RESOLVED";
  }

  // Sort: CASE_NEEDED first, then RESOLVED
  const ORDER = {
    CASE_NEEDED: 0, INVESTIGATE: 1, PENDING: 2, RESOLVED: 3,
  };
  return Array.from(map.values()).sort(
    (a, b) => ORDER[a.asinStatus] - ORDER[b.asinStatus],
  );
}

// ── FbaSummary daily lookup map ───────────────────────────────────────────
// Key: "msku|disposition|YYYY-MM-DD"
// Value: customerReturns qty for that MSKU + disposition on that date.
// FbaSummary is daily — one row per FNSKU/MSKU + disposition per day.
// Disposition must match the return report's detailed-disposition.
export function buildFbaSummaryDailyMap(
  rows: {
    msku: string | null;
    disposition: string | null;
    customerReturns: number;
    summaryDate: Date | null;
  }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const mk   = norm(r.msku);
    const disp = norm(r.disposition ?? "");
    if (!mk || !r.summaryDate) continue;
    try {
      const dateStr = new Date(r.summaryDate)
        .toISOString()
        .split("T")[0]; // → YYYY-MM-DD
      const key = `${mk}|${disp}|${dateStr}`;
      map.set(key, (map.get(key) ?? 0) + (r.customerReturns || 0));
    } catch {
      // skip invalid dates
    }
  }
  return map;
}

// ── Look up inventory qty for one return event ────────────────────────────
// Tries returnDate-1 (most likely), then returnDate, then returnDate+1.
// Disposition must match (SELLABLE return → SELLABLE FbaSummary row).
export function lookupFbaSummaryQty(
  msku: string,
  disposition: string,
  returnDate: Date | null,
  dailyMap: Map<string, number>,
): number {
  if (!returnDate) return 0;
  const mk   = norm(msku);
  const disp = norm(disposition);

  for (const offsetDays of [-1, 0, 1]) {
    const d = new Date(returnDate);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    const dateStr = d.toISOString().split("T")[0];
    const qty = dailyMap.get(`${mk}|${disp}|${dateStr}`) ?? 0;
    if (qty > 0) return qty;
  }
  return 0;
}
