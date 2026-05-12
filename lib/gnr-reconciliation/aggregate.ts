import type { GnrReconRow, GnrReconStats } from "./types";

export function summaryStats(rows: GnrReconRow[]): GnrReconStats {
  const totalSkus = rows.length;
  let totalGnrQty = 0;
  let matched = 0;
  let takeAction = 0;
  let waiting = 0;
  let overAccounted = 0;
  let balanced = 0;
  let review = 0;
  for (const r of rows) {
    totalGnrQty += r.gnrQty;
    switch (r.actionStatus) {
      case "matched": matched++; break;
      case "take-action": takeAction++; break;
      case "waiting": waiting++; break;
      case "over-accounted": overAccounted++; break;
      case "balanced": balanced++; break;
      case "review": review++; break;
    }
  }
  return {
    totalSkus,
    totalGnrQty,
    matched,
    takeAction,
    waiting,
    overAccounted,
    balanced,
    review,
  };
}
