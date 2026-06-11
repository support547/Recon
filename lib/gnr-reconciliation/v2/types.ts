// FBA Recon v2 — types
//
// A fresh reconciliation model for the GNR page that anchors every used FNSKU
// against the Inventory Ledger *Summary* (fba_summary) instead of the legacy
// FBA-balance heuristic used by the v1 GNR tab. See ./formula.ts for the rules.

export type GnrV2Status =
  | "mixed-sku" // usedFnsku == origFnsku (or empty in source): GNR stock mixed with regular; not per-FNSKU reconcilable
  | "review" // no ledger data, computedEnding < 0
  | "no-snapshot" // no ledger data, computedEnding > 0
  | "claim-inbound" // graded but never re-added to inventory (reason-3 arrival missing)
  | "pending-data" // inbound gap exists but grading is newer than the uploaded adjustments report
  | "matched" // variance == 0 (organic)
  | "resolved" // variance == 0 closed by a manual adjustment or approved case
  | "over-accounted" // variance > 0
  | "reimbursed" // variance < 0 fully covered by reimb + case
  | "waiting" // variance < 0, last GNR report <= 60d ago
  | "take-action"; // variance < 0, uncovered and aged

/**
 * Coarse 3-level action grouping over the granular GnrV2Status. Drives the
 * top-level cards / filters; granular statuses stay unchanged. Mapping lives in
 * STATUS_TO_GROUP (formula.ts), with a compile-time exhaustiveness check so a new
 * status without a group fails typecheck.
 */
export type GnrV2ActionGroup = "take-action" | "no-action" | "excess";

/** Raw gnr_report shape consumed by the v2 source combine. */
export type GnrV2ReportRow = {
  usedMsku: string | null;
  usedFnsku: string | null;
  fnsku: string | null;
  asin: string | null;
  usedCondition: string | null;
  quantity: number;
  unitStatus: string | null;
  orderId: string | null;
  lpn: string | null;
  reportDate: Date | null;
};

/** Raw grade_resell_items shape consumed by the v2 source combine. */
export type GnrV2ManualRow = {
  msku: string;
  fnsku: string | null;
  asin: string | null;
  usedMsku: string | null;
  usedFnsku: string | null;
  usedCondition: string | null;
  grade: string | null;
  quantity: number;
  unitStatus: string | null;
  orderId: string | null;
  lpn: string | null;
  gradedDate: Date | null;
};

/** Normalised row after combining report + manual sources. */
export type GnrV2CombinedRow = {
  usedMsku: string;
  usedFnsku: string;
  origFnsku: string;
  asin: string;
  usedCondition: string;
  quantity: number;
  unitStatus: string | null;
  orderId: string | null;
  lpn: string | null;
  date: Date | null;
};

/** Per used FNSKU grading bucket produced by aggregateGnrV2. */
export type GnrV2Agg = {
  usedMsku: string;
  usedFnsku: string;
  origFnsku: string;
  asin: string;
  usedCondition: string;
  gnrQty: number;
  succeededQty: number;
  failedQty: number;
  orderCount: number;
  firstDate: Date | null;
  lastDate: Date | null;
  /** Per grading-date qty breakdown, newest first (for the GNR Date hover). */
  gnrDates: GnrV2GnrDate[];
};

/** One grading date and its summed qty. */
export type GnrV2GnrDate = { date: string; qty: number };

/** Ledger anchor for one FNSKU, derived from fba_summary. */
export type GnrV2Ledger = {
  ledgerDate: Date | null;
  ledgerEnding: number;
  ledgerIn: number;
  /** Σ found across all rows (all dates) — the + side of W/H Events. */
  ledgerFound: number;
  ledgerLost: number;
  ledgerDamaged: number;
  ledgerDisposed: number;
  /** Σ otherEvents across all rows (all dates) — for the Ledger Adj hover. */
  ledgerOther: number;
  /** Σ unknownEvents across all rows (all dates) — for the Ledger Adj hover. */
  ledgerUnknown: number;
  /** Σ endingBalance on the latest summaryDate across dispositions != SELLABLE. */
  unsellableOnHand: number;
  /** Per-disposition Σ endingBalance on ledgerDate (for the Ledger End hover). */
  ledgerDispositions: { disposition: string; qty: number }[];
  /** Σ startingBalance on the EARLIEST summaryDate (pre-window opening stock). */
  openingBal: number;
};

