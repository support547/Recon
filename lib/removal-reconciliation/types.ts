export type TrackingDetail = {
  tracking: string;
  carrier: string;
  shipped: number;
  received: number;
  sellable: number;
  unsellable: number;
  missing: number;
};

export type RemovalReceiptStatusKey =
  | "AWAITING"
  | "PARTIAL"
  | "COMPLETE"
  | "MISSING"
  | "DAMAGED"
  | "REIMBURSED"
  | "NOT_APPLICABLE";

export type RemovalReconRow = {
  // identity
  removalId: string;
  orderId: string;
  fnsku: string;
  msku: string;

  // order
  requestDate: string;
  lastUpdated: string;
  orderStatus: string;
  orderType: string;
  orderSource: string;
  disposition: string;

  // quantities (order)
  requestedQty: number;
  cancelledQty: number;
  disposedQty: number;
  inProcessQty: number;
  expectedShipped: number;
  removalFee: number;
  currency: string;

  // shipments
  carriers: string;
  trackingNumbers: string;
  actualShipped: number;
  shipmentCount: number;
  /** Per-tracking breakdown for expandable child rows. */
  trackingDetails: TrackingDetail[];

  // receipts
  receivedQty: number;
  sellableQty: number;
  unsellableQty: number;
  missingQty: number;
  receiptCount: number;
  wrongItemCount: number;
  postActions: string;
  finalStatuses: string;

  // reimbursement (combined)
  reimbQty: number;
  reimbAmount: number;
  rrReimbQty: number;
  rrReimbAmount: number;
  ctReimbQty: number;
  ctReimbAmount: number;

  // cases
  caseCount: number;
  caseIds: string;
  caseStatusTop: string; // "No Case" | "Open" | "Approved" | "Resolved" | "Closed" | "Pending"

  // derived
  receiptStatus: RemovalReceiptStatusKey;
  isLocked: boolean;
};

export type RemovalReceiptRow = {
  id: string;
  orderId: string;
  fnsku: string;
  msku: string;
  trackingNumber: string;
  carrier: string;
  expectedQty: number;
  receivedDate: string;
  receivedQty: number;
  sellableQty: number;
  unsellableQty: number;
  missingQty: number;
  conditionReceived: string;
  notes: string;
  receivedBy: string;
  status: string;
  warehouseComment: string;
  transferTo: string;
  whStatus: string;
  wrongItemReceived: boolean;
  wrongItemNotes: string;
  sellerStatus: string;
  sellerComments: string;
  warehouseBilled: boolean;
  billedDate: string;
  billedAmount: number;
  reimbQty: number;
  reimbAmount: number;
  reshippedQty: number;
  postAction: string;
  actionRemarks: string;
  actionDate: string;
  finalStatus: string;
  caseId: string;
  caseUrl: string;
  caseStatus: string;
  caseRemark: string;
  caseTrackerId: string | null;
  // Extended receive-modal fields
  lpnNumber: string;
  binLocation: string;
  itemTitle: string;
  invoiceNumber: string;
  bolAttachmentCount: number;
  frontPhotoCount: number;
  backPhotoCount: number;
  packingListCount: number;
  bolAttachmentUrls: string[];
  frontPhotoUrls: string[];
  backPhotoUrls: string[];
  packingListUrls: string[];
  requestDate: string;
  /** Order-level total removal fee (summed across the order's removal lines). */
  removalFee: number;
};



export type RemovalReconStats = {
  totalOrders: number;
  totalQty: number;
  receivedSkus: number;
  receivedQty: number;
  awaitingSkus: number;
  awaitingQty: number;
  partialMissingSkus: number;
  partialMissingQty: number;
  reimbursedSkus: number;
  reimbursedQty: number;
  reimbursedAmount: number;
  hasCaseSkus: number;
  caseCountTotal: number;
  totalFee: number;
};

export type ShipmentTrackingDetail = {
  tracking: string;
  carrier: string;
  shipped: number;
};

export type ShipmentMeta = {
  actualShipped: number;
  shipmentCount: number;
  lastDate: Date | null;
  carriers: string[];
  trackings: string[];
  /** Per-tracking shipped detail, keyed by tracking number. */
  byTracking: Map<string, ShipmentTrackingDetail>;
};

export type ReceiptTrackingDetail = {
  received: number;
  sellable: number;
  unsellable: number;
  missing: number;
};

export type ReceiptMeta = {
  received: number;
  sellable: number;
  unsellable: number;
  missing: number;
  count: number;
  rrReimbQty: number;
  rrReimbAmount: number;
  postActions: string[];
  finalStatuses: string[];
  wrongItemCount: number;
  /** Per-tracking received detail, keyed by tracking number. */
  byTracking: Map<string, ReceiptTrackingDetail>;
};

export type CaseMeta = {
  count: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  caseIds: string[];
  topStatus: string;
};

export type ReceiveActionInput = {
  orderId: string;
  fnsku: string;
  msku: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  expectedQty: number;
  receivedDate: string | null;
  receivedQty: number;
  sellableQty: number;
  unsellableQty: number;
  conditionReceived: string;
  notes: string | null;
  receivedBy: string | null;
  warehouseComment: string | null;
  transferTo: string | null;
  whStatus: string | null;
  wrongItemReceived: boolean;
  wrongItemNotes: string | null;
  raiseCase: boolean;
  caseReason: string | null;
  unitsClaimed: number;
  amountClaimed: number;
  caseNotes: string | null;
  caseId?: string | null;
  caseUrl?: string | null;
  issueDate: string | null;
  invoiceNumber?: string | null;
  reshippedQty?: number;
  itemTitle?: string | null;
  binLocation?: string | null;
  lpnNumber?: string | null;
  bolAttachmentCount?: number;
  frontPhotoCount?: number;
  backPhotoCount?: number;
  packingListCount?: number;
  bolAttachmentUrls?: string[];
  frontPhotoUrls?: string[];
  backPhotoUrls?: string[];
  packingListUrls?: string[];
};

export type ReimbursementInput = {
  receiptId?: string | null;
  orderId: string;
  fnsku: string;
  reimbQty: number;
  reimbAmount: number;
  notes: string | null;
};

export type PostActionInput = {
  receiptId: string;
  postAction: string;
  actionRemarks: string | null;
  actionDate: string | null;
  transferTo: string | null;
  reimbQty: number;
  reimbAmount: number;
  sellerStatus: string | null;
  sellerComments: string | null;
  warehouseBilled: boolean;
  billedDate: string | null;
  billedAmount: number;
  caseRemark?: string | null;
};
