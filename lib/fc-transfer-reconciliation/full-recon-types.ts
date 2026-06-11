// Types for the "Full Reconciliation" tab — the FC-transfer reconciliation
// engine. FcLogRow (in ./types.ts) feeds the Transfer Log tab.

/** Lifecycle status for a fully-reconciled FC-transfer group/episode.
 *  - RECONCILED:          net 0, no degradation, nothing open.
 *  - IN_TRANSIT:          net shortage but still inside the 60-day window — not yet actionable.
 *  - SHORTAGE:            net shortage aged past the window — take action.
 *  - DAMAGED_IN_TRANSIT:  units left sellable, came back unsellable (degradation). Confirmed
 *                         loss; actionable immediately (no aging window) unless DAMAGED_REQUIRES_AGING.
 *  - SHORTAGE_AND_DAMAGED: both a net quantity shortage AND degradation in the same episode.
 *  - EXCESS:              more received than sent — watch only.
 *  - CASE_OPEN / REIMBURSED / ADJUSTED: settled / in-progress via coverage overlay. */
export type FcFullStatus =
  | "RECONCILED"
  | "IN_TRANSIT"
  | "SHORTAGE"
  | "DAMAGED_IN_TRANSIT"
  | "SHORTAGE_AND_DAMAGED"
  | "EXCESS"
  | "CASE_OPEN"
  | "REIMBURSED"
  | "ADJUSTED";

/** One transfer leg for the drill-down. When referenceId ever populates,
 *  legs sharing a referenceId are grouped as a single transfer (out+in);
 *  with today's all-null data they render as a flat per-episode list. */
export type FcTransferLegDetail = {
  date: string;
  referenceId: string;
  fc: string;
  /** Signed quantity exactly as stored (negative = out, positive = in). */
  signedQty: number;
  disposition: string;
  /** Classifier verdict for this leg's disposition. */
  cls: "SELLABLE" | "UNSELLABLE" | "UNKNOWN";
};

/** A grouped transfer in the drill-down. With no referenceId linkage today,
 *  the whole episode is one synthetic "transfer" whose legs are all the
 *  episode's legs; if refIds populate, each refId becomes one entry. */
export type FcTransferGroup = {
  referenceId: string; // "" when legs are unlinked
  fromFc: string; // derived: FC(s) of the out legs
  toFc: string; // derived: FC(s) of the in legs
  outQty: number;
  inQty: number;
  variance: number; // inQty - outQty
  legs: FcTransferLegDetail[];
};

export type FcFullReconRow = {
  // identity (canonical msku|fnsku|asin grain — same as Problem 2)
  msku: string;
  fnsku: string;
  asin: string;
  title: string;

  // FC routing as COUNTS (not joined code strings — a single episode can span
  // many FCs and overflow the row). Number of DISTINCT OUT FCs and DISTINCT IN
  // FCs for the episode. The full FC code list lives in the drill-down modal,
  // derived per-group (FcTransferGroup.fromFc / toFc).
  fromFcCount: number;
  toFcCount: number;

  // OUT broken down by disposition (positive magnitudes)
  outQty: number;
  outSellable: number;
  outUnsellable: number;

  // IN broken down by disposition (positive magnitudes)
  inQty: number;
  inSellable: number;
  inUnsellable: number;

  // derived quantities (all >= 0 except netQty)
  netQty: number; // inQty - outQty (signed)
  sellableShortfall: number; // max(0, outSellable - inSellable)
  quantityShortage: number; // max(0, -netQty)
  degradationQty: number; // min(inUnsellable, sellableShortfall): sellable-out returned unsellable

  // in-transit / aging
  inTransitPending: number; // open net shortage units still inside the window
  daysPending: number;
  /** First transfer date of the current open episode (after the last zero-cross).
   *  Drives daysPending and is shown in the drill-down header. */
  imbalanceStart: string;

  // coverage (reuses the Problem-1 dated overlay)
  effectiveReimbQty: number; // coverage that settled this open episode
  caseCount: number;
  caseOpenCount: number;
  caseStatusTop: string;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  adjQty: number;

  // open + status
  openQty: number; // unresolved units after coverage (shortage + degradation)
  status: FcFullStatus;
  actionable: boolean;

  // data-quality
  unknownDispositionQty: number; // legs with blank/null disposition

  // drill-down
  groups: FcTransferGroup[];
};

/**
 * Stats for the Full Reconciliation KPI cards.
 *
 * PARTITION INVARIANT (enforced in fcFullStats + proven by test):
 *   reconciledCount + inTransitCount + shortageCount + damagedCount
 *   + shortageDamagedCount + excessCount + caseOpenCount + reimbursedCount
 *   + adjustedCount === totalGroups === rows.length
 *
 * Each FcFullStatus maps to EXACTLY ONE count bucket — no row double-counted, no
 * row uncounted. SHORTAGE_AND_DAMAGED is its OWN bucket (NOT folded into shortage
 * or damaged). CASE_OPEN / REIMBURSED / ADJUSTED are separate (an open case is
 * NOT "settled").
 *
 * `*Qty` figures are informational (open units, surplus, or covered units) and
 * are NOT required to sum to anything. `totalUnresolved*` is a DERIVED rollup of
 * the open/in-progress buckets — NOT part of the partition.
 */
export type FcFullStats = {
  // Grand total — must equal the table row count at the msku|fnsku|asin grain.
  totalGroups: number;

  // ---- the 9-bucket partition (counts sum to totalGroups) ----
  reconciledCount: number;
  inTransitCount: number;
  inTransitQty: number; // open shortage units still inside the window
  shortageCount: number; // SHORTAGE only
  shortageQty: number; // open units
  damagedCount: number; // DAMAGED_IN_TRANSIT only
  damagedQty: number; // degradation (open) units
  shortageDamagedCount: number; // SHORTAGE_AND_DAMAGED — its OWN bucket
  shortageDamagedQty: number; // combined open units
  excessCount: number;
  excessQty: number; // surplus units (netQty)
  caseOpenCount: number; // CASE_OPEN (raised / in progress)
  caseOpenQty: number; // open units under the case
  reimbursedCount: number;
  reimbursedQty: number; // covered units (effectiveReimbQty)
  adjustedCount: number;
  adjustedQty: number; // covered units (effectiveReimbQty)

  // ---- derived rollup (NOT part of the partition) ----
  // open/in-progress buckets: inTransit + shortage + damaged + shortageDamaged + caseOpen.
  totalUnresolvedCount: number;
  totalUnresolvedQty: number;

  // distinct-MSKU count (a relisted MSKU = multiple rows). Separate, clearly
  // labeled, and explicitly NOT used for the partition invariant.
  distinctMskuCount: number;

  // data-quality counter — legs whose disposition was blank/null (UNKNOWN).
  unknownDispositionQty: number;
};
