export type AdjActionStatus = "take-action" | "waiting" | "reconciled" | "excess";
export type AdjClaimType = "Lost_Warehouse" | "Damaged_Warehouse" | "Mixed" | "None";

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
  actionStatus: AdjActionStatus;
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

export type AdjPivotGroupBy = "asin" | "msku";

export type AdjPivotStatus = "ok" | "excess" | "take-action";

export type AdjPivotRow = {
  key: string;
  title: string;
  qtyByReason: Record<string, number>;
  totalQty: number;
  status: AdjPivotStatus;
  reimbQty: number;
  reimbAmount: number;
  caseCount: number;
  caseOpenCount: number;
  caseStatusTop: string;
};

export type AdjPivotResult = {
  groupBy: AdjPivotGroupBy;
  rows: AdjPivotRow[];
  reasonCodes: string[];
};
