import type { AdjCoverageType, AdjDecision, AdjStatus } from "./formula";

export type { AdjCoverageType, AdjDecision, AdjStatus } from "./formula";

// Legacy alias — code paths still import AdjActionStatus by name. Same shape.
export type AdjActionStatus = AdjStatus;
export type AdjClaimType = "Lost_Warehouse" | "Damaged_Warehouse" | "Mixed" | "None";

// One adjustment event after the decision engine ran on it. Surfaced in the
// MSKU row's hover so the operator can see why a row landed in a given status.
export type AdjEventDecision = {
  code: string; // reason code, e.g. "M", "4", "P"
  date: string; // ISO yyyy-mm-dd, "" if missing
  qty: number; // signed quantity exactly as Amazon reported
  decision: AdjDecision;
  status: AdjStatus;
  coveredBy: string; // free-text: "reimb R-123", "case CAS-9", "paired Q@2026-05-12", ""
};

// Reimbursement detail attached to a ledger row.
//   qty     = qtyCash + qtyInventory (legacy field; equals consumed units)
//   qtyCash = cash-paid units (what shows in the Reimb Qty column)
export type AdjLedgerReimbDetail = {
  approvalDate: string;
  reimbId: string;
  caseId: string;
  reason: string;
  qty: number;
  qtyCash: number;
  amount: number;
};

// One credit event consumed to cover a debit. Surfaced in the Coverage chip
// hover so the operator sees exactly which F / reimb / P / 3 / case / manual
// row paid for which debit unit.
export type AdjCoveredByDetail = {
  code: string; // "F" | "LW" | "DW" | "P" | "3" | "CA" | "MA"
  date: string; // ISO yyyy-mm-dd
  msku: string;
  qty: number; // positive (credit qty)
  fc: string; // fulfillmentCenter or "—" for reimb/case/manual
  disposition: string; // "—" for reimb/case/manual
  referenceId?: string;
  type: "found" | "reimb" | "dispo" | "gr" | "case" | "manual";
};

// One debit event in the ledger. Credits (F/N/P/3) never appear here; they are
// consumed by the engine to mark this row's coverage.
export type AdjLedgerRow = {
  id: string;
  adjDate: string;
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  referenceId: string;
  fulfillmentCenter: string;
  disposition: string;
  reason: string; // uppercase code
  reasonLabel: string;
  qty: number; // signed (always negative for debits)
  coverageType: AdjCoverageType;
  coveredQty: number;
  coveredAmount: number;
  reimbDetails: AdjLedgerReimbDetail[];
  reimbQty: number; // sum of qtyCash across matched reimbs
  coveredByDetails: AdjCoveredByDetail[];
  pairedRefId: string;
  pairedMsku: string;
  actionStatus: AdjStatus;
  decision: string; // human readable
  daysSinceEvent: number;
  // MSKU-level case + manual-adjustment meta, attached to every event on the
  // MSKU so the ledger table can show the totals + hover detail per row.
  caseCount: number;
  caseClaimedQty: number;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  caseTopStatus: string;
  caseIds: string;
  caseReasons: string;
  manualAdjQty: number;
  manualAdjCount: number;
  manualAdjReasons: string;
};

// Transaction-level row (legacy; pre-ledger event view). Retained so callers
// importing this type still compile, but the new UI consumes AdjLedgerRow.
export type AdjEventRow = {
  id: string; // stable: groupKey
  adjDate: string;
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  referenceId: string;
  fulfillmentCenter: string;
  disposition: string;
  reason: string; // uppercase code
  reasonLabel: string;
  qty: number; // signed, summed within group
  reconciledQty: number;
  unreconciledQty: number;
  reimbQtyAllocated: number;
  reimbAmountAllocated: number;
  claimDeadline: string; // adjDate + 60d, "" if no adjDate
  daysToDeadline: number;
  decision: AdjDecision;
  status: AdjStatus;
  coveredBy: string;
  pairedRefId: string; // counterpart referenceId for paired events, ""
};

export type AdjReimbDetail = {
  approvalDate: string; // ISO yyyy-mm-dd, "" if missing
  reimbId: string;
  caseId: string;
  reason: string; // reimbursement reason as stored (e.g. Damaged_Warehouse)
  originalReimbType: string; // populated for reversals
  qty: number; // qtyCash + qtyInventory (negative for reversals)
  qtyCash: number;
  qtyInventory: number;
  amount: number; // negative when reversal
  isReversal: boolean;
  postSnapshot: boolean; // approvalDate > snapshotDate
};

