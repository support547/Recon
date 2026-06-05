import type {
  AdjMeta, CaseMeta, FbaSummaryMeta,
  GnrBridgeMeta, ReimbMeta, SalesMeta,
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

const CASE_RANK: Record<string, number> = {
  RESOLVED: 5, IN_PROGRESS: 4, OPEN: 3, REJECTED: 2, CLOSED: 1,
};
const CASE_LABEL: Record<string, string> = {
  RESOLVED: "Resolved", IN_PROGRESS: "In Progress",
  OPEN: "Open", REJECTED: "Rejected", CLOSED: "Closed",
};

export function buildCaseMap(
  rows: {
    msku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
  }[],
): Map<string, CaseMeta> {
  const map = new Map<string, CaseMeta>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    const p = map.get(k) ?? {
      count: 0, claimedQty: 0, approvedQty: 0,
      approvedAmount: 0, caseIds: [] as string[], topStatus: "No Case",
    };
    p.count++;
    p.claimedQty += r.unitsClaimed || 0;
    p.approvedQty += r.unitsApproved || 0;
    p.approvedAmount += r.amountApproved
      ? Number(r.amountApproved.toString()) : 0;
    if (r.referenceId && !p.caseIds.includes(r.referenceId))
      p.caseIds.push(r.referenceId);
    const sk = (r.status ?? "").toUpperCase();
    const rank = CASE_RANK[sk] ?? 0;
    const cur =
      CASE_RANK[p.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > cur) p.topStatus = CASE_LABEL[sk] ?? "Pending";
    map.set(k, p);
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
