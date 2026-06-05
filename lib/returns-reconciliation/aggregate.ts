import type { ReturnsReconRow, ReturnsReconStats } from "./types";

export function summaryStats(rows: ReturnsReconRow[]): ReturnsReconStats {
  const s: ReturnsReconStats = {
    totalRows: 0, totalQty: 0, sellableQty: 0, unsellableQty: 0,
    confirmedRows: 0, confirmedQty: 0,
    gnrTrackingRows: 0, gnrTrackingQty: 0,
    unknownGnrRows: 0,
    orderNotFoundRows: 0, orderNotFoundQty: 0,
    inInventoryRows: 0, inInventoryQty: 0,
    notInInventoryRows: 0, notInInventoryQty: 0,
    reimbursedRows: 0, reimbAmount: 0,
    resolvedRows: 0, pendingRows: 0,
    caseNeededRows: 0, unknownGnrCaseRows: 0,
    transferredToGnrRows: 0, transferredToGnrQty: 0,
    investigateRows: 0, withCaseRows: 0,
  };

  for (const r of rows) {
    s.totalRows++;
    s.totalQty      += r.totalReturned;
    s.sellableQty   += r.sellableQty;
    s.unsellableQty += r.unsellableQty;

    switch (r.ownershipStatus) {
      case "CONFIRMED":
        s.confirmedRows++; s.confirmedQty += r.totalReturned; break;
      case "GNR_TRACKING":
        s.gnrTrackingRows++; s.gnrTrackingQty += r.totalReturned; break;
      case "UNKNOWN_GNR":
        s.unknownGnrRows++; break;
      case "ORDER_NOT_FOUND":
        s.orderNotFoundRows++;
        s.orderNotFoundQty += r.totalReturned; break;
    }

    if (r.inventoryStatus === "IN_INVENTORY") {
      s.inInventoryRows++; s.inInventoryQty += r.sellableQty;
    }
    if (r.inventoryStatus === "NOT_IN_INVENTORY") {
      s.notInInventoryRows++; s.notInInventoryQty += r.sellableQty;
    }

    if (r.reimbStatus === "REIMBURSED_CASH" ||
        r.reimbStatus === "REIMBURSED_INVENTORY") {
      s.reimbursedRows++;
      s.reimbAmount += r.reimbAmount;
    }

    switch (r.finalStatus) {
      case "RESOLVED":         s.resolvedRows++;       break;
      case "PENDING":          s.pendingRows++;         break;
      case "CASE_NEEDED":      s.caseNeededRows++;      break;
      case "GNR_TRACKING":     break; // counted via ownershipStatus
      case "UNKNOWN_GNR_CASE": s.unknownGnrCaseRows++;  break;
      case "TRANSFERRED_TO_GNR":
        s.transferredToGnrRows++;
        s.transferredToGnrQty += r.totalReturned;
        break;
      case "INVESTIGATE":      s.investigateRows++;      break;
    }

    if (r.caseCount > 0) s.withCaseRows++;
  }

  return s;
}
