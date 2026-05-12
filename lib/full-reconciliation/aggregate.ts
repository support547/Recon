import type { FullReconRow, FullReconStats } from "./types";

export function summaryStats(rows: FullReconRow[]): FullReconStats {
  const totalFnskus = rows.length;
  let totalShipped = 0;
  let totalReceived = 0;
  let totalShortage = 0;
  let totalSold = 0;
  let matched = 0;
  let over = 0;
  let takeAction = 0;
  let reimbursed = 0;
  let noSnapshot = 0;
  let takeActionVariance = 0;
  for (const r of rows) {
    totalShipped += r.shippedQty;
    totalReceived += r.receiptQty;
    totalShortage += r.shortageQty;
    totalSold += r.soldQty;
    switch (r.reconStatus) {
      case "Matched": matched++; break;
      case "Over": over++; break;
      case "Take Action":
        takeAction++;
        if (r.fbaEndingBalance !== null) {
          takeActionVariance += Math.abs(r.fbaEndingBalance - r.endingBalance);
        }
        break;
      case "Reimbursed": reimbursed++; break;
      case "No Snapshot": noSnapshot++; break;
    }
  }
  return {
    totalFnskus,
    totalShipped,
    totalReceived,
    totalShortage,
    totalSold,
    matched,
    over,
    takeAction,
    reimbursed,
    noSnapshot,
    takeActionVariance,
  };
}
