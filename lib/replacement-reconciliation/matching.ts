import type { AdjMeta, CaseMeta, ReimbMeta, ReturnMeta } from "./types";

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
  // Key: `${msku}|${orderId}` for rows where reason contains 'replace'
  const map = new Map<string, ReimbMeta>();
  for (const r of rows) {
    const reason = (r.reason ?? "").toLowerCase();
    if (!reason.includes("replace")) continue;
    const msku = trimStr(r.msku);
    const oid = trimStr(r.amazonOrderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      reasons: [],
      reimbIds: [],
      approvalDate: null,
    };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    if (r.reimbursementId && !prev.reimbIds.includes(r.reimbursementId)) prev.reimbIds.push(r.reimbursementId);
    if (r.approvalDate && (!prev.approvalDate || r.approvalDate > prev.approvalDate)) {
      prev.approvalDate = r.approvalDate;
    }
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
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
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
      approvedQty: 0,
      approvedAmount: 0,
      topStatus: "No Case",
      caseIds: [] as string[],
    };
    prev.count++;
    prev.approvedQty += r.unitsApproved || 0;
    prev.approvedAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
    if (r.referenceId && !prev.caseIds.includes(r.referenceId)) prev.caseIds.push(r.referenceId);
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
