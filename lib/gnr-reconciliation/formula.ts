import { trimStr } from "./matching";
import type {
  GnrActionStatus,
  GnrAdjMeta,
  GnrCaseMeta,
  GnrCombinedRow,
  GnrReconRow,
} from "./types";

const EMPTY_CASE: GnrCaseMeta = {
  count: 0,
  totalClaimed: 0,
  totalApproved: 0,
  totalAmount: 0,
  topStatus: "",
  caseIds: [],
  reasons: [],
  notes: [],
  firstRaisedAt: null,
  lastUpdatedAt: null,
};
const EMPTY_ADJ: GnrAdjMeta = { qty: 0, count: 0, reasons: [] };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
}

type GnrAgg = {
  usedMsku: string;
  usedFnsku: string;
  origFnsku: string;
  asin: string;
  usedCondition: string;
  gnrQty: number;
  succeededQty: number;
  failedQty: number;
  orderIdSet: Set<string>;
  lpnSet: Set<string>;
  firstDate: Date | null;
  lastDate: Date | null;
};

/** Aggregate combined rows by (usedMsku, usedFnsku) → one bucket per resell SKU. */
export function aggregateGnr(rows: GnrCombinedRow[]): GnrAgg[] {
  const map = new Map<string, GnrAgg>();
  for (const r of rows) {
    const usedMsku = trimStr(r.usedMsku) || "(No Used SKU)";
    const usedFnsku = trimStr(r.usedFnsku) || "(No Used FNSKU)";
    const k = `${usedMsku}|${usedFnsku}`;
    let prev = map.get(k);
    if (!prev) {
      prev = {
        usedMsku,
        usedFnsku,
        origFnsku: trimStr(r.fnsku),
        asin: trimStr(r.asin),
        usedCondition: trimStr(r.usedCondition),
        gnrQty: 0,
        succeededQty: 0,
        failedQty: 0,
        orderIdSet: new Set<string>(),
        lpnSet: new Set<string>(),
        firstDate: null,
        lastDate: null,
      };
      map.set(k, prev);
    }
    const q = r.quantity || 0;
    prev.gnrQty += q;
    const us = (r.unitStatus ?? "").toLowerCase();
    if (us === "succeeded") prev.succeededQty += q;
    else if (us === "failed") prev.failedQty += q;
    if (!prev.origFnsku && r.fnsku) prev.origFnsku = trimStr(r.fnsku);
    if (!prev.asin && r.asin) prev.asin = trimStr(r.asin);
    if (!prev.usedCondition && r.usedCondition) prev.usedCondition = trimStr(r.usedCondition);
    if (r.orderId) prev.orderIdSet.add(r.orderId);
    if (r.lpn) prev.lpnSet.add(r.lpn);
    if (r.reportDate) {
      if (!prev.firstDate || r.reportDate < prev.firstDate) prev.firstDate = r.reportDate;
      if (!prev.lastDate || r.reportDate > prev.lastDate) prev.lastDate = r.reportDate;
    }
  }
  return Array.from(map.values());
}

/**
 * FBA-first action status:
 *   ending == fba                → matched
 *   fba==0 && ending>0           → take-action
 *   ending > fba                 → over-accounted
 *   ending < fba, ≤60d           → waiting
 *   ending < fba, >60d           → take-action
 * No FBA data:
 *   ending == 0                  → balanced
 *   ending < 0                   → review
 *   ending > 0                   → take-action
 */
export function computeActionStatus(
  endingBalance: number,
  fbaEnding: number | null,
  daysSince: number,
): GnrActionStatus {
  if (fbaEnding !== null) {
    if (endingBalance === fbaEnding) return "matched";
    if (fbaEnding === 0 && endingBalance > 0) return "take-action";
    if (endingBalance > fbaEnding) return "over-accounted";
    return daysSince > 60 ? "take-action" : "waiting";
  }
  if (endingBalance === 0) return "balanced";
  if (endingBalance < 0) return "review";
  return "take-action";
}

export function computeGnrReconRow(input: {
  agg: GnrAgg;
  salesMap: Map<string, number>;
  returnsMap: Map<string, number>;
  removalsMap: Map<string, number>;
  reimbMap: Map<string, { qty: number; amount: number }>;
  fbaMap: Map<string, { fbaEnding: number; summaryDate: Date | null }>;
  caseMap: Map<string, GnrCaseMeta>;
  adjMap: Map<string, GnrAdjMeta>;
  today?: Date;
}): GnrReconRow {
  const { agg, salesMap, returnsMap, removalsMap, reimbMap, fbaMap, caseMap, adjMap } = input;
  const today = input.today ?? new Date();
  const fnsku = agg.usedFnsku && agg.usedFnsku !== "(No Used FNSKU)" ? agg.usedFnsku : "";

  const salesQty = fnsku ? salesMap.get(fnsku) ?? 0 : 0;
  const returnQty = fnsku ? returnsMap.get(fnsku) ?? 0 : 0;
  const removalQty = fnsku ? removalsMap.get(fnsku) ?? 0 : 0;
  const reimb = fnsku ? reimbMap.get(fnsku) ?? { qty: 0, amount: 0 } : { qty: 0, amount: 0 };
  const fba = fnsku ? fbaMap.get(fnsku) : undefined;

  const endingBalance = agg.gnrQty - salesQty - removalQty - reimb.qty + returnQty;
  const fbaEnding = fba ? fba.fbaEnding : null;
  const lastDate = agg.lastDate;
  const daysSince = lastDate
    ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 86400))
    : 999;
  const actionStatus = computeActionStatus(endingBalance, fbaEnding, daysSince);

  const caseMeta = fnsku ? caseMap.get(fnsku) ?? EMPTY_CASE : EMPTY_CASE;
  const adj = adjMap.get(agg.usedMsku) ?? EMPTY_ADJ;

  return {
    usedMsku: agg.usedMsku,
    usedFnsku: agg.usedFnsku,
    origFnsku: agg.origFnsku || "—",
    asin: agg.asin || "—",
    usedCondition: agg.usedCondition || "—",
    gnrQty: agg.gnrQty,
    succeededQty: agg.succeededQty,
    failedQty: agg.failedQty,
    orderCount: agg.orderIdSet.size,
    orderIds: Array.from(agg.orderIdSet).sort().join(", "),
    lpns: Array.from(agg.lpnSet).sort().join(", "),
    firstDate: fmtDate(agg.firstDate),
    lastDate: fmtDate(agg.lastDate),
    salesQty,
    returnQty,
    removalQty,
    reimbQty: reimb.qty,
    reimbAmount: reimb.amount,
    endingBalance,
    fbaEnding,
    fbaSummaryDate: fmtDate(fba?.summaryDate ?? null),
    caseCount: caseMeta.count,
    caseClaimedQty: caseMeta.totalClaimed,
    caseApprovedQty: caseMeta.totalApproved,
    caseApprovedAmount: caseMeta.totalAmount,
    caseTopStatus: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    caseReasons: caseMeta.reasons.join("; "),
    caseNotes: caseMeta.notes.join("; "),
    caseFirstRaisedAt: fmtDate(caseMeta.firstRaisedAt),
    caseLastUpdatedAt: fmtDate(caseMeta.lastUpdatedAt),
    adjQty: adj.qty,
    adjCount: adj.count,
    adjReasons: adj.reasons.join("; "),
    actionStatus,
    daysSince,
  };
}
