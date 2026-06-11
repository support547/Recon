import type { AdjMeta, CaseMeta, RefundMeta, ReimbMeta, ReturnMeta } from "./types";

export function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function mskuOrderKey(msku: string, orderId: string): string {
  return `${msku.trim()}|${orderId.trim()}`;
}

/** Returns map: msku → array of {orderId, qty, ...}. Then per row, match by msku + (replOrderId OR origOrderId). */
export function buildReturnsByMskuOrder(
  rows: {
    msku: string | null;
    orderId: string | null;
    quantity: number;
    disposition: string | null;
    reason: string | null;
    returnDate: Date | null;
  }[],
): Map<string, ReturnMeta> {
  // Key: `${msku}|${orderId}`
  const map = new Map<string, ReturnMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.orderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? {
      qty: 0,
      matchedOrders: [],
      matchedVia: [],
      dispositions: [],
      reasons: [],
      earliestDate: null,
    };
    prev.qty += r.quantity || 0;
    if (!prev.matchedOrders.includes(oid)) prev.matchedOrders.push(oid);
    if (r.disposition && !prev.dispositions.includes(r.disposition)) prev.dispositions.push(r.disposition);
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    if (r.returnDate && (!prev.earliestDate || r.returnDate < prev.earliestDate)) {
      prev.earliestDate = r.returnDate;
    }
    map.set(k, prev);
  }
  return map;
}

/** RESCUE map keyed `${asin}|${orderId}`. Used only when the msku-keyed return
 *  lookup found nothing — covers the case where the original order's SKU suffix
 *  differs from the replacement SKU (same ASIN). Same aggregation as
 *  buildReturnsByMskuOrder. */
export function buildReturnsByAsinOrder(
  rows: {
    asin: string | null;
    orderId: string | null;
    quantity: number;
    disposition: string | null;
    reason: string | null;
    returnDate: Date | null;
  }[],
): Map<string, ReturnMeta> {
  const map = new Map<string, ReturnMeta>();
  for (const r of rows) {
    const asin = trimStr(r.asin);
    const oid = trimStr(r.orderId);
    if (!asin || !oid) continue;
    const k = `${asin}|${oid}`;
    const prev = map.get(k) ?? {
      qty: 0,
      matchedOrders: [],
      matchedVia: [],
      dispositions: [],
      reasons: [],
      earliestDate: null,
    };
    prev.qty += r.quantity || 0;
    if (!prev.matchedOrders.includes(oid)) prev.matchedOrders.push(oid);
    if (r.disposition && !prev.dispositions.includes(r.disposition)) prev.dispositions.push(r.disposition);
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    if (r.returnDate && (!prev.earliestDate || r.returnDate < prev.earliestDate)) {
      prev.earliestDate = r.returnDate;
    }
    map.set(k, prev);
  }
  return map;
}

export function buildReplaceReimbsByMskuOrder(
  rows: {
    msku: string | null;
    amazonOrderId: string | null;
    reason: string | null;
    quantity: number;
    amount: { toString(): string } | null;
    reimbursementId: string | null;
    approvalDate: Date | null;
  }[],
): Map<string, ReimbMeta> {
  // Match by `${msku}|${orderId}` against the replacement's repl/orig order —
  // the order-id join is the strong signal. We deliberately do NOT gate on the
  // reimbursement reason: real Amazon reason codes for replacement payouts
  // (CustomerServiceIssue, CustomerReturn, etc.) never contain the literal
  // "replace", so a reason filter excludes 100% of genuine rows. The reason is
  // still collected into `reasons` below for display.
  const map = new Map<string, ReimbMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.amazonOrderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      reasons: [],
      reimbIds: [],
      orderIds: [],
      approvalDate: null,
    };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    if (r.reimbursementId && !prev.reimbIds.includes(r.reimbursementId)) prev.reimbIds.push(r.reimbursementId);
    if (oid && !prev.orderIds.includes(oid)) prev.orderIds.push(oid);
    if (r.approvalDate && (!prev.approvalDate || r.approvalDate > prev.approvalDate)) {
      prev.approvalDate = r.approvalDate;
    }
    map.set(k, prev);
  }
  return map;
}

/** RESCUE map keyed `${asin}|${orderId}` for reimbursements. Used only when the
 *  msku-keyed reimb lookup found nothing. Same aggregation as
 *  buildReplaceReimbsByMskuOrder. */
