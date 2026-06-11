export type ReplacementStatusKey =
  | "TAKE_ACTION"
  | "WAITING_RETURN"
  | "PARTIAL"
  | "RETURNED"
  | "REIMBURSED"
  | "ADJUSTED"
  | "RESOLVED";

export type ReplacementReconRow = {
  id: string;
  shipmentDate: string;
  daysSinceShipment: number | null;
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
  reimbOrderIds: string;
  reimbApprovalDate: string;
  // refund qty (from PaymentRepository, lineType=Refund) — display only
  refundQty: number;
  refundLines: RefundLine[];
  // case overlay
  caseCount: number;
  caseClaimedQty: number;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  caseTopStatus: string;
  caseIds: string;
  caseRemarks: string;
  // adj overlay
  adjQty: number;
  // computed
  effectiveReimbQty: number;
  effectiveReimbAmount: number;
  /** Coverage clamped to `quantity`: min(quantity, returnQty + effectiveReimbQty).
   *  A replacement can be matched to returns on BOTH its replacement order and
   *  its original order (and separately reimbursed), which can sum past the
   *  units actually shipped. Status and KPI pending math use this clamped value
   *  so a single replacement is never counted as over-covered. Raw returnQty /
   *  effectiveReimbQty stay un-clamped for display + drill-down. */
  coveredQty: number;
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
  adjSkus: number;
  adjQty: number;
  takeActionSkus: number;
  takeActionQty: number;
  waitingReturnSkus: number;
  waitingReturnQty: number;
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
  orderIds: string[];
  approvalDate: Date | null;
};

export type RefundLine = {
  orderId: string;
  qty: number;
  amount: number;
  settlementId: string;
  date: string;
};

export type RefundMeta = {
  qty: number;
  lines: RefundLine[];
};

export type CaseMeta = {
  count: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  topStatus: string;
  caseIds: string[];
  remarks: string[];
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
