export type ReplacementStatusKey =
  | "TAKE_ACTION"
  | "PARTIAL"
  | "RETURNED"
  | "REIMBURSED"
  | "RESOLVED";

export type ReplacementReconRow = {
  id: string;
  shipmentDate: string;
  msku: string;
  asin: string;
  quantity: number;
  replacementReasonCode: string;
  replacementOrderId: string;
  originalOrderId: string;
  fulfillmentCenterId: string;
  // returns
  returnQty: number;
  matchedReturnOrder: string;
  returnMatchedVia: string;
  returnDispositions: string;
  returnReasons: string;
  returnDate: string;
  // db reimb (reimbursements w/ replace reason)
  reimbQty: number;
  reimbAmount: number;
  reimbReason: string;
  reimbIds: string;
  reimbApprovalDate: string;
  // case overlay
  caseCount: number;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  caseTopStatus: string;
  caseIds: string;
  // adj overlay
  adjQty: number;
  // computed
  effectiveReimbQty: number;
  effectiveReimbAmount: number;
  status: ReplacementStatusKey;
};

export type ReplacementLogRow = {
  id: string;
  shipmentDate: string;
  msku: string;
  asin: string;
  quantity: number;
  fulfillmentCenterId: string;
  originalFulfillmentCenterId: string;
  replacementReasonCode: string;
  replacementOrderId: string;
  originalOrderId: string;
};

export type ReplacementReconStats = {
  totalSkus: number;
  totalQty: number;
  returnsMatchedSkus: number;
  returnsMatchedQty: number;
  reimbSkus: number;
  reimbQty: number;
  reimbAmount: number;
  takeActionSkus: number;
  takeActionQty: number;
};

export type ReturnMeta = {
  qty: number;
  matchedOrders: string[];
  matchedVia: string[];
  dispositions: string[];
  reasons: string[];
  earliestDate: Date | null;
};

export type ReimbMeta = {
  qty: number;
  amount: number;
  reasons: string[];
  reimbIds: string[];
  approvalDate: Date | null;
};

export type CaseMeta = {
  count: number;
  approvedQty: number;
  approvedAmount: number;
  topStatus: string;
  caseIds: string[];
};

export type AdjMeta = {
  qty: number;
  count: number;
};

export type RaiseCaseInput = {
  msku: string;
  asin: string | null;
  orderId: string;
  caseId: string | null;
  caseReason: string;
  unitsClaimed: number;
  amountClaimed: number;
  status: string;
  notes: string | null;
};

export type AdjustmentInput = {
  msku: string;
  asin: string | null;
  orderId: string;
  adjType: string;
  qtyAdjusted: number;
  reason: string;
  adjDate: string | null;
  notes: string | null;
};
