export type FcActionStatus = "take-action" | "waiting" | "excess";

export type FcSummaryRow = {
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  eventCount: number;
  netQty: number;
  qtyIn: number;
  qtyOut: number;
  eventTypes: string;
  fulfillmentCenters: string;
  earliest: string;
  latest: string;
  caseCount: number;
  caseStatusTop: string;
  caseApprovedQty: number;
  caseApprovedAmount: number;
};

export type FcAnalysisRow = {
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  netQty: number;
  qtyIn: number;
  qtyOut: number;
  eventDays: number;
  earliestDate: string;
  latestDate: string;
  imbalanceStart: string;
  daysPending: number;
  actionStatus: FcActionStatus;
  fcs: string;
  caseCount: number;
  caseOpenCount: number;
  caseStatusTop: string;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  adjQty: number;
  effectiveReimbQty: number;
  reimbursed: boolean;
};

export type FcLogRow = {
  id: string;
  transferDate: string;
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  quantity: number;
  eventType: string;
  fulfillmentCenter: string;
  disposition: string;
  reason: string;
};

export type FcReconStats = {
  totalSkus: number;
  totalEvents: number;
  totalQtyIn: number;
  totalQtyOut: number;
  takeActionCount: number;
  takeActionQty: number;
  waitingCount: number;
  waitingQty: number;
  excessCount: number;
  excessQty: number;
  totalUnresolved: number;
  totalUnresolvedQty: number;
  casesRaisedCount: number;
  casesRaisedQty: number;
  reimbursedCount: number;
  reimbursedQty: number;
};

export type FcCaseMeta = {
  count: number;
  openCount: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  caseIds: string[];
  topStatus: string;
};

export type FcAdjMeta = {
  qty: number;
  count: number;
  reasons: string[];
};
