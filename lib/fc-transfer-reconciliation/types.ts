// FC-transfer shared types. The legacy analysis/summary engine (FcAnalysisRow,
// FcSummaryRow, FcReconStats, FcActionStatus) has been removed — the page now
// runs only the full-reconciliation engine (see full-recon-types.ts) + the
// Transfer Log. What remains here is used by the new engine, matching.ts, and
// the Log tab.

export type FcLogRow = {
  id: string;
  transferDate: string;
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  quantity: number;
  eventType: string;
  fulfillmentCenter: string;
  disposition: string;
  reason: string;
};

/** One approved-reimbursement record, date preserved so it can enter the
 *  ledger timeline as a dated synthetic event. `date` is null when neither
 *  raisedDate nor issueDate was set (un-dated fallback). */
export type FcCaseRecord = { qty: number; date: Date | null };

/** One manual-adjustment record, adjDate preserved. `date` null = un-dated. */
export type FcAdjRecord = { qty: number; date: Date | null };

export type FcCaseMeta = {
  // Identity of the listing this coverage belongs to. fnsku/asin blank => the
  // case was raised at the msku level and is distributed via the fallback path.
  msku: string;
  fnsku: string;
  asin: string;
  count: number;
  openCount: number;
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  caseIds: string[];
  topStatus: string;
  // Per-case approved-qty records with dates, for episode-scoped coverage in
  // aggregateFcFullRecon.
  records: FcCaseRecord[];
};

export type FcAdjMeta = {
  msku: string;
  fnsku: string;
  asin: string;
  qty: number;
  count: number;
  reasons: string[];
  // Per-adjustment records with dates, for episode-scoped coverage.
  records: FcAdjRecord[];
};