export type AdjAnalysisRow = {
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  lossQty: number;
  misplacedQty: number;
  damagedQty: number;
  reconciledQty: number;
  unreconciledQty: number;
  claimType: AdjClaimType;
  foundQty: number;
  reversalQty: number;
  oldestLossDate: string;
  latestLossDate: string;
  oldestUnreconciledDate: string;
  daysPending: number;
  reimbQty: number;
  reimbAmount: number;
  caseCount: number;
  caseOpenCount: number;
  caseStatusTop: string;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  adjQty: number;
  effectiveReimbQty: number;
  netClaimableQty: number;
  actionStatus: AdjStatus;
  decision: AdjDecision | "mixed";
  eventDecisions: AdjEventDecision[];
  // Bucket-aware coverage (lost vs damaged).
  inboundLostQty: number; // code 5 — display-only, Shipment Recon scope
  openLost: number;
  openDamaged: number;
  lostReimbQty: number;
  damagedReimbQty: number;
  preLostReimbQty: number;
  preDamagedReimbQty: number;
  postLostReimbQty: number;
  postDamagedReimbQty: number;
  settledByAmazon: number; // sum of reconciledQty over M/E events
  foundMatchedQty: number; // F events with reconciledQty > 0
  foundFreeQty: number; // F events with unreconciledQty > 0
  claimDeadline: string; // oldest uncovered adj date + 60d, ISO; "" if none
  daysToDeadline: number; // can be negative when past deadline
  reimbDetails: AdjReimbDetail[];
};

export type AdjLogRow = {
  id: string;
  adjDate: string;
  fnsku: string;
  msku: string;
  asin: string;
  title: string;
  quantity: number;
  reason: string;
  reasonLabel: string;
  claimTag: string;
  disposition: string;
  fulfillmentCenter: string;
  reconciledQty: number;
  unreconciledQty: number;
  referenceId: string;
  store: string;
};

export type AdjReconStats = {
  totalSkus: number;
  totalLossEvents: number;
  totalLossQty: number;
  totalFoundQty: number;
  totalReconciledQty: number;
  totalUnreconciledQty: number;
  takeActionCount: number;
  takeActionQty: number;
  waitingCount: number;
  waitingQty: number;
  reconciledCount: number;
  reconciledQtyBucket: number;
  excessCount: number;
  excessQty: number;
  reimbMatchedCount: number;
  reimbMatchedQty: number;
  casesRaisedCount: number;
  casesRaisedQty: number;
};

export type AdjCaseMeta = {
  count: number;
  openCount: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  caseIds: string[];
  topStatus: string;
};

export type AdjAdjMeta = {
  qty: number;
  count: number;
  reasons: string[];
};

export type AdjReimbMeta = {
  qty: number;
  amount: number;
  count: number;
  reasons: string[];
};

// Bucket-aware reimbursement coverage per key. Backward-compat: qty/amount =
// lost + damaged so existing pivot/analysis consumers keep working.
//
// preLostQty / preDamagedQty are reimbursements with approvalDate <= snapshot
// — already baked into Amazon's reconciled column, display-only.
// postLostQty / postDamagedQty are reimbursements after the snapshot — these
// reduce open buckets in the formula.
export type AdjReimbBuckets = {
  lostQty: number;
  lostAmount: number;
  damagedQty: number;
  damagedAmount: number;
  otherQty: number;
  otherAmount: number;
  preLostQty: number;
  preDamagedQty: number;
  postLostQty: number;
  postDamagedQty: number;
  qty: number;
  amount: number;
  count: number;
  lastApprovalDate: string;
  details: AdjReimbDetail[];
};

export type AdjPivotGroupBy = "asin" | "msku";

export type AdjPivotStatus =
  | "ok"
  | "excess"
  | "reimbursed"
  | "partial"
  | "take-action";

export type AdjPivotRow = {
  key: string;
  title: string;
  qtyByReason: Record<string, number>;
  totalQty: number;
  status: AdjPivotStatus;
  reimbQty: number;
  reimbAmount: number;
  openQty: number;
  caseApprovedQty: number;
  reimbDetails: AdjReimbDetail[];
  caseCount: number;
  caseOpenCount: number;
  caseStatusTop: string;
  caseClaimedQty: number;
  caseApprovedAmount: number;
  caseIds: string;
  manualAdjQty: number;
  manualAdjCount: number;
  manualAdjReasons: string;
};

export type AdjPivotResult = {
  groupBy: AdjPivotGroupBy;
  rows: AdjPivotRow[];
  reasonCodes: string[];
};
