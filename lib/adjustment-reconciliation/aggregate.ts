import {
  CLAIM_EXPIRY_DAYS,
  DAMAGED_AUTO_REIMB_GRACE_DAYS,
  getClaimTag,
  getReasonLabel,
  isFoundCode,
  isLossCode,
  isNoiseCode,
  isReversalCode,
  LOST_RESEARCH_WINDOW_DAYS,
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
  AdjReimbBuckets,
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
  reimbMap: Map<string, AdjReimbBuckets>,
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
    lostQty: number; // code M only (abs)
    inboundLostQty: number; // code 5 only (abs) — display-only
    reconciledQty: number;
    unreconciledQty: number;
    foundQty: number;
    reversalQty: number;
    oldestLoss: Date | null;
    latestLoss: Date | null;
    oldestUnreconciled: Date | null;
    oldestLostAdj: Date | null; // oldest M adj date
    oldestDamagedAdj: Date | null; // oldest E adj date
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
        lostQty: 0,
        inboundLostQty: 0,
        reconciledQty: 0,
        unreconciledQty: 0,
        foundQty: 0,
        reversalQty: 0,
        oldestLoss: null,
        latestLoss: null,
        oldestUnreconciled: null,
        oldestLostAdj: null,
        oldestDamagedAdj: null,
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
      if (code === "M") {
        acc.misplacedQty += qty;
        acc.lostQty += qty;
        acc.sawLostCode = true;
        if (r.adjDate && (!acc.oldestLostAdj || r.adjDate < acc.oldestLostAdj)) {
          acc.oldestLostAdj = r.adjDate;
        }
      } else if (code === "5") {
        // Inbound lost — display-only, belongs to Shipment Recon scope.
        acc.misplacedQty += qty;
        acc.inboundLostQty += qty;
        acc.sawLostCode = true;
      } else if (code === "E") {
        acc.damagedQty += qty;
        acc.sawDamagedCode = true;
        if (r.adjDate && (!acc.oldestDamagedAdj || r.adjDate < acc.oldestDamagedAdj)) {
          acc.oldestDamagedAdj = r.adjDate;
        }
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
    const lostReimbQty = rm?.lostQty ?? 0;
    const damagedReimbQty = rm?.damagedQty ?? 0;
    const reimbQty = rm?.qty ?? 0; // backward-compat total (lost + damaged)
    const reimbAmount = rm?.amount ?? 0;

    // Found offsets Lost first. Inbound-lost (code 5) excluded — Shipment scope.
    const effectiveLost = Math.max(0, a.lostQty - a.foundQty);

    // Manual coverage (cases + manual adjustments) not bucket-tagged — apply to
    // the larger open bucket first, then overflow to the other.
    const manualCover = caseApprovedQty + adjQty;
    const rawOpenLost = Math.max(0, effectiveLost - lostReimbQty);
    const rawOpenDamaged = Math.max(0, a.damagedQty - damagedReimbQty);

    let openLost = rawOpenLost;
    let openDamaged = rawOpenDamaged;
    if (manualCover > 0) {
      if (rawOpenLost >= rawOpenDamaged) {
        const toLost = Math.min(openLost, manualCover);
        openLost -= toLost;
        openDamaged = Math.max(0, openDamaged - (manualCover - toLost));
      } else {
        const toDamaged = Math.min(openDamaged, manualCover);
        openDamaged -= toDamaged;
        openLost = Math.max(0, openLost - (manualCover - toDamaged));
      }
    }

    const netClaimableQty = openLost + openDamaged;
    const effectiveReimbQty = caseApprovedQty + adjQty + reimbQty;

    const daysPending = a.oldestUnreconciled
      ? daysBetween(today, a.oldestUnreconciled)
      : 0;

    let claimType: AdjClaimType = "None";
    if (a.sawLostCode && a.sawDamagedCode) claimType = "Mixed";
    else if (a.sawLostCode) claimType = "Lost_Warehouse";
    else if (a.sawDamagedCode) claimType = "Damaged_Warehouse";

    // Per-bucket status timeline. Oldest uncovered adj date drives the clock —
    // the manual claim window closes 60d after the adjustment, so "take-action"
    // must fire BEFORE that, not after.
    type BucketStatus = "waiting" | "take-action" | "expired";
    const bucketStatus = (
      open: number,
      oldest: Date | null,
      waitWindow: number,
    ): { status: BucketStatus | null; oldest: Date | null } => {
      if (open <= 0 || !oldest) return { status: null, oldest: null };
      const days = daysBetween(today, oldest);
      let status: BucketStatus;
      if (days <= waitWindow) status = "waiting";
      else if (days <= CLAIM_EXPIRY_DAYS) status = "take-action";
      else status = "expired";
      return { status, oldest };
    };

    const lostB = bucketStatus(openLost, a.oldestLostAdj, LOST_RESEARCH_WINDOW_DAYS);
    const damagedB = bucketStatus(
      openDamaged,
      a.oldestDamagedAdj,
      DAMAGED_AUTO_REIMB_GRACE_DAYS,
    );

    const STATUS_RANK: Record<BucketStatus, number> = {
      expired: 3,
      "take-action": 2,
      waiting: 1,
    };

    let actionStatus: AdjActionStatus;
    let deadlineAnchor: Date | null = null;
    if (!a.hadLossCode) {
      actionStatus = "excess";
    } else if (netClaimableQty === 0) {
      actionStatus = "reconciled";
    } else {
      // Worst bucket wins (expired > take-action > waiting).
      const candidates = [lostB, damagedB].filter((b) => b.status !== null);
      let worst: BucketStatus = "waiting";
      for (const c of candidates) {
        if (STATUS_RANK[c.status as BucketStatus] > STATUS_RANK[worst]) {
          worst = c.status as BucketStatus;
        }
      }
      actionStatus = worst;
      // Deadline anchored to the oldest uncovered adj date across open buckets.
      for (const c of candidates) {
        if (c.oldest && (!deadlineAnchor || c.oldest < deadlineAnchor)) {
          deadlineAnchor = c.oldest;
        }
      }
    }

    let claimDeadline = "";
    let daysToDeadline = 0;
    if (deadlineAnchor) {
      const dl = new Date(deadlineAnchor);
      dl.setDate(dl.getDate() + CLAIM_EXPIRY_DAYS);
      claimDeadline = fmtIso(dl);
      daysToDeadline = Math.floor(
        (dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

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
      inboundLostQty: a.inboundLostQty,
      openLost,
      openDamaged,
      lostReimbQty,
      damagedReimbQty,
      claimDeadline,
      daysToDeadline,
    });
  }

  const priority = (r: AdjAnalysisRow): number => {
    switch (r.actionStatus) {
      case "take-action":
        return 0;
      case "expired":
        return 1;
      case "waiting":
        return 2;
      case "reconciled":
        return 3;
      case "excess":
        return 4;
    }
  };
  out.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    if (pa === 0 || pa === 1 || pa === 2) {
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
  reimbMap?: Map<string, { qty: number; amount: number }>,
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

    if (r.actionStatus === "take-action" || r.actionStatus === "expired") {
      // Expired claims are past the manual window but still represent open loss.
      takeActionCount += 1;
      takeActionQty += r.netClaimableQty;
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
