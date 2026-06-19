export type FullReconStatus =
  | "Matched"
  | "Over"
  | "Take Action"
  | "Reimbursed"
  | "No Snapshot";

export type ReplStatus = "Covered" | "Partial" | "Pending" | "";
export type FcStatus = "Balanced" | "Excess" | "Take Action" | "Waiting" | "";

export type ShipmentDetail = {
  shipmentId: string;
  shipDate: string;
  qty: number;
  status: string;
  receiptDate: string;
};

export type ReceiptDetail = {
  shipmentId: string;
  qty: number;
  fc: string;
  receiptDate: string;
};

export type ReturnDetail = {
  qty: number;
  status: string;
  disp: string;
  reason: string;
  orders: string;
};

export type ReimbDetail = {
  qty: number;
  amount: number;
  reason: string;
  orderId: string;
  caseId: string;
};

export type RemovalRcptDetail = {
  orderId: string;
  qty: number;
  sellable: number;
  unsellable: number;
  condition: string;
  status: string;
  date: string;
};

export type GnrDetail = {
  usedMsku: string;
  usedFnsku: string;
  condition: string;
  qty: number;
  succeeded: number;
  failed: number;
};

export type FullReconRow = {
  fnsku: string;
  msku: string;
  title: string;
  asin: string;
  latestCloseDate: string;
  shippedQty: number;
  receiptQty: number;
  receiptDetails: ReceiptDetail[];
  shortageQty: number;
  soldQty: number;
  latestRecvDate: string;
  latestSaleDate: string;
  daysRecvToSale: number | null;
  shipmentStatuses: string;
  shipmentDetails: ShipmentDetail[];
  returnQty: number;
  returnDetails: ReturnDetail[];
  reimbQty: number;
  reimbAmt: number;
  reimbDetails: ReimbDetail[];
  removalRcptQty: number;
  removalRcptDetails: RemovalRcptDetail[];
  gnrQty: number;
  gnrSucceeded: number;
  gnrFailed: number;
  gnrDetails: GnrDetail[];
  caseCount: number;
  caseStatuses: string;
  caseReimbQty: number;
  caseReimbAmt: number;
  adjQty: number;
  adjCount: number;
  replQty: number;
  replReturnQty: number;
  replReimbQty: number;
  replReimbAmt: number;
  replStatus: ReplStatus;
  fcNetQty: number;
  fcInQty: number;
  fcOutQty: number;
  fcEventDays: number;
  fcEarliestDate: string;
  fcLatestDate: string;
  fcDaysPending: number;
  fcStatus: FcStatus;
  fbaEndingBalance: number | null;
  fbaSummaryDate: string;
  fbaVendorReturns: number;
  fbaFound: number;
  fbaLost: number;
  fbaDamaged: number;
  fbaDisposed: number;
  fbaOther: number;
  fbaUnknown: number;
  fbaAdjTotal: number;
  endingBalance: number;
  reconStatus: FullReconStatus;
  // Shipment-recon view: same FNSKU but using shipment-recon's data filters
  // (Lost_Inbound reimbs, SHIPMENT-typed cases & adjustments). Surfaced in
  // the Shortage cell hover so the Full-Recon tooltip mirrors Shipment Recon.
  shipmentReimbQty: number;
  shipmentReimbAmt: number;
  shipmentCaseCount: number;
  shipmentCaseTopStatus: string;
  shipmentCaseClaimed: number;
  shipmentCaseApproved: number;
  shipmentAdjQty: number;
};

export type FullReconStats = {
  totalFnskus: number;
  totalMskus: number;
  totalShipped: number;
  totalReceived: number;
  totalShortage: number;
  totalSold: number;
  matched: number;
  over: number;
  takeAction: number;
  reimbursed: number;
  noSnapshot: number;
  takeActionVariance: number;
};
