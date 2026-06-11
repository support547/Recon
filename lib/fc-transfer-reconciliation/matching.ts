import type { FcAdjMeta, FcCaseMeta } from "./types";

function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** Canonical reconciliation grain shared by summary, analysis, and coverage:
 *  msku|fnsku|asin. A relisted MSKU with two FNSKUs is two distinct listings and
 *  must never net against itself, so every grouping keys on this. */
export function fcCanonKey(
  msku: string | null | undefined,
  fnsku: string | null | undefined,
  asin: string | null | undefined,
): string {
  return `${trimStr(msku)}|${trimStr(fnsku)}|${trimStr(asin)}`;
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
    fnsku?: string | null;
    asin?: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
    // Reimbursement-approval date. raisedDate is when the case was filed against
    // the loss; issueDate is the fallback. Either dates the offsetting event.
    raisedDate?: Date | null;
    issueDate?: Date | null;
  }[],
): Map<string, FcCaseMeta> {
  // Keyed by the canonical msku|fnsku|asin grain so coverage attaches to the
  // exact listing. Rows with blank fnsku/asin land under `MSKU||` and the
  // aggregator routes them through the msku-level fallback.
  const map = new Map<string, FcCaseMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    if (!msku) continue;
    const k = fcCanonKey(r.msku, r.fnsku, r.asin);
    const prev = map.get(k) ?? {
      msku,
      fnsku: trimStr(r.fnsku),
      asin: trimStr(r.asin),
      count: 0,
      openCount: 0,
      claimedQty: 0,
      approvedQty: 0,
      approvedAmount: 0,
      caseIds: [] as string[],
      topStatus: "No Case",
      records: [] as FcCaseMeta["records"],
    };
    prev.count++;
    prev.claimedQty += r.unitsClaimed || 0;
    prev.approvedQty += r.unitsApproved || 0;
    prev.approvedAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
    const approved = r.unitsApproved || 0;
    if (approved > 0) {
      prev.records.push({ qty: approved, date: r.raisedDate ?? r.issueDate ?? null });
    }
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

export function buildFcAdjMap(
  rows: {
    msku: string | null;
    fnsku?: string | null;
    asin?: string | null;
    qtyAdjusted: number;
    reason: string | null;
    adjDate?: Date | null;
  }[],
): Map<string, FcAdjMeta> {
  // Keyed by canonical msku|fnsku|asin; blank fnsku/asin -> msku-level fallback.
  const map = new Map<string, FcAdjMeta>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    if (!msku) continue;
    const k = fcCanonKey(r.msku, r.fnsku, r.asin);
    const prev = map.get(k) ?? {
      msku,
      fnsku: trimStr(r.fnsku),
      asin: trimStr(r.asin),
      qty: 0,
      count: 0,
      reasons: [] as string[],
      records: [] as FcAdjMeta["records"],
    };
    const qty = r.qtyAdjusted || 0;
    prev.qty += qty;
    prev.count++;
    if (qty !== 0) prev.records.push({ qty, date: r.adjDate ?? null });
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    map.set(k, prev);
  }
  return map;
}
