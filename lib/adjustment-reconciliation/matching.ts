import { reimbReasonBucket, type ReimbBucket } from "./formula";
import type {
  AdjAdjMeta,
  AdjCaseMeta,
  AdjReimbBuckets,
  AdjReimbMeta,
} from "./types";

function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

type ReimbRow = {
  quantity: number;
  amount: { toString(): string } | null;
  reason: string | null;
  originalReimbId?: string | null;
  originalReimbType?: string | null;
  approvalDate?: Date | string | null;
  reimbursementId?: string | null;
  caseId?: string | null;
  qtyCash?: number;
  qtyInventory?: number;
};

function emptyBuckets(): AdjReimbBuckets {
  return {
    lostQty: 0,
    lostAmount: 0,
    damagedQty: 0,
    damagedAmount: 0,
    otherQty: 0,
    otherAmount: 0,
    preLostQty: 0,
    preDamagedQty: 0,
    postLostQty: 0,
    postDamagedQty: 0,
    qty: 0,
    amount: 0,
    count: 0,
    lastApprovalDate: "",
    details: [],
  };
}

// Decide a row's bucket. Reversals carry their original bucket in
// originalReimbType; normal rows use the reimbursement reason.
function bucketFor(r: ReimbRow): { bucket: ReimbBucket; isReversal: boolean } {
  const isReversal = trimStr(r.originalReimbId).length > 0;
  const source = isReversal ? r.originalReimbType : r.reason;
  return { bucket: reimbReasonBucket(source), isReversal };
}

// Scope predicate: this module only cares about Lost_Warehouse and
// Damaged_Warehouse coverage. Reversals are in-scope only when their original
// reimbursement was one of those buckets.
function isInScope(r: ReimbRow): boolean {
  const { bucket } = bucketFor(r);
  return bucket === "lost" || bucket === "damaged";
}

// Fold one reimbursement row into a bucket accumulator.
//
// Coverage qty:
//   normal row   → qtyCash + qtyInventory  (units Amazon paid for + restocked)
//   reversal row → -qtyCash                (cash clawback only; the stock
//                                            return is represented separately
//                                            by an N adjustment, so adding
//                                            qtyInventory would double-count)
function applyReimbRow(
  b: AdjReimbBuckets,
  r: ReimbRow,
  snapshotIso: string,
): void {
  const { bucket, isReversal } = bucketFor(r);
  if (bucket !== "lost" && bucket !== "damaged") return; // scope guard

  const qtyCash = r.qtyCash ?? 0;
  const qtyInventory = r.qtyInventory ?? 0;
  const coverage = isReversal ? -qtyCash : qtyCash + qtyInventory;
  const amount = (r.amount ? Number(r.amount.toString()) : 0) * (isReversal ? -1 : 1);

  if (bucket === "lost") {
    b.lostQty += coverage;
    b.lostAmount += amount;
  } else {
    b.damagedQty += coverage;
    b.damagedAmount += amount;
  }
  b.qty += coverage;
  b.amount += amount;
  b.count++;

  const iso = fmtApproval(r.approvalDate);
  if (iso && iso > b.lastApprovalDate) b.lastApprovalDate = iso;

  const postSnapshot = iso !== "" && snapshotIso !== "" && iso > snapshotIso;
  if (postSnapshot) {
    if (bucket === "lost") b.postLostQty += coverage;
    else b.postDamagedQty += coverage;
  } else {
    if (bucket === "lost") b.preLostQty += coverage;
    else b.preDamagedQty += coverage;
  }

  b.details.push({
    approvalDate: iso,
    reimbId: trimStr(r.reimbursementId),
    caseId: trimStr(r.caseId),
    reason: trimStr(r.reason),
    originalReimbType: trimStr(r.originalReimbType),
    qty: coverage,
    qtyCash: isReversal ? -qtyCash : qtyCash,
    qtyInventory: isReversal ? 0 : qtyInventory,
    amount,
    isReversal,
    postSnapshot,
  });
}

function fmtApproval(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
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

export function buildAdjAdjMapByAsin(
  rows: { asin: string | null; qtyAdjusted: number; reason: string | null }[],
): Map<string, AdjAdjMeta> {
  const map = new Map<string, AdjAdjMeta>();
  for (const r of rows) {
    const k = trimStr(r.asin);
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
  rows: (ReimbRow & { msku: string | null })[],
  snapshotIso = "",
): Map<string, AdjReimbBuckets> {
  const map = new Map<string, AdjReimbBuckets>();
  for (const r of rows) {
    if (!isInScope(r)) continue;
    const k = trimStr(r.msku);
    if (!k) continue;
    const prev = map.get(k) ?? emptyBuckets();
    applyReimbRow(prev, r, snapshotIso);
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
  rows: (ReimbRow & { asin: string | null })[],
  snapshotIso = "",
): Map<string, AdjReimbBuckets> {
  const map = new Map<string, AdjReimbBuckets>();
  for (const r of rows) {
    if (!isInScope(r)) continue;
    const k = trimStr(r.asin);
    if (!k) continue;
    const prev = map.get(k) ?? emptyBuckets();
    applyReimbRow(prev, r, snapshotIso);
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
