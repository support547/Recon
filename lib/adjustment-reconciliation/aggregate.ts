import {
  CLAIM_DAYS_THRESHOLD,
  getClaimTag,
  getReasonLabel,
  isFoundCode,
  isLossCode,
  isNoiseCode,
  isReversalCode,
} from "./formula";
import type {
  AdjActionStatus,
  AdjAdjMeta,
  AdjAnalysisRow,
  AdjCaseMeta,
  AdjClaimType,
  AdjLogRow,
  AdjPivotGroupBy,
  AdjPivotResult,
  AdjPivotRow,
  AdjReconStats,
  AdjReimbMeta,
} from "./types";

type AdjInput = {
  id: string;
  adjDate: Date | null;
  fnsku: string | null;
  msku: string | null;
  asin: string | null;
  title: string | null;
  quantity: number;
  reason: string | null;
  disposition: string | null;
  fulfillmentCenter: string | null;
  reconciledQty: number;
  unreconciledQty: number;
  referenceId: string | null;
  store: string | null;
};

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

export function aggregateAdjAnalysis(
  rows: AdjInput[],
  caseMap: Map<string, AdjCaseMeta>,
  adjMap: Map<string, AdjAdjMeta>,
  reimbMap: Map<string, AdjReimbMeta>,
  today: Date = new Date(),
): AdjAnalysisRow[] {
  type Acc = {
    msku: string;
    fnsku: string;
    asin: string;
    title: string;
    lossQty: number;
    misplacedQty: number;
    damagedQty: number;
    reconciledQty: number;
    unreconciledQty: number;
    foundQty: number;
    reversalQty: number;
    oldestLoss: Date | null;
    latestLoss: Date | null;
    oldestUnreconciled: Date | null;
    hadLossCode: boolean;
    sawLostCode: boolean;
    sawDamagedCode: boolean;
  };

  const accs = new Map<string, Acc>();

  for (const r of rows) {
    const code = (r.reason ?? "").trim().toUpperCase();
    if (!code) continue;
    if (isNoiseCode(code)) continue;
    if (!isLossCode(code) && !isFoundCode(code) && !isReversalCode(code)) continue;

    const msku = s(r.msku);
    if (!msku) continue;

    const acc =
      accs.get(msku) ??
      ({
        msku,
        fnsku: s(r.fnsku),
        asin: s(r.asin),
        title: s(r.title),
        lossQty: 0,
        misplacedQty: 0,
        damagedQty: 0,
        reconciledQty: 0,
        unreconciledQty: 0,
        foundQty: 0,
        reversalQty: 0,
        oldestLoss: null,
        latestLoss: null,
        oldestUnreconciled: null,
        hadLossCode: false,
        sawLostCode: false,
        sawDamagedCode: false,
      } satisfies Acc);

    if (!acc.fnsku && r.fnsku) acc.fnsku = r.fnsku;
    if (!acc.asin && r.asin) acc.asin = r.asin;
    if (!acc.title && r.title) acc.title = r.title;

    const qty = Math.abs(r.quantity || 0);

    if (isLossCode(code)) {
      acc.hadLossCode = true;
      acc.lossQty += qty;
      if (code === "M" || code === "5") {
        acc.misplacedQty += qty;
        acc.sawLostCode = true;
      } else if (code === "E") {
        acc.damagedQty += qty;
        acc.sawDamagedCode = true;
      }
      acc.reconciledQty += r.reconciledQty || 0;
      const unrecon = r.unreconciledQty || 0;
      acc.unreconciledQty += unrecon;
      if (r.adjDate) {
        if (!acc.oldestLoss || r.adjDate < acc.oldestLoss) acc.oldestLoss = r.adjDate;
        if (!acc.latestLoss || r.adjDate > acc.latestLoss) acc.latestLoss = r.adjDate;
        if (unrecon > 0) {
          if (!acc.oldestUnreconciled || r.adjDate < acc.oldestUnreconciled) {
            acc.oldestUnreconciled = r.adjDate;
          }
        }
      }
    } else if (isFoundCode(code)) {
      acc.foundQty += qty;
    } else if (isReversalCode(code)) {
      acc.reversalQty += qty;
    }

    accs.set(msku, acc);
  }

  const out: AdjAnalysisRow[] = [];
  for (const a of accs.values()) {
    const cm = caseMap.get(a.msku);
    const am = adjMap.get(a.msku);
    const rm = reimbMap.get(a.msku);

    const caseApprovedQty = cm?.approvedQty ?? 0;
    const adjQty = am?.qty ?? 0;
    const reimbQty = rm?.qty ?? 0;
    const reimbAmount = rm?.amount ?? 0;
    const effectiveReimbQty = caseApprovedQty + adjQty + reimbQty;
    const netClaimableQty = Math.max(0, a.unreconciledQty - effectiveReimbQty);

    const daysPending = a.oldestUnreconciled
      ? daysBetween(today, a.oldestUnreconciled)
      : 0;

    let claimType: AdjClaimType = "None";
    if (a.sawLostCode && a.sawDamagedCode) claimType = "Mixed";
    else if (a.sawLostCode) claimType = "Lost_Warehouse";
    else if (a.sawDamagedCode) claimType = "Damaged_Warehouse";

    let actionStatus: AdjActionStatus;
    if (!a.hadLossCode) actionStatus = "excess";
    else if (a.unreconciledQty === 0) actionStatus = "reconciled";
    else if (daysPending > CLAIM_DAYS_THRESHOLD) actionStatus = "take-action";
    else actionStatus = "waiting";

    out.push({
      msku: a.msku,
      fnsku: a.fnsku,
      asin: a.asin,
      title: a.title,
      lossQty: a.lossQty,
      misplacedQty: a.misplacedQty,
      damagedQty: a.damagedQty,
      reconciledQty: a.reconciledQty,
      unreconciledQty: a.unreconciledQty,
      claimType,
      foundQty: a.foundQty,
      reversalQty: a.reversalQty,
      oldestLossDate: fmtIso(a.oldestLoss),
      latestLossDate: fmtIso(a.latestLoss),
      oldestUnreconciledDate: fmtIso(a.oldestUnreconciled),
      daysPending,
      reimbQty,
      reimbAmount,
      caseCount: cm?.count ?? 0,
      caseOpenCount: cm?.openCount ?? 0,
      caseStatusTop: cm?.topStatus ?? "No Case",
      caseApprovedQty,
      caseApprovedAmount: cm?.approvedAmount ?? 0,
      adjQty,
      effectiveReimbQty,
      netClaimableQty,
      actionStatus,
    });
  }

  const priority = (r: AdjAnalysisRow): number => {
    switch (r.actionStatus) {
      case "take-action":
        return 0;
      case "waiting":
        return 1;
      case "reconciled":
        return 2;
      case "excess":
        return 3;
    }
  };
  out.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0 || pa === 1) {
      return b.daysPending - a.daysPending;
    }
    return b.lossQty - a.lossQty;
  });

  return out;
}