/**
 * One inventory_adjustments arrival event (reason='3') for the GNR-In popover.
 * Failed AND Succeeded graded units re-enter inventory through these rows.
 */
export type GnrV2InEvent = {
  adjDate: string;
  qty: number;
  referenceId: string;
  fc: string;
  disposition: string;
};

/** Raw inventory_adjustments shape consumed by buildInvAdjMap. */
export type GnrV2InvAdjRow = {
  fnsku: string | null;
  quantity: number;
  reason: string | null;
  adjDate: Date | null;
  referenceId: string | null;
  fulfillmentCenter: string | null;
  disposition: string | null;
};

/** Per-FNSKU GNR-In aggregate from inventory_adjustments reason='3'. */
export type GnrV2InMeta = {
  gnrInQty: number;
  events: GnrV2InEvent[];
};

/** W/H Events breakdown (fba_summary, all dates) for the cell hover. */
export type GnrV2WhBreakdown = {
  found: number;
  lost: number;
  damaged: number;
  disposed: number;
};

/**
 * Ledger Adj breakdown (fba_summary, all dates) for the cell hover.
 *   ledgerAdjSigned = (other + unknown) − actualIn
 * reason-3 arrivals are already surfaced as Actual In, so they're netted out.
 */
export type GnrV2LedgerAdjBreakdown = {
  other: number;
  unknown: number;
  actualIn: number;
};

/**
 * A dated flow row (sales / returns / removals). Carries BOTH msku and fnsku so
 * flows can be assigned to a used SKU by composite-key matching (see
 * assignFlowToUsedSkus). Either identifier may be blank in the source.
 */
export type GnrV2FlowRow = {
  msku: string | null;
  fnsku: string | null;
  quantity: number;
  date: Date | null;
  /** Passthrough for detail popovers — never used for matching. */
  orderId?: string | null;
  /** Returns/removals only — passthrough for detail popovers. */
  disposition?: string | null;
};

/** Sales rows additionally carry productAmount for the != 0 filter. */
export type GnrV2SaleRow = GnrV2FlowRow & {
  productAmount: { toString(): string } | null;
};

/** Reimbursement row shape (mirrors full-reconciliation ReimbRow). */
export type GnrV2ReimbRow = {
  msku: string | null;
  fnsku: string | null;
  quantity: number;
  amount: { toString(): string } | null;
  reason: string | null;
  reimbursementId: string | null;
  originalReimbId: string | null;
  originalReimbType: string | null;
  date: Date | null;
};

/**
 * Normalised, signed flow row ready for matching. `qty`/`amount` already carry
 * any reversal negation (reimb). Used by assignFlowToUsedSkus.
 *
 * The optional passthrough fields (orderId / disposition / source) are NOT used
 * for matching — they ride along so the matcher can hand back the exact rows a
 * usedKey's sum was built from (for the cell-detail popovers).
 */
export type GnrV2MatchRow = {
  msku: string | null;
  fnsku: string | null;
  qty: number;
  amount: number;
  date: Date | null;
  orderId?: string | null;
  disposition?: string | null;
  source?: GnrV2RemovalSource;
};

/** Which table a removal detail row came from. */
export type GnrV2RemovalSource = "shipment" | "removal-order";

/** One underlying sale backing a row's Sales cell. */
export type GnrV2SaleDetail = {
  date: string;
  orderId: string;
  qty: number;
  amount: number;
};

/** One underlying return backing a row's Returns cell. */
export type GnrV2ReturnDetail = {
  date: string;
  orderId: string;
  qty: number;
  disposition: string;
};

/** One underlying removal backing a row's Removals cell. */
export type GnrV2RemovalDetail = {
  date: string;
  orderId: string;
  qty: number;
  source: GnrV2RemovalSource;
};

