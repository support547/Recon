import type { FcAdjMeta, FcCaseMeta } from "./types";

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

export function buildFcCaseMap(
  rows: {
    msku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
  }[],
): Map<string, FcCaseMeta> {
  const map = new Map<string, FcCaseMeta>();
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

export function buildFcAdjMap(
  rows: { msku: string | null; qtyAdjusted: number; reason: string | null }[],
): Map<string, FcAdjMeta> {
  const map = new Map<string, FcAdjMeta>();
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
