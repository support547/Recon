import type { GnrAdjMeta, GnrCaseMeta, GnrCombinedRow } from "./types";

export function trimStr(s: string | null | undefined): string {
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
  RESOLVED: "resolved",
  IN_PROGRESS: "raised",
  OPEN: "raised",
  REJECTED: "rejected",
  CLOSED: "resolved",
};

/** Sales / Returns / Removals / Reimbursements aggregated by FNSKU. */
export function buildFnskuQtyMap(
  rows: { fnsku: string | null; quantity: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + (r.quantity || 0));
  }
  return m;
}

/** Reimbursements by FNSKU produce qty + amount. */
export function buildReimbByFnsku(
  rows: { fnsku: string | null; quantity: number; amount: { toString(): string } | null }[],
): Map<string, { qty: number; amount: number }> {
  const m = new Map<string, { qty: number; amount: number }>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    const prev = m.get(k) ?? { qty: 0, amount: 0 };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    m.set(k, prev);
  }
  return m;
}

/** FBA Summary: latest endingBalance per FNSKU (highest summaryDate). */
export function buildFbaLatestMap(
  rows: { fnsku: string | null; endingBalance: number; summaryDate: Date | null }[],
): Map<string, { fbaEnding: number; summaryDate: Date | null }> {
  const m = new Map<string, { fbaEnding: number; summaryDate: Date | null }>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    const prev = m.get(k);
    if (!prev) {
      m.set(k, { fbaEnding: r.endingBalance, summaryDate: r.summaryDate });
      continue;
    }
    const a = prev.summaryDate ? prev.summaryDate.getTime() : -Infinity;
    const b = r.summaryDate ? r.summaryDate.getTime() : -Infinity;
    if (b > a) {
      m.set(k, { fbaEnding: r.endingBalance, summaryDate: r.summaryDate });
    }
  }
  return m;
}

/** Case overlay keyed by FNSKU (used_fnsku). */
export function buildGnrCaseMap(
  rows: {
    fnsku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
    caseReason: string | null;
    notes: string | null;
    raisedDate: Date | null;
    updatedAt: Date | null;
  }[],
): Map<string, GnrCaseMeta> {
  const m = new Map<string, GnrCaseMeta>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    const prev = m.get(k) ?? {
      count: 0,
      totalClaimed: 0,
      totalApproved: 0,
      totalAmount: 0,
      topStatus: "",
      caseIds: [] as string[],
      reasons: [] as string[],
      notes: [] as string[],
      firstRaisedAt: null as Date | null,
      lastUpdatedAt: null as Date | null,
    };
    prev.count++;
    prev.totalClaimed += r.unitsClaimed || 0;
    prev.totalApproved += r.unitsApproved || 0;
    prev.totalAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
    if (r.referenceId && !prev.caseIds.includes(r.referenceId)) prev.caseIds.push(r.referenceId);
    if (r.caseReason && !prev.reasons.includes(r.caseReason)) prev.reasons.push(r.caseReason);
    if (r.notes && !prev.notes.includes(r.notes)) prev.notes.push(r.notes);
    if (r.raisedDate && (!prev.firstRaisedAt || r.raisedDate < prev.firstRaisedAt)) {
      prev.firstRaisedAt = r.raisedDate;
    }
    if (r.updatedAt && (!prev.lastUpdatedAt || r.updatedAt > prev.lastUpdatedAt)) {
      prev.lastUpdatedAt = r.updatedAt;
    }
    const sk = (r.status ?? "").toUpperCase();
    const rank = CASE_STATUS_PRI[sk] ?? 0;
    const currentRank = CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > currentRank) {
      prev.topStatus = CASE_STATUS_LABEL[sk] ?? "raised";
    }
    m.set(k, prev);
  }
  return m;
}

/** Adjustments overlay keyed by MSKU (used_msku). */
export function buildGnrAdjMap(
  rows: { msku: string | null; qtyAdjusted: number; reason: string | null }[],
): Map<string, GnrAdjMeta> {
  const m = new Map<string, GnrAdjMeta>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = m.get(k) ?? { qty: 0, count: 0, reasons: [] as string[] };
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    if (r.reason && !prev.reasons.includes(r.reason)) prev.reasons.push(r.reason);
    m.set(k, prev);
  }
  return m;
}

/**
 * Combine gnr_report rows + grade_resell_items into a single normalised stream.
 *
 * For grade_resell_items: if `usedMsku` empty → fallback key "Manual: <msku>".
 * If `usedFnsku` empty → fallback to original `fnsku`.
 * If `usedCondition` empty → fallback to `grade`.
 * If `unitStatus` empty → default "Succeeded".
 */
export function combineGnrSources(
  gnrRows: {
    usedMsku: string | null;
    usedFnsku: string | null;
    fnsku: string | null;
    asin: string | null;
    usedCondition: string | null;
    quantity: number;
    unitStatus: string | null;
    orderId: string | null;
    lpn: string | null;
    reportDate: Date | null;
  }[],
  manualRows: {
    msku: string;
    fnsku: string | null;
    asin: string | null;
    usedMsku: string | null;
    usedFnsku: string | null;
    usedCondition: string | null;
    grade: string | null;
    quantity: number;
    unitStatus: string | null;
    orderId: string | null;
    lpn: string | null;
    gradedDate: Date | null;
  }[],
): GnrCombinedRow[] {
  const out: GnrCombinedRow[] = [];
  for (const r of gnrRows) {
    out.push({
      usedMsku: r.usedMsku,
      usedFnsku: r.usedFnsku,
      fnsku: r.fnsku,
      asin: r.asin,
      usedCondition: r.usedCondition,
      quantity: r.quantity || 0,
      unitStatus: r.unitStatus,
      orderId: r.orderId,
      lpn: r.lpn,
      reportDate: r.reportDate,
    });
  }
  for (const r of manualRows) {
    const usedMsku = trimStr(r.usedMsku) || `Manual: ${trimStr(r.msku)}`;
    const usedFnsku = trimStr(r.usedFnsku) || trimStr(r.fnsku);
    const usedCondition = trimStr(r.usedCondition) || trimStr(r.grade);
    const unitStatus = trimStr(r.unitStatus) || "Succeeded";
    out.push({
      usedMsku,
      usedFnsku: usedFnsku || null,
      fnsku: r.fnsku,
      asin: r.asin,
      usedCondition: usedCondition || null,
      quantity: r.quantity || 0,
      unitStatus,
      orderId: r.orderId,
      lpn: r.lpn,
      reportDate: r.gradedDate,
    });
  }
  return out;
}
