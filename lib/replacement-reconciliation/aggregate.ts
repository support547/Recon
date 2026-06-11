import type { ReplacementReconRow, ReplacementReconStats } from "./types";

export function summaryStats(rows: ReplacementReconRow[]): ReplacementReconStats {
  const totalSkus = rows.length;
  let totalQty = 0;
  let returnsMatchedSkus = 0;
  let returnsMatchedQty = 0;
  let reimbSkus = 0;
  let reimbQty = 0;
  let reimbAmount = 0;
  let adjSkus = 0;
  let adjQty = 0;
  let takeActionSkus = 0;
  let takeActionQty = 0;
  let waitingReturnSkus = 0;
  let waitingReturnQty = 0;

  for (const r of rows) {
    totalQty += r.quantity;
    // Cap matched quantities at units shipped so a replacement matched on both
    // its replacement and original order can't inflate the totals past quantity.
    const cappedReturnQty = Math.min(r.returnQty, r.quantity);

    // Cards count by FINAL STATUS so a refund-loss row (forced to TAKE_ACTION)
    // is never double-counted as Returns/Reimbursed even if it has some
    // return/reimb qty. Returned-to-inventory outcome = RETURNED or RESOLVED;
    // cash outcome = REIMBURSED.
    if (r.status === "RETURNED" || r.status === "RESOLVED") {
      returnsMatchedSkus++;
      returnsMatchedQty += cappedReturnQty;
    }
    if (r.status === "REIMBURSED") {
      reimbSkus++;
      reimbQty += r.effectiveReimbQty;
      reimbAmount += r.effectiveReimbAmount;
    }
    if (r.adjQty !== 0) {
      adjSkus++;
      adjQty += r.adjQty;
    }

    // Refund = unit lost AND cash refunded. A refund row can be fully "covered"
    // by a return/reimb match (coveredQty == quantity -> pending 0), yet it's a
    // real loss. Floor the lost units at the refunded units so the Take Action
    // KPI never reads 0 for a genuine refund loss. Non-refund rows unchanged.
    const lostToRefund = Math.min(r.refundQty, r.quantity);
    const pending = Math.max(0, r.quantity - r.coveredQty, lostToRefund);
    if (r.status === "TAKE_ACTION" || r.status === "PARTIAL") {
      takeActionSkus++;
      takeActionQty += pending;
    }
    if (r.status === "WAITING_RETURN") {
      waitingReturnSkus++;
      waitingReturnQty += pending;
    }
  }

  return {
    totalSkus,
    totalQty,
    returnsMatchedSkus,
    returnsMatchedQty,
    reimbSkus,
    reimbQty,
    reimbAmount,
    adjSkus,
    adjQty,
    takeActionSkus,
    takeActionQty,
    waitingReturnSkus,
    waitingReturnQty,
  };
}
