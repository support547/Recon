import type { AdjAdjMeta, AdjCaseMeta, AdjReimbMeta } from "./types";

function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
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

export function buildAdjCaseMap(
  rows: {
    msku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
  }[],
): Map<string, AdjCaseMeta> {
  const map = new Map<string, AdjCaseMeta>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = map.get(k) ?? {
      count: 0,
      openCount: 0,
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
    if (statusKey !== "CLOSED" && statusKey !== "REJECTED") prev.openCount++;
    const rank = CASE_STATUS_PRI[statusKey] ?? 0;
    const currentRank = CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > currentRank) {
      prev.topStatus = CASE_STATUS_LABEL[statusKey] ?? "Pending";
    }
    map.set(k, prev);
  }
  return map;
}

export function buildAdjAdjMap(
  rows: { msku: string | null; qtyAdjusted: number; reason: string | null }[],
): Map<string, AdjAdjMeta> {
  const map = new Map<string, AdjAdjMeta>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = map.get(k) ?? { qty: 0, count: 0, reasons: [] as string[] };
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    map.set(k, prev);
  }
  return map;
}

export function buildAdjReimbMap(
  rows: {
    msku: string | null;
    quantity: number;
    amount: { toString(): string } | null;
    reason: string | null;
  }[],
): Map<string, AdjReimbMeta> {
  const map = new Map<string, AdjReimbMeta>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      count: 0,
      reasons: [] as string[],
    };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    prev.count++;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    map.set(k, prev);
  }
  return map;
}

export function buildAdjCaseMapByAsin(
  rows: {
    asin: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
  }[],
): Map<string, AdjCaseMeta> {
  const map = new Map<string, AdjCaseMeta>();
  for (const r of rows) {
    const k = trimStr(r.asin);
    if (!k) continue;
    const prev = map.get(k) ?? {
      count: 0,
      openCount: 0,
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
    if (statusKey !== "CLOSED" && statusKey !== "REJECTED") prev.openCount++;
    const rank = CASE_STATUS_PRI[statusKey] ?? 0;
    const currentRank = CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > currentRank) {
      prev.topStatus = CASE_STATUS_LABEL[statusKey] ?? "Pending";
    }
    map.set(k, prev);
  }
  return map;
}

export function buildAdjReimbMapByAsin(
  rows: {
    asin: string | null;
    quantity: number;
    amount: { toString(): string } | null;
    reason: string | null;
  }[],
): Map<string, AdjReimbMeta> {
  const map = new Map<string, AdjReimbMeta>();
  for (const r of rows) {
    const k = trimStr(r.asin);
    if (!k) continue;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      count: 0,
      reasons: [] as string[],
    };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    prev.count++;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    map.set(k, prev);
  }
  return map;
}

export function buildAdjReimbMapFromManualByAsin(
  rows: {
    asin: string | null;
    qtyAdjusted: number;
    amount: { toString(): string } | null;
    referenceId: string | null;
  }[],
): Map<string, AdjReimbMeta> {
  const map = new Map<string, AdjReimbMeta>();
  for (const r of rows) {
    const k = trimStr(r.asin);
    if (!k) continue;
    const prev = map.get(k) ?? {
      qty: 0,
      amount: 0,
      count: 0,
      reasons: [] as string[],
    };
    prev.qty += r.qtyAdjusted || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    prev.count++;
    if (r.referenceId && !prev.reasons.includes(r.referenceId)) prev.reasons.push(r.referenceId);
    map.set(k, prev);
  }
  return map;
}