export function buildReimbsByAsinOrder(
  rows: {
    asin: string | null;
    amazonOrderId: string | null;
    reason: string | null;
    quantity: number;
    amount: { toString(): string } | null;
    reimbursementId: string | null;
    approvalDate: Date | null;
  }[],
): Map<string, ReimbMeta> {
  const map = new Map<string, ReimbMeta>();
  for (const r of rows) {
    const asin = trimStr(r.asin);
    const oid = trimStr(r.amazonOrderId);
    if (!asin || !oid) continue;
    const k = `${asin}|${oid}`;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      reasons: [],
      reimbIds: [],
      orderIds: [],
      approvalDate: null,
    };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    if (r.reimbursementId && !prev.reimbIds.includes(r.reimbursementId)) prev.reimbIds.push(r.reimbursementId);
    if (!prev.orderIds.includes(oid)) prev.orderIds.push(oid);
    if (r.approvalDate && (!prev.approvalDate || r.approvalDate > prev.approvalDate)) {
      prev.approvalDate = r.approvalDate;
    }
    map.set(k, prev);
  }
  return map;
}

/** Strip time/timezone off a PaymentRepository posted datetime, keeping the date
 *  part only. Handles "Apr 11, 2026 2:46:38 PM PDT" → "Apr 11, 2026" and
 *  ISO-ish "2026-04-11 ..." → "2026-04-11". Falls back to the raw string. */
function refundDateOnly(s: string): string {
  const v = s.trim();
  if (!v) return "";
  const mdy = v.match(/^[A-Za-z]{3,}\s+\d{1,2},\s*\d{4}/);
  if (mdy) return mdy[0].replace(/\s*,\s*/, ", ");
  return v.split(/[ T]/)[0];
}

/** Refund qty from PaymentRepository (caller pre-filters to lineType="Refund").
 *  Key `${msku}|${orderId}` where msku = repo `sku` column. Qty stored negative
 *  for refunds, so take absolute value. */
export function buildRefundsByMskuOrder(
  rows: {
    sku: string | null;
    orderId: string | null;
    quantity: number;
    total: { toString(): string } | null;
    settlementId: string | null;
    postedDatetime: string | null;
  }[],
): Map<string, RefundMeta> {
  const map = new Map<string, RefundMeta>();
  for (const r of rows) {
    const msku = trimStr(r.sku);
    const oid = trimStr(r.orderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? { qty: 0, lines: [] };
    const qty = Math.abs(r.quantity || 0);
    prev.qty += qty;
    prev.lines.push({
      orderId: oid,
      qty,
      amount: r.total ? Number(r.total.toString()) : 0,
      settlementId: trimStr(r.settlementId),
      date: refundDateOnly(trimStr(r.postedDatetime)),
    });
    map.set(k, prev);
  }
  return map;
}

const CASE_STATUS_PRI: Record<string, number> = {
  RESOLVED: 5,
  IN_PROGRESS: 4,
  OPEN: 3,
  REJECTED: 2,
  CLOSED: 1,
};

const CASE_STATUS_LABEL: Record<string, string> = {
  RESOLVED: "Resolved",
  IN_PROGRESS: "In Progress",
  OPEN: "Open",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export function buildCaseMap(
  rows: {
    msku: string | null;
    orderId: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
    notes: string | null;
  }[],
): Map<string, CaseMeta> {
  const map = new Map<string, CaseMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.orderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? {
      count: 0,
      claimedQty: 0,
      approvedQty: 0,
      approvedAmount: 0,
      topStatus: "No Case",
      caseIds: [] as string[],
      remarks: [] as string[],
    };
    prev.count++;
    prev.claimedQty += r.unitsClaimed || 0;
    prev.approvedQty += r.unitsApproved || 0;
    prev.approvedAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
    if (r.referenceId && !prev.caseIds.includes(r.referenceId)) prev.caseIds.push(r.referenceId);
    const note = trimStr(r.notes);
    if (note && !prev.remarks.includes(note)) prev.remarks.push(note);
    const statusKey = (r.status ?? "").toUpperCase();
    const rank = CASE_STATUS_PRI[statusKey] ?? 0;
    const currentRank = CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > currentRank) {
      prev.topStatus = CASE_STATUS_LABEL[statusKey] ?? "Pending";
    }
    map.set(k, prev);
  }
  return map;
}

export function buildAdjMap(
  rows: { msku: string | null; orderId: string | null; qtyAdjusted: number }[],
): Map<string, AdjMeta> {
  const map = new Map<string, AdjMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.orderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? { qty: 0, count: 0 };
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    map.set(k, prev);
  }
  return map;
}
