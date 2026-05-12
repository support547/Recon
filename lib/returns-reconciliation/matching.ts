import type { AdjMeta, CaseMeta, ReimbMeta, SalesFnskuMeta } from "./types";

export function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function orderFnskuKey(orderId: string, fnsku: string): string {
  return `${orderId.trim()}|${fnsku.trim()}`;
}

export function buildSalesFnskuMap(
  rows: { orderId: string | null; fnsku: string | null; msku: string | null }[],
): Map<string, SalesFnskuMeta> {
  const map = new Map<string, SalesFnskuMeta>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    if (!oid) continue;
    const prev = map.get(oid) ?? { orderExists: true, fnskuSet: new Set<string>(), msku: "" };
    const fn = trimStr(r.fnsku);
    if (fn) prev.fnskuSet.add(fn);
    if (!prev.msku && r.msku) prev.msku = trimStr(r.msku);
    map.set(oid, prev);
  }
  return map;
}

export function buildReimbMap(
  rows: { msku: string | null; reason: string | null; quantity: number; amount: { toString(): string } | null }[],
): Map<string, ReimbMeta> {
  const map = new Map<string, ReimbMeta>();
  for (const r of rows) {
    const reason = (r.reason ?? "").toLowerCase();
    if (!reason.includes("return")) continue;
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = map.get(k) ?? { qty: 0, amount: 0 };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
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
    const prev = map.get(k) ?? {
      count: 0,
      claimedQty: 0,
      approvedQty: 0,
      approvedAmount: 0,
      caseIds: [] as string[],
      topStatus: "No Case",
    };
    prev.count++;
    prev.claimedQty += r.unitsClaimed || 0;
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
  rows: { orderId: string | null; fnsku: string | null; qtyAdjusted: number; reason: string | null }[],
): Map<string, AdjMeta> {
  const map = new Map<string, AdjMeta>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    if (!oid) continue;
    const key = orderFnskuKey(oid, trimStr(r.fnsku));
    const prev = map.get(key) ?? { qty: 0, count: 0, reasons: [] as string[] };
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    map.set(key, prev);
  }
  return map;
}
