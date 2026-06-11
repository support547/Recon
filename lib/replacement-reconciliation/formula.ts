import { trimStr } from "./matching";
import type {
  AdjMeta,
  CaseMeta,
  RefundMeta,
  ReimbMeta,
  ReplacementReconRow,
  ReplacementStatusKey,
  ReturnMeta,
} from "./types";

const EMPTY_RETURN: ReturnMeta = {
  qty: 0,
  matchedOrders: [],
  matchedVia: [],
  dispositions: [],
  reasons: [],
  earliestDate: null,
};
const EMPTY_REIMB: ReimbMeta = { qty: 0, amount: 0, reasons: [], reimbIds: [], orderIds: [], approvalDate: null };
const EMPTY_CASE: CaseMeta = { count: 0, claimedQty: 0, approvedQty: 0, approvedAmount: 0, topStatus: "No Case", caseIds: [], remarks: [] };
const EMPTY_ADJ: AdjMeta = { qty: 0, count: 0 };
const EMPTY_REFUND: RefundMeta = { qty: 0, lines: [] };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
}

/** Wait window before flagging a replacement for action. Shipments newer than
 *  this are still "in flight"; at/after this age with no coverage we raise a
 *  case (TAKE_ACTION). */
export const REPLACEMENT_WAIT_DAYS = 45;