/** A capped, date-desc detail list with the pre-truncation count. */
export type GnrV2DetailList<T> = {
  rows: T[];
  /** Total matched rows before the 50-cap (rows.length when not truncated). */
  totalCount: number;
};

/** A used-SKU identity that flows are matched against. */
export type GnrV2UsedKey = {
  usedMsku: string;
  usedFnsku: string;
};

/** Which flow stream a row came from. */
export type GnrV2FlowSource = "sales" | "returns" | "removals" | "reimb";

/**
 * A flow row that carried BOTH msku and fnsku but matched no exact used-SKU
 * pair, so it was dropped (strictly — no fnsku fallback). Surfaced to detect
 * MSKU suffix-variant losses.
 */
export type GnrV2DroppedRow = {
  source: GnrV2FlowSource;
  msku: string;
  fnsku: string;
  qty: number;
};

/** Result of matching one flow stream to used SKUs. */
export type GnrV2MatchResult = {
  /** usedKey → summed { qty, amount }. */
  byUsedKey: Map<string, { qty: number; amount: number }>;
  /** usedKey → the exact matched rows whose sum is byUsedKey (for detail popovers). */
  detailsByUsedKey: Map<string, GnrV2MatchRow[]>;
  /** Count of flow rows that matched >1 used SKU at their tier (counted once). */
  ambiguous: number;
  /** Both-field rows that matched no exact pair (dropped). */
  dropped: GnrV2DroppedRow[];
};

/** Aggregate of dropped exact-pair rows for the payload / banner. */
export type GnrV2DroppedSummary = {
  count: number;
  totalQty: number;
  /** Up to 20 example rows. */
  sample: GnrV2DroppedRow[];
};

/** Case row aggregated by used FNSKU. */
export type GnrV2CaseRow = {
  fnsku: string | null;
  unitsClaimed: number;
  unitsApproved: number;
  amountApproved: { toString(): string } | null;
  status: string | null;
  referenceId: string | null;
  caseReason: string | null;
  raisedDate: Date | null;
};

/** Manual adjustment row aggregated by used MSKU. */
export type GnrV2AdjRow = {
  msku: string | null;
  qtyAdjusted: number;
  reason: string | null;
};

export type GnrV2CaseMeta = {
  /** Σ unitsClaimed across this fnsku's cases (the raised qty, shown immediately). */
  claimedQty: number;
  approvedQty: number;
  approvedAmount: number;
  count: number;
  topStatus: string;
  caseIds: string;
  reasons: string;
};

export type GnrV2AdjMeta = {
  qty: number;
  count: number;
  reasons: string;
};

