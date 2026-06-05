export type OwnershipStatus =
  | "CONFIRMED"
  | "GNR_TRACKING"
  | "UNKNOWN_GNR"
  | "ORDER_NOT_FOUND";

export type InventoryStatus =
  | "IN_INVENTORY"
  | "NOT_IN_INVENTORY"
  | "PENDING_SUMMARY"
  | "NOT_APPLICABLE";

export type ReimbStatus =
  | "REIMBURSED_CASH"
  | "REIMBURSED_INVENTORY"
  | "REIMBURSED_UNVERIFIED"
  | "NOT_REIMBURSED"
  | "NOT_APPLICABLE";

export type FinalStatus =
  | "RESOLVED"
  | "PENDING"
  | "CASE_NEEDED"
  | "GNR_TRACKING"
  | "UNKNOWN_GNR_CASE"
  | "TRANSFERRED_TO_GNR"  // damaged return transferred to GNR via LPN match
  | "INVESTIGATE";

export type GnrBridgeMeta = {
  originalFnsku: string;
  originalMsku: string;
  usedFnsku: string;
  usedMsku: string;
  unitStatus: string;
  orderId: string;
};

export type ReimbMeta = {
  qty: number;
  qtyCash: number;
  qtyInventory: number;
  amount: number;
  reimbType: "CASH" | "INVENTORY" | "BOTH" | "NONE";
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

export type SalesMeta = {
  msku: string;
  fnsku: string;
  asin: string;
};

export type FbaSummaryMeta = {
  confirmedQty: number;
  latestSummaryDate: Date | null;
};

export type ReturnsReconRow = {
  orderId: string;
  returnFnsku: string;
  lpn: string;
  msku: string;
  asin: string;
  title: string;
  totalReturned: number;
  sellableQty: number;
  unsellableQty: number;
  returnEvents: number;
  dispositions: string;
  reasons: string;
  isSellable: boolean;
  isGnrMsku: boolean;
  amazonStatus: string;
  ownershipStatus: OwnershipStatus;
  salesMsku: string;
  gnrStatus: string;
  inventoryStatus: InventoryStatus;
  fbaSummaryConfirmedQty: number;
  fbaSummaryExpectedQty: number;
  reimbStatus: ReimbStatus;
  reimbQty: number;
  reimbCashQty: number;
  reimbInventoryQty: number;
  reimbAmount: number;
  caseCount: number;
  caseReimbQty: number;
  caseReimbAmount: number;
  caseStatusTop: string;
  caseIds: string;
  adjQty: number;
  effReimbQty: number;
  effReimbAmount: number;
  earliestReturn: string;
  latestReturn: string;
  daysSinceReturn: number;
  isWithinWindow: boolean;
  finalStatus: FinalStatus;
};

export type ReturnsReconStats = {
  totalRows: number;
  totalQty: number;
  sellableQty: number;
  unsellableQty: number;
  confirmedRows: number;
  confirmedQty: number;
  gnrTrackingRows: number;
  gnrTrackingQty: number;
  unknownGnrRows: number;
  orderNotFoundRows: number;
  orderNotFoundQty: number;
  inInventoryRows: number;
  inInventoryQty: number;
  notInInventoryRows: number;
  notInInventoryQty: number;
  reimbursedRows: number;
  reimbAmount: number;
  resolvedRows: number;
  pendingRows: number;
  caseNeededRows: number;
  unknownGnrCaseRows: number;
  transferredToGnrRows: number;
  transferredToGnrQty: number;
  investigateRows: number;
  withCaseRows: number;
};

export type RaiseCaseInput = {
  orderId: string; msku: string; fnsku: string | null;
  asin: string | null; title: string | null; caseId: string | null;
  caseReason: string; unitsClaimed: number; amountClaimed: number;
  status: string; notes: string | null;
};

export type AdjustmentInput = {
  orderId: string; msku: string; fnsku: string | null;
  asin: string | null; title: string | null; adjType: string;
  qtyAdjusted: number; reason: string;
  adjDate: string | null; notes: string | null;
};

export type AsinMatchStatus =
  | "FULLY_VERIFIED" | "ASIN_MISMATCH" | "MSKU_MISMATCH"
  | "MULTI_MISMATCH" | "NOT_IN_CATALOG" | "ORDER_NOT_FOUND";

export type AsinVerificationRow = {
  orderId: string; returnFnsku: string; returnAsin: string;
  returnMsku: string; returnTitle: string; returnedQty: number;
  returnEvents: number; disposition: string; reasons: string;
  salesAsin: string; salesMsku: string; salesFnsku: string;
  catalogAsin: string; catalogMsku: string; catalogTitle: string;
  asinMatch: boolean; mskuMatch: boolean;
  matchStatus: AsinMatchStatus; matchScore: number;
  isSellable: boolean; isSellableMismatch: boolean;
  caseCount: number; caseStatusTop: string; caseIds: string;
  reimbQty: number; reimbAmount: number;
  earliestReturn: string; latestReturn: string;
};

export type AsinVerificationStats = {
  total: number; totalQty: number;
  verifiedCount: number; verifiedQty: number;
  asinMismatchCount: number; asinMismatchQty: number;
  mskuMismatchCount: number; mskuMismatchQty: number;
  multiMismatchCount: number; multiMismatchQty: number;
  notInCatalogCount: number; notInCatalogQty: number;
  orderNotFoundCount: number; orderNotFoundQty: number;
  sellableMismatchCount: number; sellableMismatchQty: number;
};

export type SalesOrderDetailMeta = {
  fnskuSet: Set<string>; asinSet: Set<string>; mskuSet: Set<string>;
};
