// FBA Recon v2 — pure reconciliation logic (no prisma, no React).
//
// Reconciles each *used* FNSKU (the grading output SKU) against the Inventory
// Ledger Summary. Every function here is deterministic and unit-tested in
// ./formula.test.ts. Server wiring lives in actions/gnr-reconciliation-v2.ts.

import type {
  GnrV2ActionGroup,
  GnrV2AsinDetail,
  GnrV2AsinRow,
  GnrV2Agg,
  GnrV2AdjMeta,
  GnrV2AdjRow,
  GnrV2CaseMeta,
  GnrV2CaseRow,
  GnrV2CombinedRow,
  GnrV2DetailList,
  GnrV2DroppedSummary,
  GnrV2FlowRow,
  GnrV2FlowSource,
  GnrV2RemovalDetail,
  GnrV2ReturnDetail,
  GnrV2SaleDetail,
  GnrV2InMeta,
  GnrV2InvAdjRow,
  GnrV2Ledger,
  GnrV2ManualRow,
  GnrV2MatchResult,
  GnrV2MatchRow,
  GnrV2LedgerAdjBreakdown,
  GnrV2WhBreakdown,
  GnrV2ReimbRow,
  GnrV2ReportRow,
  GnrV2Row,
  GnrV2SaleRow,
  GnrV2Stats,
  GnrV2Status,
  GnrV2UsedKey,
} from "./types";

/** Disposition that holds sellable, fulfillable stock in the ledger. */
const SELLABLE = "sellable";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const WAITING_WINDOW_DAYS = 60;
/** Grading newer than (adjCoverageEnd − this) is treated as not-yet-in-the-report. */
const PENDING_DATA_GRACE_DAYS = 7;
/**
 * Flow rows up to this many days AFTER the ledger snapshot still count. The
 * Inventory-Ledger snapshot and the sales/returns/removals exports run on
 * slightly different cadences, so a flow dated 0–N days past the latest
 * summaryDate (the ledger already reflects the unit leaving — its ending balance
 * has dropped) would otherwise be dropped by a strict same-day cutoff, producing
 * a phantom variance. Comparison is at calendar-day granularity (see withinCutoff)
 * so a same-day sale whose timestamp is past the snapshot's midnight is included.
 */
const LEDGER_CUTOFF_GRACE_DAYS = 3;

/** Strip the time-of-day → UTC start-of-day epoch ms. */
function dayStartUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** Placeholder usedFnsku emitted by the combine when none is present in source. */
const NO_USED_FNSKU = "(No Used FNSKU)";

export function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

const REIMB_REASON_FILTER = new Set([
  "damaged_warehouse",
  "lost_warehouse",
  "customerserviceissue",
  "returnadjustment",
  "generaladjustment",
]);

function matchesReimbFilter(reason: string | null | undefined): boolean {
  return REIMB_REASON_FILTER.has((reason ?? "").trim().toLowerCase());
}

/** True when a flow row passes the ledger-date cutoff.
 *  Rule: include when there is no ledger date, when the row has no date, or when
 *  the row's CALENDAR DAY is on/before the ledger day + LEDGER_CUTOFF_GRACE_DAYS.
 *  Day-granularity comparison means a same-day flow whose timestamp is after the
 *  snapshot's midnight is NOT dropped; the small grace window absorbs the cadence
 *  skew between the ledger snapshot and the flow exports. */
function withinCutoff(
  rowDate: Date | null,
  ledgerDate: Date | null,
  graceDays: number = LEDGER_CUTOFF_GRACE_DAYS,
): boolean {
  if (!ledgerDate) return true;
  if (!rowDate) return true;
  return dayStartUtc(rowDate) <= dayStartUtc(ledgerDate) + graceDays * MS_PER_DAY;
}

// ─────────────────────────────────────────────────────────
// Source combine + dedupe
// ─────────────────────────────────────────────────────────

/**
 * Combine gnr_report rows with manual grade_resell_items into one stream,
 * grouped logically by (usedMsku, usedFnsku).
 *
 * Dedupe rule: a manual row is dropped when its `lpn` OR `orderId` already
 * appears in gnr_report for the SAME usedFnsku (report wins). Manual rows with
 * neither identifier are always kept.
 *
 * Manual fallbacks mirror the v1 combine so a row is never silently lost:
 *   usedMsku      ← `Manual: <msku>` when blank
 *   usedFnsku     ← original `fnsku` when blank
 *   usedCondition ← `grade` when blank
 *   unitStatus    ← "Succeeded" when blank
 */