/** The fully reconciled row rendered by the FBA Recon v2 table. */
export type GnrV2Row = {
  /** Latest grading (gnr report) date for this used SKU — same anchor as daysSince. "" when undated. */
  gnrDate: string;
  /** Per grading-date qty breakdown, newest first (for the GNR Date hover). */
  gnrDates: GnrV2GnrDate[];
  usedMsku: string;
  usedFnsku: string;
  origFnsku: string;
  asin: string;
  /** Product title from fba_summary (fallback inventory_adjustments). "" when unknown. */
  title: string;
  usedCondition: string;
  succeededQty: number;
  failedQty: number;
  gnrQty: number;
  /** succeededQty + failedQty — total graded units expected to re-enter inventory. */
  expectedInQty: number;
  /** Σ inventory_adjustments reason='3' qty>0 for this FNSKU (actual arrivals). */
  gnrInQty: number;
  /** Arrival events backing gnrInQty (for the GNR-In popover). */
  gnrInEvents: GnrV2InEvent[];
  /**
   * True when usedFnsku === origFnsku (or usedFnsku was empty in source): the
   * graded units share an FNSKU with regular stock, so per-FNSKU reconciliation
   * here is invalid — reconcile in Full Inventory Recon instead.
   */
  isMixedSku: boolean;
  // ledger
  ledgerEnding: number | null;
  ledgerDate: string;
  /** Per-disposition Σ endingBalance on ledgerDate (for the Ledger End hover). */
  ledgerDispositions: { disposition: string; qty: number }[];
  ledgerLost: number;
  ledgerDamaged: number;
  ledgerDisposed: number;
  /** Σ endingBalance latest summaryDate where disposition != SELLABLE. */
  unsellableOnHand: number;
  /** Σ startingBalance at the earliest summaryDate (pre-window opening stock). */
  openingBal: number;
  hasLedger: boolean;
  // flows
  salesQty: number;
  returnQty: number;
  removalQty: number;
  reimbQty: number;
  reimbAmount: number;
  adjQty: number;
  /** Σ unitsClaimed — the raised case qty, shown in the Case Qty column immediately. */
  caseClaimedQty: number;
  caseApprovedQty: number;
  caseApprovedAmount: number;
  // SIGNED display fields — the single source of truth for the table, CSV, and
  // header totals. computedEnding is EXACTLY their sum (see composeGnrV2Row).
  // Render these directly; never re-derive a sign anywhere downstream.
  actualIn: number; // +  reason-3 arrivals (== gnrInQty)
  salesSigned: number; // −  salesQty
  returnsSigned: number; // +  returnQty
  removalsSigned: number; // −  removalQty
  whEventsSigned: number; // ±  found − lost − damaged − disposed (fba_summary)
  ledgerAdjSigned: number; // ±  (ledgerOther + ledgerUnknown) − actualIn (fba_summary, reason-3 already in Actual In)
  adjSigned: number; // ±  manual_adjustments qtyAdjusted (sign as stored)
  // MONEY-SIDE display only — NOT in computedEnding (a lost/damaged unit already
  // leaves via whEventsSigned; its reimbursement is compensation, not a 2nd exit).
  // 'reimbursed' status still uses reimbQty + caseApprovedQty to cover |variance|.
  reimbSigned: number; // −  reimbQty (post reason-filter + reversal handling)
  caseApprSigned: number; // +  unitsApproved
  /** W/H Events breakdown for the cell hover (Found / Lost / Damaged / Disposed). */
  whBreakdown: GnrV2WhBreakdown;
  /** Ledger Adj breakdown for the hover (other + unknown events, less Actual In). */
  ledgerAdjBreakdown: GnrV2LedgerAdjBreakdown;
  // Underlying transactions backing the signed Sales / Returns / Removals cells.
  // Same cutoff + pair-matching as the sums, so a popover always explains its
  // cell. Σ qty === salesQty / returnQty / removalQty. Empty when the qty is 0.
  salesDetails: GnrV2DetailList<GnrV2SaleDetail>;
  returnDetails: GnrV2DetailList<GnrV2ReturnDetail>;
  removalDetails: GnrV2DetailList<GnrV2RemovalDetail>;
  // case/adj meta (for hover detail)
  caseCount: number;
  caseTopStatus: string;
  caseIds: string;
  caseReasons: string;
  adjReasons: string;
  // checks
  inboundGap: number;
  /** 'pre-window' when an inbound gap is covered by opening balance (not a claim). */
  inboundNote: "" | "pre-window";
  computedEnding: number;
  variance: number | null;
  status: GnrV2Status;
  /** Coarse 3-level grouping of `status` (STATUS_TO_GROUP). */
  actionGroup: GnrV2ActionGroup;
  daysSince: number;
};

export type GnrV2Stats = {
  totalSkus: number;
  matched: number;
  claimInbound: number;
  takeAction: number;
  waiting: number;
  overAccounted: number;
  reimbursed: number;
  mixedSku: number;
  /** Count per granular status (every GnrV2Status present, 0 when none). */
  byStatus: Record<GnrV2Status, number>;
  /** Count per coarse action group (Σ of its member statuses). */
  byGroup: Record<GnrV2ActionGroup, number>;
  /** Account-wide Σ inventory_adjustments reason='3' qty>0 across used FNSKUs. */
  totalReason3Qty: number;
  /** Account-wide Σ (succeeded + failed) graded units. */
  totalExpectedIn: number;
  /** True when |totalReason3Qty − totalExpectedIn| / totalExpectedIn > 10%. */
  reason3Warn: boolean;
  /** Flow rows that matched >1 used SKU at their tier (assigned once, flagged). */
  ambiguousFlowRows: number;
  /** Both-field flow rows dropped for matching no exact used-SKU pair. */
  droppedPairRows: GnrV2DroppedSummary;
};

