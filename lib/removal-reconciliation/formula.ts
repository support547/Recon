import type {
  CaseMeta,
  ReceiptMeta,
  RemovalReceiptStatusKey,
  RemovalReconRow,
  ShipmentMeta,
} from "./types";
import { key, lookupCase } from "./matching";

const EMPTY_SHIPMENT: ShipmentMeta = {
  actualShipped: 0,
  shipmentCount: 0,
  lastDate: null,
  carriers: [],
  trackings: [],
};

const EMPTY_RECEIPT: ReceiptMeta = {
  received: 0,
  sellable: 0,
  unsellable: 0,
  missing: 0,
  count: 0,
  rrReimbQty: 0,
  rrReimbAmount: 0,
  postActions: [],
  finalStatuses: [],
  wrongItemCount: 0,
};

const EMPTY_CASE: CaseMeta = {
  count: 0,
  claimedQty: 0,
  approvedQty: 0,
  approvedAmount: 0,
  caseIds: [],
  topStatus: "No Case",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "—";
  }
}

export function computeRemovalRow(input: {
  removal: {
    id: string;
    orderId: string | null;
    fnsku: string | null;
    msku: string | null;
    requestDate: Date | null;
    lastUpdated: Date | null;
    orderStatus: string | null;
    orderType: string | null;
    orderSource: string | null;
    disposition: string | null;
    quantity: number;
    cancelledQty: number;
    disposedQty: number;
    inProcessQty: number;
    removalFee: { toString(): string } | null;
    currency: string | null;
  };
  shipmentMap: Map<string, ShipmentMeta>;
  receiptMap: Map<string, ReceiptMeta>;
  caseMap: Map<string, CaseMeta>;
}): RemovalReconRow {
  const { removal, shipmentMap, receiptMap, caseMap } = input;
  const orderId = (removal.orderId ?? "").trim();
  const fnsku = (removal.fnsku ?? "").trim();
  const k = key(orderId, fnsku);

  const shipment = shipmentMap.get(k) ?? EMPTY_SHIPMENT;
  const receipt = receiptMap.get(k) ?? EMPTY_RECEIPT;
  const caseMeta = lookupCase(caseMap, orderId, fnsku) ?? EMPTY_CASE;

  const requestedQty = removal.quantity || 0;
  const cancelledQty = removal.cancelledQty || 0;
  const disposedQty = removal.disposedQty || 0;
  const expectedShipped = Math.max(0, requestedQty - cancelledQty - disposedQty);

  const rrReimbQty = receipt.rrReimbQty;
  const rrReimbAmount = receipt.rrReimbAmount;
  const ctReimbQty = caseMeta.approvedQty;
  const ctReimbAmount = caseMeta.approvedAmount;
  const reimbQty = rrReimbQty > 0 ? rrReimbQty : ctReimbQty;
  const reimbAmount = rrReimbAmount > 0 ? rrReimbAmount : ctReimbAmount;

  const orderStatus = (removal.orderStatus ?? "").trim();
  const orderStatusLc = orderStatus.toLowerCase();
  const isCompleted = orderStatusLc === "completed";

  let receiptStatus: RemovalReceiptStatusKey;
  if (reimbQty > 0) {
    receiptStatus = "REIMBURSED";
  } else if (receipt.count === 0 && isCompleted && shipment.actualShipped > 0) {
    receiptStatus = "AWAITING";
  } else if (receipt.count === 0) {
    receiptStatus = "NOT_APPLICABLE";
  } else if (receipt.unsellable > 0 && receipt.sellable === 0) {
    receiptStatus = "DAMAGED";
  } else if (expectedShipped > 0 && receipt.received >= expectedShipped) {
    receiptStatus = "COMPLETE";
  } else if (receipt.received > 0) {
    receiptStatus = "PARTIAL";
  } else if (receipt.missing > 0) {
    receiptStatus = "MISSING";
  } else {
    receiptStatus = "AWAITING";
  }

  const isLocked = receipt.received > 0 || reimbQty > 0;

  const removalFee = removal.removalFee ? Number(removal.removalFee.toString()) : 0;

  return {
    removalId: removal.id,
    orderId: orderId || "—",
    fnsku: fnsku || "—",
    msku: (removal.msku ?? "").trim() || "—",
    requestDate: fmtDate(removal.requestDate),
    lastUpdated: fmtDate(removal.lastUpdated),
    orderStatus: orderStatus || "—",
    orderType: (removal.orderType ?? "").trim() || "—",
    orderSource: (removal.orderSource ?? "").trim() || "—",
    disposition: (removal.disposition ?? "").trim() || "—",
    requestedQty,
    cancelledQty,
    disposedQty,
    inProcessQty: removal.inProcessQty || 0,
    expectedShipped,
    removalFee,
    currency: (removal.currency ?? "USD").trim() || "USD",
    carriers: shipment.carriers.join(", "),
    trackingNumbers: shipment.trackings.join(" | "),
    actualShipped: shipment.actualShipped,
    shipmentCount: shipment.shipmentCount,
    receivedQty: receipt.received,
    sellableQty: receipt.sellable,
    unsellableQty: receipt.unsellable,
    missingQty: receipt.missing,
    receiptCount: receipt.count,
    wrongItemCount: receipt.wrongItemCount,
    postActions: receipt.postActions.join(", "),
    finalStatuses: receipt.finalStatuses.join(", "),
    reimbQty,
    reimbAmount,
    rrReimbQty,
    rrReimbAmount,
    ctReimbQty,
    ctReimbAmount,
    caseCount: caseMeta.count,
    caseIds: caseMeta.caseIds.join(", "),
    caseStatusTop: caseMeta.topStatus,
    receiptStatus,
    isLocked,
  };
}