export function aggregateAdjPivot(
  rows: AdjInput[],
  groupBy: AdjPivotGroupBy = "asin",
  caseMap?: Map<string, AdjCaseMeta>,
  reimbMap?: Map<string, AdjReimbMeta>,
): AdjPivotResult {
  type Acc = {
    key: string;
    title: string;
    qtyByReason: Record<string, number>;
    totalQty: number;
  };
  const accs = new Map<string, Acc>();
  const reasonSet = new Set<string>();

  for (const r of rows) {
    const key = groupBy === "msku" ? s(r.msku) : s(r.asin);
    if (!key) continue;
    const code = (r.reason ?? "").trim().toUpperCase();
    if (!code) continue;
    reasonSet.add(code);

    const acc =
      accs.get(key) ??
      ({
        key,
        title: s(r.title),
        qtyByReason: {},
        totalQty: 0,
      } satisfies Acc);

    if (!acc.title && r.title) acc.title = r.title;

    const q = r.quantity || 0;
    acc.qtyByReason[code] = (acc.qtyByReason[code] ?? 0) + q;
    acc.totalQty += q;

    accs.set(key, acc);
  }

  const reasonCodes = Array.from(reasonSet).sort((a, b) => {
    const aIsNum = /^\d+$/.test(a);
    const bIsNum = /^\d+$/.test(b);
    if (aIsNum && !bIsNum) return 1;
    if (!aIsNum && bIsNum) return -1;
    return a.localeCompare(b);
  });

  const pivotRows: AdjPivotRow[] = Array.from(accs.values())
    .map((a) => {
      const cm = caseMap?.get(a.key);
      const rm = reimbMap?.get(a.key);
      let status: "ok" | "excess" | "take-action";
      if (a.totalQty === 0) status = "ok";
      else if (a.totalQty > 0) status = "excess";
      else status = "take-action";
      return {
        key: a.key,
        title: a.title,
        qtyByReason: a.qtyByReason,
        totalQty: a.totalQty,
        status,
        reimbQty: rm?.qty ?? 0,
        reimbAmount: rm?.amount ?? 0,
        caseCount: cm?.count ?? 0,
        caseOpenCount: cm?.openCount ?? 0,
        caseStatusTop: cm?.topStatus ?? "No Case",
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return { groupBy, rows: pivotRows, reasonCodes };
}

export function buildAdjLogRows(rows: AdjInput[]): AdjLogRow[] {
  return rows.map((r) => ({
    id: r.id,
    adjDate: fmtIso(r.adjDate),
    fnsku: r.fnsku ?? "",
    msku: r.msku ?? "",
    asin: r.asin ?? "",
    title: r.title ?? "",
    quantity: r.quantity,
    reason: (r.reason ?? "").trim().toUpperCase(),
    reasonLabel: getReasonLabel(r.reason),
    claimTag: getClaimTag(r.reason),
    disposition: r.disposition ?? "",
    fulfillmentCenter: r.fulfillmentCenter ?? "",
    reconciledQty: r.reconciledQty ?? 0,
    unreconciledQty: r.unreconciledQty ?? 0,
    referenceId: r.referenceId ?? "",
    store: r.store ?? "",
  }));
}

export function adjStats(analysis: AdjAnalysisRow[]): AdjReconStats {
  let totalLossEvents = 0;
  let totalLossQty = 0;
  let totalFoundQty = 0;
  let totalReconciledQty = 0;
  let totalUnreconciledQty = 0;
  let takeActionCount = 0;
  let takeActionQty = 0;
  let waitingCount = 0;
  let waitingQty = 0;
  let reconciledCount = 0;
  let reconciledQtyBucket = 0;
  let excessCount = 0;
  let excessQty = 0;
  let reimbMatchedCount = 0;
  let reimbMatchedQty = 0;
  let casesRaisedCount = 0;
  let casesRaisedQty = 0;

  for (const r of analysis) {
    totalLossQty += r.lossQty;
    totalFoundQty += r.foundQty;
    totalReconciledQty += r.reconciledQty;
    totalUnreconciledQty += r.unreconciledQty;
    if (r.lossQty > 0) totalLossEvents += 1;

    if (r.actionStatus === "take-action") {
      takeActionCount += 1;
      takeActionQty += r.unreconciledQty;
    } else if (r.actionStatus === "waiting") {
      waitingCount += 1;
      waitingQty += r.unreconciledQty;
    } else if (r.actionStatus === "reconciled") {
      reconciledCount += 1;
      reconciledQtyBucket += r.reconciledQty;
    } else {
      excessCount += 1;
      excessQty += r.foundQty + r.reversalQty;
    }

    if (r.effectiveReimbQty >= r.unreconciledQty && r.unreconciledQty > 0) {
      reimbMatchedCount += 1;
      reimbMatchedQty += r.effectiveReimbQty;
    }
    if (r.caseOpenCount > 0) {
      casesRaisedCount += 1;
      casesRaisedQty += r.caseOpenCount;
    }
  }

  return {
    totalSkus: analysis.length,
    totalLossEvents,
    totalLossQty,
    totalFoundQty,
    totalReconciledQty,
    totalUnreconciledQty,
    takeActionCount,
    takeActionQty,
    waitingCount,
    waitingQty,
    reconciledCount,
    reconciledQtyBucket,
    excessCount,
    excessQty,
    reimbMatchedCount,
    reimbMatchedQty,
    casesRaisedCount,
    casesRaisedQty,
  };
}