// ─────────────────────────────────────────────────────────
// ASIN drill-down (client-side aggregation over GnrV2Row members)
// ─────────────────────────────────────────────────────────

/** One inbound (reason-3) arrival event tagged with the member FNSKU it came from. */
export type GnrV2AsinInEvent = GnrV2InEvent & { fnsku: string };
/** A merged member flow detail tagged with the source member FNSKU. */
export type GnrV2AsinSaleDetail = GnrV2SaleDetail & { fnsku: string };
export type GnrV2AsinReturnDetail = GnrV2ReturnDetail & { fnsku: string };
export type GnrV2AsinRemovalDetail = GnrV2RemovalDetail & { fnsku: string };

/**
 * ASIN row: all used-SKU rows sharing one ASIN, aggregated. Reconciliation sums
 * (expected / actual / signed flows / computed / ledger / variance) cover the
 * NON-MIXED members only — mixed-sku members are surfaced but excluded from the
 * math (they share an FNSKU with regular stock). Built client-side by
 * aggregateAsinRows from the existing GnrV2Row payload — no new DB queries.
 */
export type GnrV2AsinRow = {
  asin: string;
  /** Product title (first non-empty member title). "" when unknown. */
  title: string;
  members: GnrV2Row[];
  memberCount: number;
  mixedCount: number;
  /** Non-mixed members that have a ledger snapshot (hasLedger). */
  ledgerCoveredCount: number;
  /** Non-mixed members total (the denominator for coverage). */
  reconcilableCount: number;
  /** True when 0 < ledgerCoveredCount < reconcilableCount — ledger math suppressed. */
  partialLedger: boolean;
  /** Tooltip explaining a partial / missing ledger ("" when fully covered). */
  ledgerNote: string;
  /** Distinct used conditions across members (non-empty, "—" excluded). */
  conditions: string[];
  /** Latest member gnrDate; daysSince = min over members (most recent). */
  gnrDate: string;
  daysSince: number;
  // ── aggregated reconciliation (non-mixed members only) ──
  expectedInQty: number;
  actualIn: number;
  inboundGap: number; // actual − expected
  salesSigned: number;
  returnsSigned: number;
  removalsSigned: number;
  reimbSigned: number;
  adjSigned: number;
  computedEnding: number;
  /** Σ ledgerEnding — null when no/partial ledger coverage (suppressed). */
  ledgerEnding: number | null;
  /** ledgerEnding − computedEnding — null when no/partial coverage. */
  variance: number | null;
  /** Σ unsellable / W/H breakdown — null when partial (ledger-side suppressed). */
  whBreakdownSuppressed: boolean;
  reimbQty: number;
  salesQty: number;
  returnQty: number;
  removalQty: number;
  adjQty: number;
  caseClaimedQty: number;
  caseApprovedQty: number;
  unsellableOnHand: number;
  // ── status (dominant / most-actionable member) ──
  status: GnrV2Status;
  actionGroup: GnrV2ActionGroup;
};

/** Merged member detail bundle for the ASIN detail sheet. */
export type GnrV2AsinDetail = {
  inEvents: GnrV2AsinInEvent[];
  sales: GnrV2AsinSaleDetail[];
  returns: GnrV2AsinReturnDetail[];
  removals: GnrV2AsinRemovalDetail[];
  /** Σ endingBalance per disposition across non-mixed members, qty desc. */
  ledgerDispositions: { disposition: string; qty: number }[];
  /** W/H events breakdown summed over non-mixed members. */
  whBreakdown: GnrV2WhBreakdown;
  /** Ledger Adj breakdown summed over non-mixed members. */
  ledgerAdjBreakdown: GnrV2LedgerAdjBreakdown;
};
