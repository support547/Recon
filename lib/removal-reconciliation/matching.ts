import type { CaseMeta, ReceiptMeta, ShipmentMeta } from "./types";

export function key(orderId: string | null | undefined, fnsku: string | null | undefined): string {
  return `${(orderId ?? "").trim()}|${(fnsku ?? "").trim()}`;
}

export function buildShipmentMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    shippedQty: number;
    carrier: string | null;
    trackingNumber: string | null;
    shipmentDate: Date | null;
  }[],
): Map<string, ShipmentMeta> {
  const map = new Map<string, ShipmentMeta>();
  for (const r of rows) {
    const k = key(r.orderId, r.fnsku);
    if (!k || k === "|") continue;
    const prev = map.get(k) ?? {
      actualShipped: 0,
      shipmentCount: 0,
      lastDate: null,
      carriers: [],
      trackings: [],
    };
    prev.actualShipped += r.shippedQty || 0;
    if (r.trackingNumber) {
      prev.shipmentCount++;
      if (!prev.trackings.includes(r.trackingNumber)) prev.trackings.push(r.trackingNumber);
    }
    if (r.carrier && !prev.carriers.includes(r.carrier)) prev.carriers.push(r.carrier);
    if (r.shipmentDate && (!prev.lastDate || r.shipmentDate > prev.lastDate)) {
      prev.lastDate = r.shipmentDate;
    }
    map.set(k, prev);
  }
  return map;
}

export function buildReceiptMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    receivedQty: number;
    sellableQty: number;
    unsellableQty: number;
    missingQty: number;
    reimbQty: number;
    reimbAmount: { toString(): string } | null;
    postAction: string | null;
    finalStatus: string | null;
    wrongItemReceived: boolean;
  }[],
): Map<string, ReceiptMeta> {
  const map = new Map<string, ReceiptMeta>();
  for (const r of rows) {
    const k = key(r.orderId, r.fnsku);
    if (!k || k === "|") continue;
    const prev = map.get(k) ?? {
      received: 0,
      sellable: 0,
      unsellable: 0,
      missing: 0,
      count: 0,
      rrReimbQty: 0,
      rrReimbAmount: 0,
      postActions: [] as string[],
      finalStatuses: [] as string[],
      wrongItemCount: 0,
    };
    prev.received += r.receivedQty || 0;
    prev.sellable += r.sellableQty || 0;
    prev.unsellable += r.unsellableQty || 0;
    prev.missing += r.missingQty || 0;
    prev.count++;
    prev.rrReimbQty += r.reimbQty || 0;
    prev.rrReimbAmount += r.reimbAmount ? Number(r.reimbAmount.toString()) : 0;
    if (r.postAction && !prev.postActions.includes(r.postAction)) prev.postActions.push(r.postAction);
    if (r.finalStatus && !prev.finalStatuses.includes(r.finalStatus)) prev.finalStatuses.push(r.finalStatus);
    if (r.wrongItemReceived) prev.wrongItemCount++;
    map.set(k, prev);
  }
  return map;
}

const CASE_STATUS_PRI: Record<string, number> = {
  RESOLVED: 5,
  IN_PROGRESS: 4,
  OPEN: 3,
  REJECTED: 2,
  CLOSED: 1,
};

const CASE_STATUS_LABEL: Record<string, string> = {
  RESOLVED: "Resolved",
  IN_PROGRESS: "In Progress",
  OPEN: "Open",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export function buildCaseMap(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    unitsClaimed: number;
    unitsApproved: number;
    amountApproved: { toString(): string } | null;
    status: string;
    referenceId: string | null;
  }[],
): Map<string, CaseMeta> {
  const map = new Map<string, CaseMeta>();
  for (const r of rows) {
    const orderId = (r.orderId ?? "").trim();
    if (!orderId) continue;
    // also key per (orderId|fnsku) so per-row matching works
    const keys = [`${orderId}|${(r.fnsku ?? "").trim()}`, `${orderId}|`];
    const statusKey = (r.status ?? "").toUpperCase();
    const rank = CASE_STATUS_PRI[statusKey] ?? 0;
    for (const k of keys) {
      const prev = map.get(k) ?? {
        count: 0,
        claimedQty: 0,
        approvedQty: 0,
        approvedAmount: 0,
        caseIds: [] as string[],
        topStatus: "No Case",
      };
      prev.count++;
      prev.claimedQty += r.unitsClaimed || 0;
      prev.approvedQty += r.unitsApproved || 0;
      prev.approvedAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
      if (r.referenceId && !prev.caseIds.includes(r.referenceId)) prev.caseIds.push(r.referenceId);
      const currentRank = CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
      if (rank > currentRank) {
        prev.topStatus = CASE_STATUS_LABEL[statusKey] ?? "Pending";
      }
      map.set(k, prev);
    }
  }
  return map;
}

export function lookupCase(map: Map<string, CaseMeta>, orderId: string, fnsku: string): CaseMeta | undefined {
  const specific = map.get(`${orderId.trim()}|${fnsku.trim()}`);
  if (specific) return specific;
  return map.get(`${orderId.trim()}|`);
}