export function daysSince(d: Date | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function computeStatus(input: {
  qty: number;
  returnQty: number;
  effectiveReimbQty: number;
  refundQty: number;
  adjQty: number;
  shipmentDate?: Date | null;
}): ReplacementStatusKey {
  const { qty, returnQty, effectiveReimbQty, refundQty, adjQty, shipmentDate } = input;
  // Manual adjustment is the human override — it wins over the auto refund-loss
  // flag. A full adjustment (covers the shipped qty) marks the row settled by hand.
  if (qty > 0 && adjQty >= qty) return "ADJUSTED";
  // Refund wins over the remaining auto signals: customer kept the replacement AND
  // got their money back -> we lost the unit and the cash -> flag for action.
  if (refundQty > 0) return "TAKE_ACTION";
  if (qty <= 0) return "RETURNED";
  const covered = returnQty + effectiveReimbQty;
  if (covered >= qty) {
    if (returnQty > 0 && effectiveReimbQty > 0) return "RESOLVED";
    if (returnQty >= qty) return "RETURNED";
    if (effectiveReimbQty >= qty) return "REIMBURSED";
    return "RESOLVED";
  }
  if (covered > 0) return "PARTIAL";
  const age = daysSince(shipmentDate ?? null);
  if (age !== null && age < REPLACEMENT_WAIT_DAYS) return "WAITING_RETURN";
  return "TAKE_ACTION";
}

export function computeReplacementRow(input: {
  replacement: {
    id: string;
    shipmentDate: Date | null;
    msku: string | null;
    asin: string | null;
    quantity: number;
    replacementReasonCode: string | null;
    replacementOrderId: string | null;
    originalOrderId: string | null;
    fulfillmentCenterId: string | null;
  };
  returnsMap: Map<string, ReturnMeta>;
  reimbsMap: Map<string, ReimbMeta>;
  caseMap: Map<string, CaseMeta>;
  adjMap: Map<string, AdjMeta>;
  refundsMap: Map<string, RefundMeta>;
  returnsByAsin: Map<string, ReturnMeta>;
  reimbsByAsin: Map<string, ReimbMeta>;
}): ReplacementReconRow {
  const { replacement: r, returnsMap, reimbsMap, caseMap, adjMap, refundsMap, returnsByAsin, reimbsByAsin } = input;
  const msku = trimStr(r.msku);
  const asin = trimStr(r.asin);
  const replOrd = trimStr(r.replacementOrderId);
  const origOrd = trimStr(r.originalOrderId);

  // Lookup by replOrder first, then origOrder
  const returnByRepl = replOrd ? returnsMap.get(`${msku}|${replOrd}`) : null;
  const returnByOrig = origOrd ? returnsMap.get(`${msku}|${origOrd}`) : null;

  let returnMeta: ReturnMeta = {
    qty: (returnByRepl?.qty ?? 0) + (returnByOrig?.qty ?? 0),
    matchedOrders: Array.from(
      new Set([...(returnByRepl?.matchedOrders ?? []), ...(returnByOrig?.matchedOrders ?? [])]),
    ),
    matchedVia: [
      ...(returnByRepl ? ["Replacement Order"] : []),
      ...(returnByOrig ? ["Original Order"] : []),
    ],
    dispositions: Array.from(
      new Set([...(returnByRepl?.dispositions ?? []), ...(returnByOrig?.dispositions ?? [])]),
    ),
    reasons: Array.from(
      new Set([...(returnByRepl?.reasons ?? []), ...(returnByOrig?.reasons ?? [])]),
    ),
    earliestDate:
      returnByRepl?.earliestDate && returnByOrig?.earliestDate
        ? returnByRepl.earliestDate < returnByOrig.earliestDate ? returnByRepl.earliestDate : returnByOrig.earliestDate
        : returnByRepl?.earliestDate ?? returnByOrig?.earliestDate ?? null,
  };

  // RESCUE: msku didn't match (SKU suffix differs) — match the return by ASIN +
  // order id instead. Only when the msku lookup found nothing, so no double count.
  if (returnMeta.qty === 0 && asin) {
    const rByRepl = replOrd ? returnsByAsin.get(`${asin}|${replOrd}`) : undefined;
    const rByOrig = origOrd ? returnsByAsin.get(`${asin}|${origOrd}`) : undefined;
    const rescue = rByRepl ?? rByOrig;
    if (rescue) {
      returnMeta = {
        ...rescue,
        matchedVia: [rByRepl ? "Replacement Order (ASIN)" : "Original Order (ASIN)"],
      };
    }
  }

  const reimbByRepl = replOrd ? reimbsMap.get(`${msku}|${replOrd}`) : null;
  const reimbByOrig = origOrd ? reimbsMap.get(`${msku}|${origOrd}`) : null;
  let reimbMeta: ReimbMeta = {
    qty: (reimbByRepl?.qty ?? 0) + (reimbByOrig?.qty ?? 0),
    amount: (reimbByRepl?.amount ?? 0) + (reimbByOrig?.amount ?? 0),
    reasons: Array.from(new Set([...(reimbByRepl?.reasons ?? []), ...(reimbByOrig?.reasons ?? [])])),
    reimbIds: Array.from(new Set([...(reimbByRepl?.reimbIds ?? []), ...(reimbByOrig?.reimbIds ?? [])])),
    orderIds: Array.from(new Set([...(reimbByRepl?.orderIds ?? []), ...(reimbByOrig?.orderIds ?? [])])),
    approvalDate:
      reimbByRepl?.approvalDate && reimbByOrig?.approvalDate
        ? reimbByRepl.approvalDate > reimbByOrig.approvalDate ? reimbByRepl.approvalDate : reimbByOrig.approvalDate
        : reimbByRepl?.approvalDate ?? reimbByOrig?.approvalDate ?? null,
  };

  // RESCUE: same SKU-suffix problem for reimbursements — match by ASIN + order id
  // only when the msku lookup found nothing.
  if (reimbMeta.qty === 0 && reimbMeta.amount === 0 && asin) {
    const mByRepl = replOrd ? reimbsByAsin.get(`${asin}|${replOrd}`) : undefined;
    const mByOrig = origOrd ? reimbsByAsin.get(`${asin}|${origOrd}`) : undefined;
    const rescue = mByRepl ?? mByOrig;
    if (rescue) reimbMeta = { ...rescue };
  }

  // Refund qty (display only) — dual lookup, sum repl + orig order
  const refundByRepl = replOrd ? refundsMap.get(`${msku}|${replOrd}`) : null;
  const refundByOrig = origOrd ? refundsMap.get(`${msku}|${origOrd}`) : null;
  const refundQty =
    (refundByRepl?.qty ?? EMPTY_REFUND.qty) + (refundByOrig?.qty ?? EMPTY_REFUND.qty);
  const refundLines = [
    ...(refundByRepl?.lines ?? []),
    ...(refundByOrig?.lines ?? []),
  ];

  // Case + adj keyed by msku|orderId (prefer replOrder, fallback origOrder)
  const primaryOrder = replOrd || origOrd;
  const caseMeta = primaryOrder ? caseMap.get(`${msku}|${primaryOrder}`) ?? EMPTY_CASE : EMPTY_CASE;
  const adj = primaryOrder ? adjMap.get(`${msku}|${primaryOrder}`) ?? EMPTY_ADJ : EMPTY_ADJ;

  const effectiveReimbQty = Math.max(reimbMeta.qty, caseMeta.approvedQty) + adj.qty;
  const effectiveReimbAmount = Math.max(reimbMeta.amount, caseMeta.approvedAmount);

  // Clamp combined coverage to units actually shipped — returns can match on both
  // the replacement and original order, inflating the sum past `quantity`.
  const coveredQty = r.quantity > 0
    ? Math.min(r.quantity, returnMeta.qty + effectiveReimbQty)
    : returnMeta.qty + effectiveReimbQty;

  const status = computeStatus({
    qty: r.quantity,
    returnQty: returnMeta.qty,
    effectiveReimbQty,
    refundQty,
    adjQty: adj.qty,
    shipmentDate: r.shipmentDate,
  });

  return {
    id: r.id,
    shipmentDate: fmtDate(r.shipmentDate),
    daysSinceShipment: daysSince(r.shipmentDate),
    msku: msku || "—",
    asin: trimStr(r.asin) || "—",
    quantity: r.quantity,
    replacementReasonCode: trimStr(r.replacementReasonCode) || "—",
    replacementOrderId: replOrd || "—",
    originalOrderId: origOrd || "—",
    fulfillmentCenterId: trimStr(r.fulfillmentCenterId) || "—",
    returnQty: returnMeta.qty,
    matchedReturnOrder: returnMeta.matchedOrders.join(", "),
    returnMatchedVia: returnMeta.matchedVia.join(", "),
    returnDispositions: returnMeta.dispositions.join(", "),
    returnReasons: returnMeta.reasons.join(", "),
    returnDate: fmtDate(returnMeta.earliestDate),
    reimbQty: reimbMeta.qty,
    reimbAmount: reimbMeta.amount,
    reimbReason: reimbMeta.reasons.join(", "),
    reimbIds: reimbMeta.reimbIds.join(", "),
    reimbOrderIds: reimbMeta.orderIds.join(", "),
    reimbApprovalDate: fmtDate(reimbMeta.approvalDate),
    refundQty,
    refundLines,
    caseCount: caseMeta.count,
    caseClaimedQty: caseMeta.claimedQty,
    caseApprovedQty: caseMeta.approvedQty,
    caseApprovedAmount: caseMeta.approvedAmount,
    caseTopStatus: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    caseRemarks: caseMeta.remarks.join("; "),
    adjQty: adj.qty,
    effectiveReimbQty,
    effectiveReimbAmount,
    coveredQty,
    status,
  };
}
