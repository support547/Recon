import type { ReturnsReconRow, ReturnsReconStats } from "./types";

export function summaryStats(rows: ReturnsReconRow[]): ReturnsReconStats {
  const totalRows = rows.length;
  let totalQty = 0;
  let matchedSkus = 0;
  let matchedQty = 0;
  let mismatchSkus = 0;
  let mismatchQty = 0;
  let notFoundSkus = 0;
  let notFoundQty = 0;
  let reimbSkus = 0;
  let reimbAmount = 0;
  let withCaseSkus = 0;
  let sellableSkus = 0;

  for (const r of rows) {
    totalQty += r.totalReturned;
    if (r.fnskuStatus === "MATCHED_FNSKU") {
      matchedSkus++;
      matchedQty += r.totalReturned;
    } else if (r.fnskuStatus === "FNSKU_MISMATCH") {
      mismatchSkus++;
      mismatchQty += r.totalReturned;
    } else {
      notFoundSkus++;
      notFoundQty += r.totalReturned;
    }
    if (r.effReimbAmount > 0) {
      reimbSkus++;
      reimbAmount += r.effReimbAmount;
    }
    if (r.caseCount > 0) withCaseSkus++;
    if (r.isSellable) sellableSkus++;
  }

  return {
    totalRows,
    totalQty,
    matchedSkus,
    matchedQty,
    mismatchSkus,
    mismatchQty,
    notFoundSkus,
    notFoundQty,
    reimbSkus,
    reimbAmount,
    withCaseSkus,
    sellableSkus,
  };
}
