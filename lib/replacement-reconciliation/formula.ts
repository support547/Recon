import { trimStr } from "./matching";
import type {
  AdjMeta,
  CaseMeta,
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
const EMPTY_REIMB: ReimbMeta = { qty: 0, amount: 0, reasons: [], reimbIds: [], approvalDate: null };
const EMPTY_CASE: CaseMeta = { count: 0, approvedQty: 0, approvedAmount: 0, topStatus: "No Case", caseIds: [] };
const EMPTY_ADJ: AdjMeta = { qty: 0, count: 0 };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
}

export function computeStatus(input: {
  qty: number;
  returnQty: number;
  effectiveReimbQty: number;
}): ReplacementStatusKey {
  const { qty, returnQty, effectiveReimbQty } = input;
  if (qty <= 0) return "RETURNED";
  const covered = returnQty + effectiveReimbQty;
  if (covered >= qty) {
    if (returnQty > 0 && effectiveReimbQty > 0) return "RESOLVED";
    if (returnQty >= qty) return "RETURNED";
    if (effectiveReimbQty >= qty) return "REIMBURSED";
    return "RESOLVED";
  }
  if (covered > 0) return "PARTIAL";
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
}): ReplacementReconRow {
  const { replacement: r, returnsMap, reimbsMap, caseMap, adjMap } = input;
  const msku = trimStr(r.msku);
  const replOrd = trimStr(r.replacementOrderId);
  const origOrd = trimStr(r.originalOrderId);

  // Lookup by replOrder first, then origOrder
  const returnByRepl = replOrd ? returnsMap.get(`${msku}|${replOrd}`) : null;
  const returnByOrig = origOrd ? returnsMap.get(`${msku}|${origOrd}`) : null;

  const returnMeta: ReturnMeta = {
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

  const reimbByRepl = replOrd ? reimbsMap.get(`${msku}|${replOrd}`) : null;
  const reimbByOrig = origOrd ? reimbsMap.get(`${msku}|${origOrd}`) : null;
  const reimbMeta: ReimbMeta = {
    qty: (reimbByRepl?.qty ?? 0) + (reimbByOrig?.qty ?? 0),
    amount: (reimbByRepl?.amount ?? 0) + (reimbByOrig?.amount ?? 0),
    reasons: Array.from(new Set([...(reimbByRepl?.reasons ?? []), ...(reimbByOrig?.reasons ?? [])])),
    reimbIds: Array.from(new Set([...(reimbByRepl?.reimbIds ?? []), ...(reimbByOrig?.reimbIds ?? [])])),
    approvalDate:
      reimbByRepl?.approvalDate && reimbByOrig?.approvalDate
        ? reimbByRepl.approvalDate > reimbByOrig.approvalDate ? reimbByRepl.approvalDate : reimbByOrig.approvalDate
        : reimbByRepl?.approvalDate ?? reimbByOrig?.approvalDate ?? null,
  };

  // Case + adj keyed by msku|orderId (prefer replOrder, fallback origOrder)
  const primaryOrder = replOrd || origOrd;
  const caseMeta = primaryOrder ? caseMap.get(`${msku}|${primaryOrder}`) ?? EMPTY_CASE : EMPTY_CASE;
  const adj = primaryOrder ? adjMap.get(`${msku}|${primaryOrder}`) ?? EMPTY_ADJ : EMPTY_ADJ;

  const effectiveReimbQty = Math.max(reimbMeta.qty, caseMeta.approvedQty) + adj.qty;
  const effectiveReimbAmount = Math.max(reimbMeta.amount, caseMeta.approvedAmount);

  const status = computeStatus({
    qty: r.quantity,
    returnQty: returnMeta.qty,
    effectiveReimbQty,
  });

  return {
    id: r.id,
    shipmentDate: fmtDate(r.shipmentDate),
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
    reimbApprovalDate: fmtDate(reimbMeta.approvalDate),
    caseCount: caseMeta.count,
    caseApprovedQty: caseMeta.approvedQty,
    caseApprovedAmount: caseMeta.approvedAmount,
    caseTopStatus: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    adjQty: adj.qty,
    effectiveReimbQty,
    effectiveReimbAmount,
    status,
  };
}