export function combineGnrV2Sources(
  reportRows: GnrV2ReportRow[],
  manualRows: GnrV2ManualRow[],
): GnrV2CombinedRow[] {
  // Index report identifiers per usedFnsku for dedupe.
  const reportLpnByFnsku = new Map<string, Set<string>>();
  const reportOrderByFnsku = new Map<string, Set<string>>();
  const addTo = (m: Map<string, Set<string>>, key: string, val: string) => {
    let set = m.get(key);
    if (!set) {
      set = new Set<string>();
      m.set(key, set);
    }
    set.add(val);
  };

  const out: GnrV2CombinedRow[] = [];

  for (const r of reportRows) {
    const usedFnsku = trimStr(r.usedFnsku) || NO_USED_FNSKU;
    const lpn = trimStr(r.lpn);
    const orderId = trimStr(r.orderId);
    if (lpn) addTo(reportLpnByFnsku, usedFnsku, lpn);
    if (orderId) addTo(reportOrderByFnsku, usedFnsku, orderId);
    out.push({
      usedMsku: trimStr(r.usedMsku) || "(No Used SKU)",
      usedFnsku,
      origFnsku: trimStr(r.fnsku),
      asin: trimStr(r.asin),
      usedCondition: trimStr(r.usedCondition),
      quantity: r.quantity || 0,
      unitStatus: r.unitStatus,
      orderId: orderId || null,
      lpn: lpn || null,
      date: r.reportDate,
    });
  }

  for (const r of manualRows) {
    const usedMsku = trimStr(r.usedMsku) || `Manual: ${trimStr(r.msku)}`;
    const usedFnsku = trimStr(r.usedFnsku) || trimStr(r.fnsku) || NO_USED_FNSKU;
    const lpn = trimStr(r.lpn);
    const orderId = trimStr(r.orderId);

    // Dedupe: report wins when an identifier collides for the same usedFnsku.
    const lpnDup = lpn ? reportLpnByFnsku.get(usedFnsku)?.has(lpn) ?? false : false;
    const orderDup = orderId
      ? reportOrderByFnsku.get(usedFnsku)?.has(orderId) ?? false
      : false;
    if (lpnDup || orderDup) continue;

    const usedCondition = trimStr(r.usedCondition) || trimStr(r.grade);
    const unitStatus = trimStr(r.unitStatus) || "Succeeded";
    out.push({
      usedMsku,
      usedFnsku,
      origFnsku: trimStr(r.fnsku),
      asin: trimStr(r.asin),
      usedCondition,
      quantity: r.quantity || 0,
      unitStatus,
      orderId: orderId || null,
      lpn: lpn || null,
      date: r.gradedDate,
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────
// Grading aggregation
// ─────────────────────────────────────────────────────────

/** Aggregate combined rows into one bucket per (usedMsku, usedFnsku). */
export function aggregateGnrV2(rows: GnrV2CombinedRow[]): GnrV2Agg[] {
  const map = new Map<
    string,
    GnrV2Agg & { orderIds: Set<string>; dateQty: Map<string, number> }
  >();
  for (const r of rows) {
    const k = `${r.usedMsku}|${r.usedFnsku}`;
    let prev = map.get(k);
    if (!prev) {
      prev = {
        usedMsku: r.usedMsku,
        usedFnsku: r.usedFnsku,
        origFnsku: r.origFnsku,
        asin: r.asin,
        usedCondition: r.usedCondition,
        gnrQty: 0,
        succeededQty: 0,
        failedQty: 0,
        orderCount: 0,
        firstDate: null,
        lastDate: null,
        gnrDates: [],
        orderIds: new Set<string>(),
        dateQty: new Map<string, number>(),
      };
      map.set(k, prev);
    }
    const q = r.quantity || 0;
    prev.gnrQty += q;
    const us = (r.unitStatus ?? "").toLowerCase();
    if (us === "succeeded") prev.succeededQty += q;
    else if (us === "failed") prev.failedQty += q;
    if (!prev.origFnsku && r.origFnsku) prev.origFnsku = r.origFnsku;
    if (!prev.asin && r.asin) prev.asin = r.asin;
    if (!prev.usedCondition && r.usedCondition) prev.usedCondition = r.usedCondition;
    if (r.orderId) prev.orderIds.add(r.orderId);
    if (r.date) {
      if (!prev.firstDate || r.date < prev.firstDate) prev.firstDate = r.date;
      if (!prev.lastDate || r.date > prev.lastDate) prev.lastDate = r.date;
      const ds = fmtDate(r.date);
      prev.dateQty.set(ds, (prev.dateQty.get(ds) ?? 0) + q);
    }
  }
  const out: GnrV2Agg[] = [];
  for (const v of map.values()) {
    v.orderCount = v.orderIds.size;
    // Per-date grading breakdown, newest first (for the GNR Date hover).
    v.gnrDates = [...v.dateQty.entries()]
      .map(([date, qty]) => ({ date, qty }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const { orderIds: _drop, dateQty: _drop2, ...rest } = v;
    void _drop;
    void _drop2;
    out.push(rest);
  }
  return out;
}

/**
 * A used FNSKU is "mixed" with regular stock — and therefore NOT independently
 * reconcilable on this tab — when the grading output FNSKU equals the original
 * FNSKU, or when no used FNSKU was present in the source at all (the combine
 * substitutes the NO_USED_FNSKU placeholder, or falls the manual row back onto
 * its original fnsku). Such rows belong in Full Inventory Recon.
 */
export function isMixedSkuAgg(agg: {
  usedFnsku: string;
  origFnsku: string;
}): boolean {
  const used = trimStr(agg.usedFnsku);
  const orig = trimStr(agg.origFnsku);
  if (!used || used === NO_USED_FNSKU) return true;
  return used.toLowerCase() === orig.toLowerCase();
}

// ─────────────────────────────────────────────────────────
// Ledger anchor (fba_summary)
// ─────────────────────────────────────────────────────────

export type GnrV2LedgerInputRow = {
  msku: string | null;
  fnsku: string | null;
  endingBalance: number;
  startingBalance: number;
  disposition: string | null;
  receipts: number;
  found: number;
  lost: number;
  damaged: number;
  disposedQty: number;
  otherEvents: number;
  unknownEvents: number;
  summaryDate: Date | null;
};

/**
 * Pair-matched ledger index. fba_summary carries msku, so a used SKU resolves to
 * its EXACT (msku, fnsku) pair; a summary row with a different non-blank msku must
 * never leak into another used SKU on the same fnsku. Rows with a blank msku are
 * additionally aggregated into a fnsku-only fallback (see lookupLedger).
 */
export type GnrV2LedgerIndex = {
  /** normId(msku)|normId(fnsku) → ledger anchor. */
  byPair: Map<string, GnrV2Ledger>;
  /** normId(fnsku) → ledger anchor built ONLY from blank-msku summary rows. */
  byFnskuBlank: Map<string, GnrV2Ledger>;
};

function emptyLedger(): GnrV2Ledger {
  return {
    ledgerDate: null,
    ledgerEnding: 0,
    ledgerIn: 0,
    ledgerFound: 0,
    ledgerLost: 0,
    ledgerDamaged: 0,
    ledgerDisposed: 0,
    ledgerOther: 0,
    ledgerUnknown: 0,
    unsellableOnHand: 0,
    ledgerDispositions: [],
    openingBal: 0,
  };
}

/**
 * Build the pair-matched ledger index from fba_summary. Each anchor:
 *   ledgerDate       = latest summaryDate for that group
 *   ledgerEnding     = Σ endingBalance across ALL dispositions on ledgerDate
 *   ledgerIn         = Σ (receipts + found) across all rows (all dates)
 *   ledgerFound      = Σ found across all rows (all dates)
 *   ledgerLost/Damaged/Disposed/Other/Unknown = summed across all rows (all dates)
 *   unsellableOnHand = Σ endingBalance on ledgerDate where disposition != SELLABLE
 *   openingBal       = Σ startingBalance on the EARLIEST summaryDate
 *
 * Two groupings are built in one pass:
 *   byPair       — keyed by normId(msku)|normId(fnsku), over rows with msku present
 *   byFnskuBlank — keyed by normId(fnsku), over rows whose msku is BLANK only
 */
export function buildLedgerMap(rows: GnrV2LedgerInputRow[]): GnrV2LedgerIndex {
  // Group-key per row + the two target maps.
  const byPair = new Map<string, GnrV2Ledger>();
  const byFnskuBlank = new Map<string, GnrV2Ledger>();

  const keyOf = (r: GnrV2LedgerInputRow): { key: string; map: Map<string, GnrV2Ledger> } | null => {
    const f = normId(r.fnsku);
    if (!f) return null;
    const m = normId(r.msku);
    return m
      ? { key: `${m}|${f}`, map: byPair }
      : { key: f, map: byFnskuBlank };
  };

  // Pass 1: latest + earliest summaryDate per group key.
  const latest = new Map<string, number>();
  const earliest = new Map<string, number>();
  for (const r of rows) {
    const g = keyOf(r);
    if (!g) continue;
    const ts = r.summaryDate ? r.summaryDate.getTime() : -Infinity;
    const lprev = latest.get(g.key);
    if (lprev === undefined || ts > lprev) latest.set(g.key, ts);
    if (r.summaryDate) {
      const eprev = earliest.get(g.key);
      if (eprev === undefined || ts < eprev) earliest.set(g.key, ts);
    }
  }

  // Pass 2: accumulate into the right map.
  for (const r of rows) {
    const g = keyOf(r);
    if (!g) continue;
    let acc = g.map.get(g.key);
    if (!acc) {
      acc = emptyLedger();
      g.map.set(g.key, acc);
    }
    // All-dates accumulations.
    acc.ledgerIn += (r.receipts || 0) + (r.found || 0);
    acc.ledgerFound += r.found || 0;
    acc.ledgerLost += r.lost || 0;
    acc.ledgerDamaged += r.damaged || 0;
    acc.ledgerDisposed += r.disposedQty || 0;
    acc.ledgerOther += r.otherEvents || 0;
    acc.ledgerUnknown += r.unknownEvents || 0;
    const ts = r.summaryDate ? r.summaryDate.getTime() : -Infinity;
    // Ending balance + unsellable on-hand only on the latest date.
    if (ts === latest.get(g.key)) {
      const bal = r.endingBalance || 0;
      acc.ledgerEnding += bal;
      const disp = (r.disposition ?? "").trim();
      if (disp.toLowerCase() !== SELLABLE) {
        acc.unsellableOnHand += bal;
      }
      const dispKey = disp || "—";
      const existing = acc.ledgerDispositions.find((d) => d.disposition === dispKey);
      if (existing) existing.qty += bal;
      else acc.ledgerDispositions.push({ disposition: dispKey, qty: bal });
      if (r.summaryDate && (!acc.ledgerDate || r.summaryDate > acc.ledgerDate)) {
        acc.ledgerDate = r.summaryDate;
      }
    }
    // Opening balance only on the earliest dated rows.
    if (earliest.get(g.key) !== undefined && ts === earliest.get(g.key)) {
      acc.openingBal += r.startingBalance || 0;
    }
  }
  return { byPair, byFnskuBlank };
}

/**
 * Resolve the ledger anchor for a used SKU: exact (msku, fnsku) pair first, else
 * the fnsku-only aggregate built from BLANK-msku summary rows. Returns undefined
 * when neither exists (no ledger data for this fnsku).
 */
export function lookupLedger(
  index: GnrV2LedgerIndex,
  msku: string,
  fnsku: string,
): GnrV2Ledger | undefined {
  const f = normId(fnsku);
  if (!f) return undefined;
  return index.byPair.get(`${normId(msku)}|${f}`) ?? index.byFnskuBlank.get(f);
}

/**
 * Aggregate inventory_adjustments reason='3' arrivals per FNSKU.
 *
 * BOTH Succeeded and Failed graded units physically re-enter inventory as a
 * positive-qty reason='3' row. Succeeded units later get a Q(-)/P(+) disposition
 * flip to SELLABLE; Failed units stay in unsellable dispositions. We count ONLY
 * the reason='3' positive arrivals here and ignore the Q/P transfer rows
 * entirely (they net to zero and would double-count).
 */
export function buildInvAdjMap(rows: GnrV2InvAdjRow[]): Map<string, GnrV2InMeta> {
  const m = new Map<string, GnrV2InMeta>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    if (trimStr(r.reason) !== "3") continue; // ignore Q/P and all other reasons
    const qty = r.quantity || 0;
    if (qty <= 0) continue;
    let acc = m.get(k);
    if (!acc) {
      acc = { gnrInQty: 0, events: [] };
      m.set(k, acc);
    }
    acc.gnrInQty += qty;
    acc.events.push({
      adjDate: fmtDate(r.adjDate),
      qty,
      referenceId: trimStr(r.referenceId),
      fc: trimStr(r.fulfillmentCenter),
      disposition: trimStr(r.disposition),
    });
  }
  for (const acc of m.values()) {
    acc.events.sort((a, b) => b.adjDate.localeCompare(a.adjDate));
  }
  return m;
}

// ─────────────────────────────────────────────────────────
// Composite-key flow matching
// ─────────────────────────────────────────────────────────

/** Normalise an identifier for matching: trim + upper-case. */
export function normId(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/** Composite used-SKU key: norm(usedMsku)|norm(usedFnsku). */
export function usedKeyOf(usedMsku: string, usedFnsku: string): string {
  return `${normId(usedMsku)}|${normId(usedFnsku)}`;
}

/** Deterministic tie-break: when a tier yields >1 candidate, the smallest key wins. */
function pickOne(keys: string[]): string {
  let best = keys[0];
  for (const k of keys) if (k < best) best = k;
  return best;
}

/**
 * Assign each flow row to at most one used SKU by composite-key matching and sum
 * its { qty, amount } into that used SKU.
 *
 * Per row, the matching TIER is decided by which identifiers the row carries:
 *   a) msku AND fnsku present → exact pair must match a used SKU (no fnsku-only
 *      fallback; if no exact pair exists the row is dropped).
 *   b) fnsku only             → match used SKUs by fnsku.
 *   c) msku only              → match used SKUs by msku.
 * A row with neither identifier is dropped.
 *
 * Exact-pair naturally beats looser matches because a row carrying both fields
 * never falls through to the fnsku/msku tiers. When a tier yields more than one
 * candidate used SKU the row is still counted exactly once (deterministic
 * smallest-key pick) and tallied as ambiguous.
 *
 * The ledger-date cutoff is applied using the FLOW ROW's own fnsku.
 */
export function assignFlowToUsedSkus(
  flows: GnrV2MatchRow[],
  usedSkus: GnrV2UsedKey[],
  cutoffByNormFnsku: Map<string, Date | null>,
  source: GnrV2FlowSource,
): GnrV2MatchResult {
  const byPair = new Map<string, string[]>();
  const byFnsku = new Map<string, string[]>();
  const byMsku = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, key: string) => {
    const list = m.get(k);
    if (list) {
      if (!list.includes(key)) list.push(key);
    } else {
      m.set(k, [key]);
    }
  };
  for (const u of usedSkus) {
    const um = normId(u.usedMsku);
    const uf = normId(u.usedFnsku);
    const key = `${um}|${uf}`;
    if (um && uf) add(byPair, `${um}|${uf}`, key);
    if (uf) add(byFnsku, uf, key);
    if (um) add(byMsku, um, key);
  }

  const byUsedKey = new Map<string, { qty: number; amount: number }>();
  const detailsByUsedKey = new Map<string, GnrV2MatchRow[]>();
  const dropped: GnrV2MatchResult["dropped"] = [];
  let ambiguous = 0;
  for (const r of flows) {
    const m = normId(r.msku);
    const f = normId(r.fnsku);

    let candidates: string[] | undefined;
    if (m && f) {
      candidates = byPair.get(`${m}|${f}`);
      // Strict: a both-field row with no exact pair is DROPPED (no fnsku
      // fallback — that would re-contaminate across MSKU suffix variants). Record
      // it so suffix-variant losses are visible.
      if (!candidates || candidates.length === 0) {
        dropped.push({ source, msku: trimStr(r.msku), fnsku: trimStr(r.fnsku), qty: r.qty || 0 });
        continue;
      }
    } else if (f) {
      candidates = byFnsku.get(f);
    } else if (m) {
      candidates = byMsku.get(m);
    }
    if (!candidates || candidates.length === 0) continue;

    // Cutoff keyed by the flow row's own fnsku.
    if (!withinCutoff(r.date, cutoffByNormFnsku.get(f) ?? null)) continue;

    if (candidates.length > 1) ambiguous++;
    const target = candidates.length === 1 ? candidates[0] : pickOne(candidates);
    const prev = byUsedKey.get(target) ?? { qty: 0, amount: 0 };
    prev.qty += r.qty || 0;
    prev.amount += r.amount || 0;
    byUsedKey.set(target, prev);
    // Stash the exact contributing row so the action can build a detail popover
    // whose Σ qty equals byUsedKey[target].qty (same cutoff, same target).
    let list = detailsByUsedKey.get(target);
    if (!list) {
      list = [];
      detailsByUsedKey.set(target, list);
    }
    list.push(r);
  }
  return { byUsedKey, detailsByUsedKey, ambiguous, dropped };
}

/** Merge dropped rows from several streams into a payload summary (sample ≤20). */
export function summariseDropped(parts: GnrV2MatchResult[]): GnrV2DroppedSummary {
  let count = 0;
  let totalQty = 0;
  const sample: GnrV2DroppedSummary["sample"] = [];
  for (const p of parts) {
    for (const d of p.dropped) {
      count++;
      totalQty += d.qty;
      if (sample.length < 20) sample.push(d);
    }
  }
  return { count, totalQty, sample };
}

/** Sales → match rows, excluding productAmount == 0. Sign applied later.
 *  Carries orderId + the row's productAmount so the Sales detail popover can show
 *  per-order qty and amount (amount is detail-only; not consumed by the recon). */
export function salesToMatchRows(rows: GnrV2SaleRow[]): GnrV2MatchRow[] {
  const out: GnrV2MatchRow[] = [];
  for (const r of rows) {
    const amt = r.productAmount ? Number(r.productAmount.toString()) : 0;
    if (amt === 0) continue;
    out.push({
      msku: r.msku,
      fnsku: r.fnsku,
      qty: r.quantity || 0,
      amount: amt,
      date: r.date,
      orderId: r.orderId ?? null,
    });
  }
  return out;
}

/** Plain flow (returns / removal inputs) → match rows. Carries orderId +
 *  disposition for the detail popover. */
export function flowToMatchRows(rows: GnrV2FlowRow[]): GnrV2MatchRow[] {
  return rows.map((r) => ({
    msku: r.msku,
    fnsku: r.fnsku,
    qty: r.quantity || 0,
    amount: 0,
    date: r.date,
    orderId: r.orderId ?? null,
    disposition: r.disposition ?? null,
  }));
}

/**
 * Removals → match rows. Prefer removal_shipments; fall back to fba_removals only
 * for fnskus (norm) that have NO shipment rows at all. Presence — not summed qty —
 * decides the fallback, matching the prior per-fnsku rule.
 *
 * Each row is tagged with its source ('shipment' | 'removal-order') for the
 * detail popover.
 */
export function removalsToMatchRows(
  shipments: GnrV2FlowRow[],
  fallback: GnrV2FlowRow[],
): GnrV2MatchRow[] {
  const hasShipmentFnsku = new Set<string>();
  for (const r of shipments) {
    const f = normId(r.fnsku);
    if (f) hasShipmentFnsku.add(f);
  }
  const out: GnrV2MatchRow[] = flowToMatchRows(shipments).map((r) => ({
    ...r,
    source: "shipment" as const,
  }));
  for (const r of fallback) {
    if (hasShipmentFnsku.has(normId(r.fnsku))) continue;
    out.push({
      msku: r.msku,
      fnsku: r.fnsku,
      qty: r.quantity || 0,
      amount: 0,
      date: r.date,
      orderId: r.orderId ?? null,
      disposition: r.disposition ?? null,
      source: "removal-order",
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Cell detail popovers (Sales / Returns / Removals)
// ─────────────────────────────────────────────────────────

/** Max detail rows surfaced per cell; the rest are summarised as "+N more". */
const DETAIL_CAP = 50;

/**
 * Sort matched rows by date desc, map to a typed detail, and cap at DETAIL_CAP.
 * `totalCount` is the pre-cap row count so the table can render "+N more".
 *
 * IMPORTANT: the cap only limits what's *shown* — these are the same rows whose
 * Σ qty equals the cell's signed value, so the popover always explains its cell
 * (the footer total is computed from all matched rows, not just the shown cap).
 */
function buildDetailList<T>(
  matched: GnrV2MatchRow[] | undefined,
  toDetail: (r: GnrV2MatchRow) => T,
): GnrV2DetailList<T> {
  if (!matched || matched.length === 0) return { rows: [], totalCount: 0 };
  // Date desc; undated rows sort last. Stable enough for display.
  const sorted = [...matched].sort((a, b) => {
    const ta = a.date ? a.date.getTime() : -Infinity;
    const tb = b.date ? b.date.getTime() : -Infinity;
    return tb - ta;
  });
  return {
    rows: sorted.slice(0, DETAIL_CAP).map(toDetail),
    totalCount: sorted.length,
  };
}

export function buildSalesDetails(
  matched: GnrV2MatchRow[] | undefined,
): GnrV2DetailList<GnrV2SaleDetail> {
  return buildDetailList(matched, (r) => ({
    date: fmtDate(r.date),
    orderId: trimStr(r.orderId),
    qty: r.qty || 0,
    amount: r.amount || 0,
  }));
}

export function buildReturnDetails(
  matched: GnrV2MatchRow[] | undefined,
): GnrV2DetailList<GnrV2ReturnDetail> {
  return buildDetailList(matched, (r) => ({
    date: fmtDate(r.date),
    orderId: trimStr(r.orderId),
    qty: r.qty || 0,
    disposition: trimStr(r.disposition),
  }));
}

export function buildRemovalDetails(
  matched: GnrV2MatchRow[] | undefined,
): GnrV2DetailList<GnrV2RemovalDetail> {
  return buildDetailList(matched, (r) => ({
    date: fmtDate(r.date),
    orderId: trimStr(r.orderId),
    qty: r.qty || 0,
    source: r.source ?? "removal-order",
  }));
}

// ─────────────────────────────────────────────────────────
// Reimbursements (reversal-aware) — mirrors full-reconciliation aggregateReimbursements
// ─────────────────────────────────────────────────────────

/**
 * Resolve reimbursements into signed match rows (ledger-date cutoff is applied
 * later inside assignFlowToUsedSkus). Only reasons in REIMB_REASON_FILTER count.
 *
 * Reimbursement_Reversal rows: resolve the original reason via originalReimbType
 * first, else by looking up originalReimbId in the reimbursementId→reason index.
 * If the resolved reason passes the filter, the reversal contributes NEGATED qty
 * and amount; otherwise it is dropped. The resulting rows keep msku + fnsku so
 * the composite matcher can assign them.
 */
export function reimbToMatchRows(rows: GnrV2ReimbRow[]): GnrV2MatchRow[] {
  const idToReason = new Map<string, string>();
  for (const r of rows) {
    const id = trimStr(r.reimbursementId);
    if (!id) continue;
    const reason = trimStr(r.reason);
    if (reason) idToReason.set(id, reason);
  }

  const out: GnrV2MatchRow[] = [];
  for (const r of rows) {
    const rawReason = trimStr(r.reason);
    const isReversal = rawReason.toLowerCase() === "reimbursement_reversal";

    let negate: boolean;
    if (isReversal) {
      const origType = trimStr(r.originalReimbType);
      const origId = trimStr(r.originalReimbId);
      const resolved = origType || (origId ? idToReason.get(origId) ?? "" : "");
      if (!resolved || !matchesReimbFilter(resolved)) continue;
      negate = true;
    } else if (matchesReimbFilter(rawReason)) {
      negate = false;
    } else {
      continue;
    }

    const qty = r.quantity || 0;
    const amt = r.amount ? Number(r.amount.toString()) : 0;
    out.push({
      msku: r.msku,
      fnsku: r.fnsku,
      qty: negate ? -qty : qty,
      amount: negate ? -amt : amt,
      date: r.date,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────
// Case + adjustment overlays
// ─────────────────────────────────────────────────────────

const CASE_STATUS_PRI: Record<string, number> = {
  RESOLVED: 5,
  IN_PROGRESS: 4,
  OPEN: 3,
  REJECTED: 2,
  CLOSED: 1,
};
const CASE_STATUS_LABEL: Record<string, string> = {
  RESOLVED: "resolved",
  IN_PROGRESS: "raised",
  OPEN: "raised",
  REJECTED: "rejected",
  CLOSED: "resolved",
};

/** Case overlay keyed by used FNSKU. */
export function buildCaseMapV2(
  rows: GnrV2CaseRow[],
): Map<string, GnrV2CaseMeta> {
  type Acc = {
    claimedQty: number;
    approvedQty: number;
    approvedAmount: number;
    count: number;
    topStatus: string;
    caseIds: string[];
    reasons: string[];
  };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    let prev = acc.get(k);
    if (!prev) {
      prev = { claimedQty: 0, approvedQty: 0, approvedAmount: 0, count: 0, topStatus: "", caseIds: [], reasons: [] };
      acc.set(k, prev);
    }
    prev.count++;
    prev.claimedQty += r.unitsClaimed || 0;
    prev.approvedQty += r.unitsApproved || 0;
    prev.approvedAmount += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
    const ref = trimStr(r.referenceId);
    if (ref && !prev.caseIds.includes(ref)) prev.caseIds.push(ref);
    const reason = trimStr(r.caseReason);
    if (reason && !prev.reasons.includes(reason)) prev.reasons.push(reason);
    const sk = (r.status ?? "").toUpperCase();
    const rank = CASE_STATUS_PRI[sk] ?? 0;
    const currentRank =
      CASE_STATUS_PRI[prev.topStatus.toUpperCase().replace(/ /g, "_")] ?? -1;
    if (rank > currentRank) prev.topStatus = CASE_STATUS_LABEL[sk] ?? "raised";
  }
  const m = new Map<string, GnrV2CaseMeta>();
  for (const [k, v] of acc) {
    m.set(k, {
      claimedQty: v.claimedQty,
      approvedQty: v.approvedQty,
      approvedAmount: v.approvedAmount,
      count: v.count,
      topStatus: v.topStatus,
      caseIds: v.caseIds.join(", "),
      reasons: v.reasons.join("; "),
    });
  }
  return m;
}

/** Adjustment overlay keyed by used MSKU. */
export function buildAdjMapV2(rows: GnrV2AdjRow[]): Map<string, GnrV2AdjMeta> {
  type Acc = { qty: number; count: number; reasons: string[] };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const k = trimStr(r.msku);
    if (!k) continue;
    let prev = acc.get(k);
    if (!prev) {
      prev = { qty: 0, count: 0, reasons: [] };
      acc.set(k, prev);
    }
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    const reason = trimStr(r.reason);
    if (reason && !prev.reasons.includes(reason)) prev.reasons.push(reason);
  }
  const m = new Map<string, GnrV2AdjMeta>();
  for (const [k, v] of acc) {
    m.set(k, { qty: v.qty, count: v.count, reasons: v.reasons.join("; ") });
  }
  return m;
}

// ─────────────────────────────────────────────────────────
// Status + row composition
// ─────────────────────────────────────────────────────────

/**
 * Coarse 3-level grouping over the granular GnrV2Status. The granular statuses
 * are unchanged — this only buckets them for the top-level cards / filters.
 *
 * EXHAUSTIVE by construction: the satisfies check below makes a new GnrV2Status
 * without a group a compile error.
 */
export const STATUS_TO_GROUP = {
  // take-action — needs a human: claim, act, or it's not auto-reconcilable here
  "claim-inbound": "take-action",
  "take-action": "take-action",
  "mixed-sku": "take-action",
  "no-snapshot": "take-action",
  waiting: "take-action",
  "pending-data": "take-action",
  // no-action — reconciled / settled, nothing to do
  matched: "no-action",
  resolved: "no-action",
  reimbursed: "no-action",
  // excess — more on hand / arrived than expected
  "over-accounted": "excess",
  review: "excess",
} satisfies Record<GnrV2Status, GnrV2ActionGroup>;

/** All action groups, in display order. */
export const GNR_V2_ACTION_GROUPS: GnrV2ActionGroup[] = [
  "take-action",
  "no-action",
  "excess",
];

/** Resolve the coarse action group for a granular status. */
export function actionGroupOf(status: GnrV2Status): GnrV2ActionGroup {
  return STATUS_TO_GROUP[status];
}

/**
 * Resolve the v2 status. Priority order is exactly:
 *   0. mixed SKU (usedFnsku == origFnsku / empty) → mixed-sku (no per-FNSKU recon)
 *   1. no ledger data → take-action (==0) / review (<0) / no-snapshot (>0)
 *   2. inboundGap < 0 (actual < expected, missing inbound) AND not suppressed:
 *        grading newer than the adjustments report → pending-data
 *        else                                      → claim-inbound
 *      (suppressed = the shortfall is covered by pre-window opening balance)
 *   3. inboundGap > 0 (actual > expected) → review (more arrivals than the GNR
 *      report; extra / unrecorded grading; no claim possible)
 *   4. variance == 0:
 *        closed by a human (manual adj or approved case) → resolved
 *        else                                            → matched
 *   5. variance > 0   → over-accounted
 *   6. variance < 0 fully covered by reimbQty + caseApprovedQty → reimbursed
 *   7. variance < 0 and last GNR report <= 60d → waiting
 *   8. otherwise       → take-action
 */
export function computeV2Status(input: {
  isMixedSku: boolean;
  hasLedger: boolean;
  computedEnding: number;
  inboundGap: number;
  inboundSuppressed: boolean;
  gradingNewerThanAdj: boolean;
  variance: number;
  reimbQty: number;
  caseApprovedQty: number;
  /** A manual adjustment or approved case touched this row (drives 'resolved'). */
  resolvedByHuman: boolean;
  daysSince: number;
}): GnrV2Status {
  const {
    isMixedSku,
    hasLedger,
    computedEnding,
    inboundGap,
    inboundSuppressed,
    gradingNewerThanAdj,
    variance,
    reimbQty,
    caseApprovedQty,
    resolvedByHuman,
    daysSince,
  } = input;

  if (isMixedSku) return "mixed-sku";
  if (!hasLedger) {
    // No ledger anchor → can't verify. computed 0 is unverified, not reconciled,
    // so it needs a human → take-action (there is no separate 'balanced' status).
    if (computedEnding === 0) return "take-action";
    if (computedEnding < 0) return "review";
    return "no-snapshot";
  }
  // Gap = Actual − Expected. Negative gap = FEWER arrivals than graded units
  // expected = missing inbound → claimable (pending-data while the report may be
  // mid-upload), unless covered by pre-window opening balance.
  if (inboundGap < 0 && !inboundSuppressed) {
    return gradingNewerThanAdj ? "pending-data" : "claim-inbound";
  }
  // Positive gap = MORE reason-3 arrivals than the GNR report accounts for
  // (extra / unrecorded grading). No claim can apply.
  if (inboundGap > 0) return "review";
  // variance == 0: a row a human closed via a manual adjustment or an approved
  // case is 'resolved' (settled by action), not organically 'matched'.
  if (variance === 0) return resolvedByHuman ? "resolved" : "matched";
  if (variance > 0) return "over-accounted";
  // variance < 0
  const covered = reimbQty + caseApprovedQty;
  if (covered >= Math.abs(variance)) return "reimbursed";
  if (daysSince <= WAITING_WINDOW_DAYS) return "waiting";
  return "take-action";
}

/**
 * Grading is "newer than" the uploaded adjustments report when the latest GNR
 * reportDate falls after (adjCoverageEnd − grace). In that window a missing
 * reason-3 arrival likely just hasn't been uploaded yet, so the inbound gap is
 * pending-data rather than a claim. No coverage end (no adjustments at all)
 * means we cannot make that judgement → treat as NOT newer.
 */
export function isGradingNewerThanAdj(
  lastReportDate: Date | null,
  adjCoverageEnd: Date | null,
  graceDays: number = PENDING_DATA_GRACE_DAYS,
): boolean {
  if (!lastReportDate || !adjCoverageEnd) return false;
  const cutoff = adjCoverageEnd.getTime() - graceDays * MS_PER_DAY;
  return lastReportDate.getTime() > cutoff;
}

export function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 999;
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** Compose one fully reconciled v2 row from an aggregate + all overlays. */
export function composeGnrV2Row(input: {
  agg: GnrV2Agg;
  ledger: GnrV2Ledger | undefined;
  inMeta: GnrV2InMeta | undefined;
  salesQty: number;
  returnQty: number;
  removalQty: number;
  reimb: { qty: number; amount: number } | undefined;
  caseMeta: GnrV2CaseMeta | undefined;
  adj: GnrV2AdjMeta | undefined;
  /** Exact rows whose sum is salesQty / returnQty / removalQty (for popovers). */
  salesMatched?: GnrV2MatchRow[];
  returnsMatched?: GnrV2MatchRow[];
  removalsMatched?: GnrV2MatchRow[];
  /** Product title for this fnsku (fba_summary preferred, inv-adj fallback). */
  title?: string;
  /** Account-wide max(adjDate) from inventory_adjustments; null when none. */
  adjCoverageEnd: Date | null;
  today: Date;
}): GnrV2Row {
  const {
    agg,
    ledger,
    inMeta,
    salesQty,
    returnQty,
    removalQty,
    reimb,
    caseMeta,
    adj,
    salesMatched,
    returnsMatched,
    removalsMatched,
    title,
    adjCoverageEnd,
    today,
  } = input;

  const isMixedSku = isMixedSkuAgg(agg);
  const hasLedger = ledger !== undefined;
  const ledgerEnding = hasLedger ? ledger!.ledgerEnding : null;
  const unsellableOnHand = ledger?.unsellableOnHand ?? 0;
  const ledgerDispositions = ledger?.ledgerDispositions ?? [];
  const openingBal = ledger?.openingBal ?? 0;

  const reimbQty = reimb?.qty ?? 0;
  const reimbAmount = reimb?.amount ?? 0;
  const adjQty = adj?.qty ?? 0;
  const caseClaimedQty = caseMeta?.claimedQty ?? 0;
  const caseApprovedQty = caseMeta?.approvedQty ?? 0;
  const caseApprovedAmount = caseMeta?.approvedAmount ?? 0;

  const succeededQty = agg.succeededQty;
  const failedQty = agg.failedQty;

  // Total graded units expected to re-enter inventory (Succeeded + Failed).
  const expectedInQty = succeededQty + failedQty;
  // Actual arrivals seen in inventory_adjustments reason='3'.
  const gnrInQty = inMeta?.gnrInQty ?? 0;
  const gnrInEvents = inMeta?.events ?? [];

  // Check A — inbound gap = ACTUAL − EXPECTED.
  //   negative → graded units that never showed up as a reason='3' arrival (claim)
  //   positive → more arrivals than graded (extra / unrecorded → review)
  const inboundGap = gnrInQty - expectedInQty;
  const inboundShortfall = -inboundGap; // missing units (positive when arrivals < expected)
  // Suppress the claim when the opening balance already accounts for the shortfall:
  // those units predate the ledger window and so were never going to appear as
  // an in-window arrival. Flagged, not claimed.
  const inboundSuppressed = inboundShortfall > 0 && openingBal >= inboundShortfall;
  const inboundNote: GnrV2Row["inboundNote"] = inboundSuppressed ? "pre-window" : "";
  const gradingNewerThanAdj = isGradingNewerThanAdj(agg.lastDate, adjCoverageEnd);

  // Check B — balance starts from ACTUAL arrivals (gnrInQty), not graded qty.
  // SIGNED display fields are the single source of truth: the table, CSV, and
  // header totals render these verbatim, and computedEnding is EXACTLY their sum
  // so a column-vs-total mismatch is impossible. adjSigned keeps its stored sign.
  const actualIn = gnrInQty;
  const salesSigned = -salesQty;
  const returnsSigned = returnQty;
  const removalsSigned = -removalQty;
  const adjSigned = adjQty;

  // W/H Events (fba_summary, all dates): found in, lost/damaged/disposed out.
  const whFound = ledger?.ledgerFound ?? 0;
  const whLost = ledger?.ledgerLost ?? 0;
  const whDamaged = ledger?.ledgerDamaged ?? 0;
  const whDisposed = ledger?.ledgerDisposed ?? 0;
  const whEventsSigned = whFound - whLost - whDamaged - whDisposed;
  const whBreakdown: GnrV2WhBreakdown = {
    found: whFound,
    lost: whLost,
    damaged: whDamaged,
    disposed: whDisposed,
  };

  // Ledger Adj — single source fba_summary: other + unknown events, less the
  // reason-3 arrivals (already counted as Actual In, so netted out to avoid a
  // double-count in computedEnding). No ledger data → 0 (and we must NOT cancel a
  // phantom actualIn when there's no fba_summary movement to net against).
  const ledgerOther = ledger?.ledgerOther ?? 0;
  const ledgerUnknown = ledger?.ledgerUnknown ?? 0;
  const ledgerOtherRaw = ledgerOther + ledgerUnknown;
  const ledgerAdjSigned = hasLedger ? ledgerOtherRaw - actualIn : 0;
  const ledgerAdjBreakdown: GnrV2LedgerAdjBreakdown = {
    other: ledgerOther,
    unknown: ledgerUnknown,
    actualIn: hasLedger ? actualIn : 0,
  };

  const reimbSigned = -reimbQty;
  // Case Approved is MONEY-SIDE display only — NOT a unit movement, excluded
  // from computedEnding. 'reimbursed' status still uses caseApprovedQty to cover
  // |variance|.
  const caseApprSigned = caseApprovedQty;

  // Detail popovers — only for non-zero cells (req: keep payload reasonable).
  // Σ of each list's qty equals the matching signed qty (same cutoff + target).
  const EMPTY_DETAILS = { rows: [], totalCount: 0 };
  const salesDetails = salesQty !== 0 ? buildSalesDetails(salesMatched) : EMPTY_DETAILS;
  const returnDetails = returnQty !== 0 ? buildReturnDetails(returnsMatched) : EMPTY_DETAILS;
  const removalDetails =
    removalQty !== 0 ? buildRemovalDetails(removalsMatched) : EMPTY_DETAILS;

  // Computed End = Actual + Sales + Returns + Removals + Reimb Qty + Manual Adj
  // (all signed). W/H Events and Ledger Adj are surfaced as their own columns but
  // are NOT part of this sum; Case Appr is money-side only.
  // Mixed-SKU rows share an FNSKU with regular stock → recon math nulled below.
  const computedEnding =
    actualIn +
    salesSigned +
    returnsSigned +
    removalsSigned +
    reimbSigned +
    adjSigned;
  const variance = isMixedSku ? null : hasLedger ? ledgerEnding! - computedEnding : null;

  const daysSince = daysBetween(agg.lastDate, today);

  const status = computeV2Status({
    isMixedSku,
    hasLedger,
    computedEnding,
    inboundGap,
    inboundSuppressed,
    gradingNewerThanAdj,
    variance: variance ?? 0,
    reimbQty,
    caseApprovedQty,
    // A manual adjustment (nonzero) or an approved case means a human touched it.
    resolvedByHuman: adjQty !== 0 || caseApprovedQty > 0,
    daysSince,
  });

  return {
    gnrDate: fmtDate(agg.lastDate),
    gnrDates: agg.gnrDates,
    usedMsku: agg.usedMsku,
    usedFnsku: agg.usedFnsku,
    origFnsku: agg.origFnsku || "—",
    asin: agg.asin || "—",
    title: trimStr(title),
    usedCondition: agg.usedCondition || "—",
    succeededQty,
    failedQty,
    gnrQty: agg.gnrQty,
    expectedInQty,
    gnrInQty,
    gnrInEvents,
    isMixedSku,
    ledgerEnding,
    ledgerDate: fmtDate(ledger?.ledgerDate ?? null),
    ledgerDispositions,
    ledgerLost: ledger?.ledgerLost ?? 0,
    ledgerDamaged: ledger?.ledgerDamaged ?? 0,
    ledgerDisposed: ledger?.ledgerDisposed ?? 0,
    unsellableOnHand,
    openingBal,
    hasLedger,
    salesQty,
    returnQty,
    removalQty,
    reimbQty,
    reimbAmount,
    adjQty,
    caseClaimedQty,
    caseApprovedQty,
    caseApprovedAmount,
    actualIn,
    salesSigned,
    returnsSigned,
    removalsSigned,
    whEventsSigned,
    ledgerAdjSigned,
    adjSigned,
    reimbSigned,
    caseApprSigned,
    whBreakdown,
    ledgerAdjBreakdown,
    salesDetails,
    returnDetails,
    removalDetails,
    caseCount: caseMeta?.count ?? 0,
    caseTopStatus: caseMeta?.topStatus ?? "",
    caseIds: caseMeta?.caseIds ?? "",
    caseReasons: caseMeta?.reasons ?? "",
    adjReasons: adj?.reasons ?? "",
    inboundGap,
    inboundNote,
    computedEnding,
    variance,
    status,
    actionGroup: actionGroupOf(status),
    daysSince,
  };
}

/** Fractional threshold above which reason='3' arrivals are flagged as off. */
const REASON3_WARN_FRACTION = 0.1;

const EMPTY_DROPPED: GnrV2DroppedSummary = { count: 0, totalQty: 0, sample: [] };

export function summaryStatsV2(
  rows: GnrV2Row[],
  ambiguousFlowRows = 0,
  droppedPairRows: GnrV2DroppedSummary = EMPTY_DROPPED,
): GnrV2Stats {
  // Zero-init every status + group so the cards always render a number.
  const byStatus = Object.fromEntries(
    (Object.keys(STATUS_TO_GROUP) as GnrV2Status[]).map((s) => [s, 0]),
  ) as Record<GnrV2Status, number>;
  const byGroup: Record<GnrV2ActionGroup, number> = {
    "take-action": 0,
    "no-action": 0,
    excess: 0,
  };

  let totalReason3Qty = 0;
  let totalExpectedIn = 0;
  for (const r of rows) {
    // Mixed-SKU rows are not reconciled here, so exclude them from the
    // account-wide reason-3 sanity check (their FNSKU spans regular stock).
    if (!r.isMixedSku) {
      totalReason3Qty += r.gnrInQty;
      totalExpectedIn += r.expectedInQty;
    }
    byStatus[r.status]++;
    byGroup[r.actionGroup]++;
  }
  const reason3Warn =
    totalExpectedIn > 0 &&
    Math.abs(totalReason3Qty - totalExpectedIn) / totalExpectedIn > REASON3_WARN_FRACTION;
  return {
    totalSkus: rows.length,
    // Back-compat granular fields (derived from byStatus).
    matched: byStatus.matched,
    claimInbound: byStatus["claim-inbound"],
    takeAction: byStatus["take-action"],
    waiting: byStatus.waiting,
    overAccounted: byStatus["over-accounted"],
    reimbursed: byStatus.reimbursed,
    mixedSku: byStatus["mixed-sku"],
    byStatus,
    byGroup,
    totalReason3Qty,
    totalExpectedIn,
    reason3Warn,
    ambiguousFlowRows,
    droppedPairRows,
  };
}

// ─────────────────────────────────────────────────────────
// ASIN drill-down — client-side aggregation over GnrV2Row members
// ─────────────────────────────────────────────────────────

/** Status severity for picking an ASIN's dominant (most-actionable) status. */
const STATUS_SEVERITY: Record<GnrV2Status, number> = {
  "claim-inbound": 100,
  "take-action": 95,
  "pending-data": 90,
  waiting: 85,
  "no-snapshot": 80,
  "mixed-sku": 70,
  "over-accounted": 60,
  review: 55,
  resolved: 30,
  reimbursed: 20,
  matched: 10,
};

/**
 * Group used-SKU rows by ASIN, summing the NON-MIXED members. Mixed-sku members
 * are kept in `members` (for display) but excluded from every reconciliation sum
 * — they share an FNSKU with regular stock so per-FNSKU math is invalid. Status
 * is the most-actionable member status (STATUS_SEVERITY). Pure; client-callable.
 */
export function aggregateAsinRows(rows: GnrV2Row[]): GnrV2AsinRow[] {
  const byAsin = new Map<string, GnrV2Row[]>();
  for (const r of rows) {
    const key = r.asin || "—";
    const list = byAsin.get(key);
    if (list) list.push(r);
    else byAsin.set(key, [r]);
  }

  const out: GnrV2AsinRow[] = [];
  for (const [asin, members] of byAsin) {
    const real = members.filter((m) => !m.isMixedSku);
    const sum = (pick: (m: GnrV2Row) => number) => real.reduce((s, m) => s + pick(m), 0);

    // Ledger coverage over the reconcilable (non-mixed) members.
    const reconcilableCount = real.length;
    const ledgerCoveredCount = real.filter((m) => m.hasLedger).length;
    // PARTIAL: some — but not all — reconcilable members have a ledger snapshot.
    // A variance from partial sums is misleading, so suppress the ledger side.
    const partialLedger =
      reconcilableCount > 0 && ledgerCoveredCount > 0 && ledgerCoveredCount < reconcilableCount;
    const fullyCovered = reconcilableCount > 0 && ledgerCoveredCount === reconcilableCount;

    const expectedInQty = sum((m) => m.expectedInQty);
    const actualIn = sum((m) => m.actualIn);
    const computedEnding = sum((m) => m.computedEnding);

    // Ledger-side sums only when EVERY reconcilable member is covered.
    const ledgerEnding = fullyCovered ? sum((m) => m.ledgerEnding ?? 0) : null;
    const variance = ledgerEnding === null ? null : ledgerEnding - computedEnding;
    const whBreakdownSuppressed = !fullyCovered;

    const ledgerNote = partialLedger
      ? `${ledgerCoveredCount} of ${reconcilableCount} SKUs have a ledger snapshot — upload covering ledger to reconcile this ASIN`
      : ledgerCoveredCount === 0 && reconcilableCount > 0
        ? "No ledger snapshot for this ASIN — upload covering ledger to reconcile"
        : "";

    // Dominant status across ALL members (incl. mixed — mixed-sku is actionable).
    let status: GnrV2Status = members[0].status;
    for (const m of members) {
      if (STATUS_SEVERITY[m.status] > STATUS_SEVERITY[status]) status = m.status;
    }
    // Partial coverage → no-snapshot (can't trust a partial variance), unless a
    // member already raises a more-urgent flag (claim/take-action/mixed/pending).
    if (partialLedger && STATUS_SEVERITY[status] < STATUS_SEVERITY["no-snapshot"]) {
      status = "no-snapshot";
    }

    // Latest gnrDate; daysSince = min (most recent) across members that have one.
    let gnrDate = "";
    let daysSince = 999;
    for (const m of members) {
      if (m.gnrDate && m.gnrDate > gnrDate) gnrDate = m.gnrDate;
      if (m.daysSince < daysSince) daysSince = m.daysSince;
    }

    const conditions: string[] = [];
    let title = "";
    for (const m of members) {
      const c = trimStr(m.usedCondition);
      if (c && c !== "—" && !conditions.includes(c)) conditions.push(c);
      if (!title && trimStr(m.title)) title = trimStr(m.title);
    }

    out.push({
      asin,
      title,
      members,
      memberCount: members.length,
      mixedCount: members.length - real.length,
      ledgerCoveredCount,
      reconcilableCount,
      partialLedger,
      ledgerNote,
      conditions,
      gnrDate,
      daysSince,
      expectedInQty,
      actualIn,
      inboundGap: actualIn - expectedInQty,
      salesSigned: sum((m) => m.salesSigned),
      returnsSigned: sum((m) => m.returnsSigned),
      removalsSigned: sum((m) => m.removalsSigned),
      reimbSigned: sum((m) => m.reimbSigned),
      adjSigned: sum((m) => m.adjSigned),
      computedEnding,
      ledgerEnding,
      variance,
      whBreakdownSuppressed,
      reimbQty: sum((m) => m.reimbQty),
      salesQty: sum((m) => m.salesQty),
      returnQty: sum((m) => m.returnQty),
      removalQty: sum((m) => m.removalQty),
      adjQty: sum((m) => m.adjQty),
      caseClaimedQty: sum((m) => m.caseClaimedQty),
      caseApprovedQty: sum((m) => m.caseApprovedQty),
      unsellableOnHand: sum((m) => m.unsellableOnHand),
      status,
      actionGroup: actionGroupOf(status),
    });
  }

  // Most-actionable ASINs first, then by |variance| desc, then ASIN.
  out.sort((a, b) => {
    const sa = STATUS_SEVERITY[a.status];
    const sb = STATUS_SEVERITY[b.status];
    if (sa !== sb) return sb - sa;
    const va = Math.abs(a.variance ?? 0);
    const vb = Math.abs(b.variance ?? 0);
    if (va !== vb) return vb - va;
    return a.asin.localeCompare(b.asin);
  });
  return out;
}

/**
 * Merge all members' detail lists into one ASIN-level bundle for the detail
 * sheet. Inbound events sorted date ASC (claim-evidence order); flows date DESC
 * (newest first). Each row is tagged with its source member FNSKU. Reconciliation
 * aggregates (ledger dispositions / W/H / Ledger Adj) cover NON-MIXED members so
 * they match aggregateAsinRows' sums.
 */
export function mergeMemberDetails(members: GnrV2Row[]): GnrV2AsinDetail {
  const real = members.filter((m) => !m.isMixedSku);

  const inEvents = members
    .flatMap((m) => m.gnrInEvents.map((e) => ({ ...e, fnsku: m.usedFnsku })))
    .sort((a, b) => a.adjDate.localeCompare(b.adjDate)); // ASC for claim evidence

  const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

  const sales = members
    .flatMap((m) => m.salesDetails.rows.map((d) => ({ ...d, fnsku: m.usedFnsku })))
    .sort(byDateDesc);
  const returns = members
    .flatMap((m) => m.returnDetails.rows.map((d) => ({ ...d, fnsku: m.usedFnsku })))
    .sort(byDateDesc);
  const removals = members
    .flatMap((m) => m.removalDetails.rows.map((d) => ({ ...d, fnsku: m.usedFnsku })))
    .sort(byDateDesc);

  // Ledger dispositions merged per disposition over non-mixed members.
  const dispMap = new Map<string, number>();
  for (const m of real) {
    for (const d of m.ledgerDispositions) {
      dispMap.set(d.disposition, (dispMap.get(d.disposition) ?? 0) + d.qty);
    }
  }
  const ledgerDispositions = [...dispMap.entries()]
    .map(([disposition, qty]) => ({ disposition, qty }))
    .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));

  const sumR = (pick: (m: GnrV2Row) => number) => real.reduce((s, m) => s + pick(m), 0);
  const whBreakdown: GnrV2WhBreakdown = {
    found: sumR((m) => m.whBreakdown.found),
    lost: sumR((m) => m.whBreakdown.lost),
    damaged: sumR((m) => m.whBreakdown.damaged),
    disposed: sumR((m) => m.whBreakdown.disposed),
  };
  const ledgerAdjBreakdown: GnrV2LedgerAdjBreakdown = {
    other: sumR((m) => m.ledgerAdjBreakdown.other),
    unknown: sumR((m) => m.ledgerAdjBreakdown.unknown),
    actualIn: sumR((m) => m.ledgerAdjBreakdown.actualIn),
  };

  return { inEvents, sales, returns, removals, ledgerDispositions, whBreakdown, ledgerAdjBreakdown };
}
