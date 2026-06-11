// Types for the "By FC" view — an FC-WISE ANALYSIS SUMMARY of the transfer
// ledger. This is DESCRIPTIVE ONLY: observable per-FC flow metrics over the
// filtered date range. NO status, NO actionability, NO coverage (cases /
// adjustments / reimbursements are ignored entirely), NO episodes, NO FC→FC
// lanes (0% referenceId linkage means out/in legs can't be paired). One row per
// fulfillment center; node-level only.

/** One transfer leg behind a By-FC row's drill-down (a single ledger event at
 *  this FC). signedQty is exactly as stored (negative = out, positive = in). */
export type FcByFcLegDetail = {
  date: string;
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  signedQty: number;
  disposition: string;
  /** Classifier verdict for this leg's disposition. */
  cls: "SELLABLE" | "UNSELLABLE" | "UNKNOWN";
};

/** One MSKU's flow AT A SINGLE FC, for the per-FC drill-down. in/out/net are
 *  scoped to this FC only (NOT the MSKU's global position). */
export type FcByFcMskuDetail = {
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  outQty: number; // |negative qty| for this msku at this FC
  inQty: number; // positive qty for this msku at this FC
  netQty: number; // inQty - outQty
  events: number;
};

/** Per-FC drill-down payload: the MSKUs that moved through this FC (with their
 *  in/out/net AT THIS FC) and the underlying raw legs. */
export type FcByFcDetail = {
  fc: string;
  mskus: FcByFcMskuDetail[];
  legs: FcByFcLegDetail[];
};

/** One fulfillment center's aggregated flow over the filtered range. All qty
 *  fields are non-negative magnitudes except netQty (signed). */
export type FcByFcRow = {
  fc: string;

  // OUT (units that left this FC; |negative qty|), split by disposition class.
  // UNKNOWN-disposition out units count in outQty only, surfaced via unknownQty.
  outQty: number;
  outSellable: number;
  outUnsellable: number;

  // IN (units that arrived at this FC; positive qty), split by disposition.
  // UNKNOWN-disposition in units count in inQty only.
  inQty: number;
  inSellable: number;
  inUnsellable: number;

  // derived flow
  netQty: number; // inQty - outQty (signed)
  volume: number; // inQty + outQty (total throughput — the default sort key)
  /** Share of received units that arrived unsellable: inUnsellable / inQty.
   *  0 when inQty === 0. Observable intake-quality signal, NOT a loss claim. */
  damageIntakePct: number;

  // breadth
  mskuCount: number; // distinct MSKUs seen at this FC
  fnskuCount: number; // distinct FNSKUs seen at this FC
  events: number; // raw ledger legs at this FC

  // span
  firstDate: string; // earliest leg date at this FC (ISO, "" if none)
  lastDate: string; // latest leg date at this FC

  // data-quality — legs with blank/null disposition (counted in in/outQty only).
  unknownQty: number;
};

/** Grand-total stats for the By-FC KPI cards. The DATA-INTEGRITY INVARIANT
 *  (asserted in fcByFcStats + proven by test) ties these to the raw ledger:
 *    sum over FCs of inQty  === total positive qty in the filtered rows
 *    sum over FCs of outQty === total |negative| qty
 *    totalNet               === sum of all signed qty  (=== totalIn - totalOut)
 */
export type FcByFcStats = {
  fcCount: number;
  totalIn: number; // Σ inQty
  totalOut: number; // Σ outQty
  totalNet: number; // totalIn - totalOut
  totalDamagedIn: number; // Σ inUnsellable
  busiestFc: string; // FC with max volume ("" when no rows)
  unknownDispositionQty: number; // Σ unknownQty
};
