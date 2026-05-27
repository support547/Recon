export type FnskuStatusKey =
  | "MATCHED_FNSKU"
  | "FNSKU_MISMATCH"
  | "ORDER_NOT_FOUND";

export type ReturnsReconRow = {
  orderId: string;
  returnFnsku: string;
  msku: string;
  asin: string;
  title: string;
  totalReturned: number;
  returnEvents: number;
  dispositions: string;
  reasons: string;
  reimbQty: number;
  reimbAmount: number;
  caseReimbQty: number;
  caseReimbAmount: number;
  adjQty: number;
  effReimbQty: number;
  effReimbAmount: number;
  salesFnsku: string;
  salesMsku: string;
  fnskuStatus: FnskuStatusKey;
  caseCount: number;
  caseStatusTop: string;
  caseIds: string;
  earliestReturn: string;
  latestReturn: string;
  isSellable: boolean;
};

export type ReturnsLogRow = {
  id: string;
  returnDate: string;
  msku: string;
  fnsku: string;
  orderId: string;
  title: string;
  quantity: number;
  disposition: string;
  detailedDisposition: string;
  reason: string;
  status: string;
  fulfillmentCenter: string;
  licensePlateNumber: string;
  caseId: string;
};

export type ReturnsReconStats = {
  totalRows: number;
  totalQty: number;
  matchedSkus: number;
  matchedQty: number;
  mismatchSkus: number;
  mismatchQty: number;
  notFoundSkus: number;
  notFoundQty: number;
  reimbSkus: number;
  reimbAmount: number;
  withCaseSkus: number;
  sellableSkus: number;
};

export type SalesFnskuMeta = {
  orderExists: boolean;
  fnskuSet: Set<string>;
  msku: string;
};

export type ReimbMeta = {
  qty: number;
  amount: number;
};

export type CaseMeta = {
  count: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  caseIds: string[];
  topStatus: string;
};

export type AdjMeta = {
  qty: number;
  count: number;
  reasons: string[];
};

export type RaiseCaseInput = {
  orderId: string;
  msku: string;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  caseId: string | null;
  caseReason: string;
  unitsClaimed: number;
  amountClaimed: number;
  status: string;
  notes: string | null;
};

export type AdjustmentInput = {
  orderId: string;
  msku: string;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  adjType: string;
  qtyAdjusted: number;
  reason: string;
  adjDate: string | null;
  notes: string | null;
};

// ============================================================
// ASIN Verification (additive — does not affect existing Returns Recon)
// ============================================================

export type AsinMatchStatus =
  | "FULLY_VERIFIED"
  | "ASIN_MISMATCH"
  | "MSKU_MISMATCH"
  | "MULTI_MISMATCH"
  | "NOT_IN_CATALOG"
  | "ORDER_NOT_FOUND";

export type AsinVerificationRow = {
  orderId: string;
  returnFnsku: string;
  returnAsin: string;
  returnMsku: string;
  returnTitle: string;
  returnedQty: number;
  returnEvents: number;
  disposition: string;
  reasons: string;
  salesAsin: string;
  salesMsku: string;
  salesFnsku: string;
  catalogAsin: string;
  catalogMsku: string;
  catalogTitle: string;
  asinMatch: boolean;
  mskuMatch: boolean;
  matchStatus: AsinMatchStatus;
  matchScore: number; // 0..3 (fnsku + asin + msku)
  isSellable: boolean;
  isSellableMismatch: boolean;
  caseCount: number;
  caseStatusTop: string;
  caseIds: string;
  reimbQty: number;
  reimbAmount: number;
  earliestReturn: string;
  latestReturn: string;
};

export type AsinVerificationStats = {
  total: number;
  totalQty: number;
  verifiedCount: number;
  verifiedQty: number;
  asinMismatchCount: number;
  asinMismatchQty: number;
  mskuMismatchCount: number;
  mskuMismatchQty: number;
  multiMismatchCount: number;
  multiMismatchQty: number;
  notInCatalogCount: number;
  notInCatalogQty: number;
  orderNotFoundCount: number;
  orderNotFoundQty: number;
  sellableMismatchCount: number;
  sellableMismatchQty: number;
};

export type SalesOrderDetailMeta = {
  fnskuSet: Set<string>;
  asinSet: Set<string>;
  mskuSet: Set<string>;
};

export type CatalogMeta = {
  msku: string;
  asin: string;
  title: string;
};
