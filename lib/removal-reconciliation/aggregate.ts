import type { RemovalReconRow, RemovalReconStats } from "./types";

export function summaryStats(rows: RemovalReconRow[]): RemovalReconStats {
  const totalOrders = rows.length;
  let totalQty = 0;
  let receivedSkus = 0;
  let receivedQty = 0;
  let awaitingSkus = 0;
  let awaitingQty = 0;
  let partialMissingSkus = 0;
  let partialMissingQty = 0;
  let reimbursedSkus = 0;
  let reimbursedAmount = 0;
  let hasCaseSkus = 0;
  let caseCountTotal = 0;
  let totalFee = 0;

  for (const r of rows) {
    totalQty += r.requestedQty;
    totalFee += r.removalFee;

    if (r.receiptStatus === "COMPLETE") {
      receivedSkus++;
      receivedQty += r.receivedQty;
    } else if (r.receiptStatus === "AWAITING" || r.receiptStatus === "NOT_APPLICABLE") {
      awaitingSkus++;
      awaitingQty += r.expectedShipped;
    } else if (
      r.receiptStatus === "PARTIAL" ||
      r.receiptStatus === "MISSING" ||
      r.receiptStatus === "DAMAGED"
    ) {
      partialMissingSkus++;
      partialMissingQty += Math.max(0, r.expectedShipped - r.receivedQty);
    } else if (r.receiptStatus === "REIMBURSED") {
      reimbursedSkus++;
      reimbursedAmount += r.reimbAmount;
    }

    if (r.caseCount > 0) {
      hasCaseSkus++;
      caseCountTotal += r.caseCount;
    }
  }

  return {
    totalOrders,
    totalQty,
    receivedSkus,
    receivedQty,
    awaitingSkus,
    awaitingQty,
    partialMissingSkus,
    partialMissingQty,
    reimbursedSkus,
    reimbursedAmount,
    hasCaseSkus,
    caseCountTotal,
    totalFee,
  };
}
