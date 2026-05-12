import type { ReplacementReconRow, ReplacementReconStats } from "./types";

export function summaryStats(rows: ReplacementReconRow[]): ReplacementReconStats {
  const totalSkus = rows.length;
  let totalQty = 0;
  let returnsMatchedSkus = 0;
  let returnsMatchedQty = 0;
  let reimbSkus = 0;
  let reimbQty = 0;
  let reimbAmount = 0;
  let takeActionSkus = 0;
  let takeActionQty = 0;

  for (const r of rows) {
    totalQty += r.quantity;
    if (r.returnQty > 0) {
      returnsMatchedSkus++;
      returnsMatchedQty += r.returnQty;
    }
    if (r.effectiveReimbQty > 0 || r.effectiveReimbAmount > 0) {
      reimbSkus++;
      reimbQty += r.effectiveReimbQty;
      reimbAmount += r.effectiveReimbAmount;
    }
    if (r.status === "TAKE_ACTION" || r.status === "PARTIAL") {
      takeActionSkus++;
      takeActionQty += Math.max(0, r.quantity - r.returnQty - r.effectiveReimbQty);
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
    takeActionSkus,
    takeActionQty,
  };
}
