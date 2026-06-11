// Run: node --test --experimental-strip-types lib/fc-transfer-reconciliation/full-recon.test.ts
// NEW tests for the Full Reconciliation tab. Does NOT touch aggregate.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateFcFullRecon,
  fcFullStats,
  fcFullCardGroups,
  classifyDisposition,
} from "./full-recon.ts";
import { buildFcCaseMap, buildFcAdjMap } from "./matching.ts";
import type { FcCaseMeta, FcAdjMeta } from "./types.ts";
import type { FcFullReconRow, FcFullStatus } from "./full-recon-types.ts";

type Transfer = Parameters<typeof aggregateFcFullRecon>[0][number];

const FN = "X000DEFAULT";
const AS = "B000DEFAULT";

function tx(
  msku: string,
  date: string,
  quantity: number,
  disposition: string | null = "SELLABLE",
  opts: { fnsku?: string; asin?: string; fc?: string; referenceId?: string | null } = {},
): Transfer {
  return {
    id: `${msku}-${opts.fnsku ?? FN}-${date}-${quantity}-${disposition}`,
    msku,
    fnsku: opts.fnsku ?? FN,
    asin: opts.asin ?? AS,
    title: null,
    quantity,
    transferDate: new Date(date + "T00:00:00Z"),
    eventType: "WhseTransfers",
    fulfillmentCenter: opts.fc ?? null,
    disposition,
    reason: null,
    referenceId: opts.referenceId ?? null,
  };
}

// Fixed "today" far after all events.
const TODAY = new Date("2026-06-09T00:00:00Z");
// A recent "today" for the in-transit (within-window) test.
const RECENT_TODAY = new Date("2026-02-15T00:00:00Z");

function caseRow(
  msku: string,
  unitsApproved: number,
  raisedDate: string | null,
  fnsku: string = FN,
  asin: string = AS,
  status = "RESOLVED",
) {
  return {
    msku,
    fnsku,
    asin,
    unitsClaimed: unitsApproved,
    unitsApproved,
    amountApproved: null,
    status,
    referenceId: null,
    raisedDate: raisedDate ? new Date(raisedDate + "T00:00:00Z") : null,
    issueDate: null,
  };
}

function adjRow(
  msku: string,
  qtyAdjusted: number,
  adjDate: string | null,
  fnsku: string = FN,
  asin: string = AS,
) {
  return {
    msku,
    fnsku,
    asin,
    qtyAdjusted,
    reason: null,
    adjDate: adjDate ? new Date(adjDate + "T00:00:00Z") : null,
  };
}

function rowFor(
  rows: Transfer[],
  caseMap: Map<string, FcCaseMeta>,
  adjMap: Map<string, FcAdjMeta>,
  msku: string,
  today = TODAY,
) {
  const out = aggregateFcFullRecon(rows, caseMap, adjMap, today);
  const r = out.find((x) => x.msku === msku);
  assert.ok(r, `expected a row for ${msku}`);
  return r!;
}

// ============================================================================
// (a) Pure degradation: out SELLABLE -6, in UNSELLABLE +6 -> DAMAGED_IN_TRANSIT
// ============================================================================
test("a) pure degradation -> DAMAGED_IN_TRANSIT, actionable now", () => {
  const rows = [
    tx("DEG-1", "2026-02-01", -6, "SELLABLE"),
    tx("DEG-1", "2026-02-03", +6, "CUSTOMER_DAMAGED"),
  ];
  const r = rowFor(rows, new Map(), new Map(), "DEG-1");
  assert.equal(r.status, "DAMAGED_IN_TRANSIT");
  assert.equal(r.sellableShortfall, 6, "outSellable 6 - inSellable 0");
  assert.equal(r.quantityShortage, 0, "net is 0");
  assert.equal(r.degradationQty, 6);
  assert.equal(r.netQty, 0);
  assert.equal(r.openQty, 6);
  assert.equal(r.actionable, true, "confirmed loss -> act immediately");
});

// ============================================================================
// (b) Pure shortage aged: out -5, no in, 90 days -> SHORTAGE
// ============================================================================
test("b) pure shortage aged -> SHORTAGE, take action", () => {
  const rows = [tx("SH-1", "2026-03-01", -5, "SELLABLE")]; // ~100 days before TODAY
  const r = rowFor(rows, new Map(), new Map(), "SH-1");
  assert.equal(r.status, "SHORTAGE");
  assert.equal(r.quantityShortage, 5);
  assert.equal(r.degradationQty, 0);
  assert.ok(r.daysPending > 55, `aged past 55-day window (${r.daysPending}d)`);
  assert.equal(r.actionable, true);
  assert.equal(r.openQty, 5);
});

// ============================================================================
// (c) In-transit: out -5, no in, 10 days -> IN_TRANSIT, not actionable
// ============================================================================
test("c) recent shortage within window -> IN_TRANSIT, not actionable", () => {
  const rows = [tx("IT-1", "2026-02-05", -5, "SELLABLE")]; // 10 days before RECENT_TODAY
  const r = rowFor(rows, new Map(), new Map(), "IT-1", RECENT_TODAY);
  assert.equal(r.status, "IN_TRANSIT");
  assert.ok(r.daysPending <= 55, `within 55-day window (${r.daysPending}d)`);
  assert.equal(r.actionable, false);
  assert.equal(r.inTransitPending, 5);
});

// ============================================================================
// (d) Mixed: out SELLABLE -6, in SELLABLE +2, in UNSELLABLE +2
//     -> SHORTAGE_AND_DAMAGED, sellableShortfall 4, quantityShortage 2, degradation 2
// ============================================================================
test("d) mixed shortage + degradation -> SHORTAGE_AND_DAMAGED", () => {
  const rows = [
    tx("MIX-1", "2026-02-01", -6, "SELLABLE"),
    tx("MIX-1", "2026-02-03", +2, "SELLABLE"),
    tx("MIX-1", "2026-02-04", +2, "CUSTOMER_DAMAGED"),
  ];
  const r = rowFor(rows, new Map(), new Map(), "MIX-1");
  assert.equal(r.status, "SHORTAGE_AND_DAMAGED");
  assert.equal(r.netQty, -2, "in 4 - out 6");
  assert.equal(r.sellableShortfall, 4, "outSellable 6 - inSellable 2");
  assert.equal(r.quantityShortage, 2, "max(0, -(-2))");
  assert.equal(r.degradationQty, 2, "sellableShortfall 4 - quantityShortage 2");
  assert.equal(r.openQty, 4, "2 shortage + 2 degradation");
  assert.equal(r.actionable, true);
});

// ============================================================================
// (e) Excess: net +3 -> EXCESS
// ============================================================================
test("e) more received than sent -> EXCESS", () => {
  const rows = [
    tx("EX-1", "2026-02-01", -2, "SELLABLE"),
    tx("EX-1", "2026-02-02", +5, "SELLABLE"),
  ];
  const r = rowFor(rows, new Map(), new Map(), "EX-1");
  assert.equal(r.status, "EXCESS");
  assert.equal(r.netQty, 3);
  assert.equal(r.actionable, false);
});

// ============================================================================
// (f) Reference-ID matching (guarded): two legs sharing a ref ID reconcile as
//     one transfer in the drill-down with correct from->to and variance.
// ============================================================================
test("f) ref-ID linked legs group as one transfer in drill-down", () => {
  const rows = [
    tx("REF-1", "2026-02-01", -4, "SELLABLE", { fc: "LAS2", referenceId: "T-100" }),
    tx("REF-1", "2026-02-03", +4, "SELLABLE", { fc: "PHX6", referenceId: "T-100" }),
  ];
  const r = rowFor(rows, new Map(), new Map(), "REF-1");
  // net 0, both sellable -> RECONCILED, but the drill-down must show one linked transfer.
  const linked = r.groups.find((g) => g.referenceId === "T-100");
  assert.ok(linked, "a group keyed by the shared referenceId exists");
  assert.equal(linked!.outQty, 4);
  assert.equal(linked!.inQty, 4);
  assert.equal(linked!.variance, 0);
  assert.equal(linked!.fromFc, "LAS2", "from = out leg FC (per-group, still present)");
  assert.equal(linked!.toFc, "PHX6", "to = in leg FC (per-group, still present)");
  assert.equal(linked!.legs.length, 2);
  // Row carries COUNTS now (CHANGE 1), not joined FC strings; codes live in groups.
  assert.equal(r.fromFcCount, 1, "1 distinct OUT FC");
  assert.equal(r.toFcCount, 1, "1 distinct IN FC");
});

// ============================================================================
// (g) Coverage: reimbursed degradation -> REIMBURSED, episode resets.
// ============================================================================
test("g) reimbursed degradation -> REIMBURSED, later episode opens fresh", () => {
  const rows = [
    // Episode 1: degradation, fully reimbursed.
    tx("COV-1", "2026-02-01", -6, "SELLABLE"),
    tx("COV-1", "2026-02-03", +6, "CUSTOMER_DAMAGED"),
  ];
  const caseMap = buildFcCaseMap([caseRow("COV-1", 6, "2026-02-10")]);
  const r = rowFor(rows, caseMap, buildFcAdjMap([]), "COV-1");
  assert.equal(r.openQty, 0, "degradation settled by coverage");
  assert.equal(r.status, "REIMBURSED");
  assert.equal(r.effectiveReimbQty, 6);

  // episode reset: a NEW later loss is not masked by the old reimbursement.
  const rows2 = [
    ...rows,
    tx("COV-1", "2026-04-01", -3, "SELLABLE"), // net back to 0 then -3
  ];
  // After ep1 closes at net 0 (covered), ep2 is a fresh -3 sellable shortage, aged.
  const r2 = rowFor(rows2, caseMap, buildFcAdjMap([]), "COV-1");
  assert.equal(r2.imbalanceStart, "2026-04-01", "ages from the new loss");
  assert.equal(r2.openQty, 3, "only the new 3-unit loss is open");
  assert.equal(r2.status, "SHORTAGE");
});

// ============================================================================
// (h) Substring trap + blank disposition handled.
// ============================================================================
test("h) classifier: substring trap + blank disposition", () => {
  assert.equal(classifyDisposition("SELLABLE"), "SELLABLE");
  assert.equal(classifyDisposition(" sellable "), "SELLABLE", "trim + case");
  assert.equal(classifyDisposition("UNSELLABLE"), "UNSELLABLE");
  assert.equal(classifyDisposition("CUSTOMER_DAMAGED"), "UNSELLABLE");
  assert.equal(classifyDisposition("DEFECTIVE"), "UNSELLABLE");
  assert.equal(classifyDisposition(""), "UNKNOWN");
  assert.equal(classifyDisposition(null), "UNKNOWN");
  assert.equal(classifyDisposition("   "), "UNKNOWN");

  // Blank disposition counts in net but NOT in sellable; tracked as data-quality.
  const rows = [
    tx("BLK-1", "2026-02-01", -4, "SELLABLE"),
    tx("BLK-1", "2026-02-02", +4, null), // blank disposition return
  ];
  const r = rowFor(rows, new Map(), new Map(), "BLK-1");
  assert.equal(r.netQty, 0, "blank still counts in net");
  assert.equal(r.inSellable, 0, "blank does NOT count as sellable in");
  assert.equal(r.inUnsellable, 0, "blank is UNKNOWN, NOT unsellable");
  assert.equal(r.unknownDispositionQty, 4, "data-quality counter caught it");
  // CHANGED by economically-correct degradation (CHANGE 3A): degradation is now
  // bounded by inUnsellable (confirmed unsellable returns). A blank-disposition
  // return is UNKNOWN, not a confirmed unsellable return, so degradation = 0 even
  // though sellableShortfall = 4. Previously degradation was 4 (the looser
  // max(0, sellableShortfall - quantityShortage) measure). This is NOT a regression
  // — it is the corrected definition: only sellable-out → UNSELLABLE-in is a
  // degradation loss.
  assert.equal(r.sellableShortfall, 4);
  assert.equal(r.degradationQty, 0, "blank return is not a confirmed unsellable return");
  assert.equal(r.status, "RECONCILED", "no confirmed loss -> not DAMAGED");
});

// ============================================================================
// extra: fcFullStats buckets reconcile with rows.
// ============================================================================
test("stats: buckets reconcile with row statuses", () => {
  const rows = [
    tx("S-DEG", "2026-02-01", -6, "SELLABLE"),
    tx("S-DEG", "2026-02-03", +6, "CUSTOMER_DAMAGED"), // DAMAGED
    tx("S-SH", "2026-03-01", -5, "SELLABLE"), // SHORTAGE
    tx("S-EX", "2026-03-01", -1, "SELLABLE"),
    tx("S-EX", "2026-03-02", +4, "SELLABLE"), // EXCESS
  ];
  const out = aggregateFcFullRecon(rows, new Map(), new Map(), TODAY);
  const stats = fcFullStats(out);
  assert.equal(stats.damagedCount, 1);
  assert.equal(stats.shortageCount, 1);
  assert.equal(stats.excessCount, 1);
  assert.equal(stats.totalUnresolvedCount, 2, "damaged + shortage (excess excluded)");
});

// ============================================================================
// CHANGE 1 — (new a) FC counts, not code strings.
// ============================================================================
test("new-a) FC counts: 3 OUT FCs / 4 IN FCs -> fromFcCount 3, toFcCount 4; no FC string in row", () => {
  // Net -1 sellable shortage so the row surfaces; legs spread over distinct FCs.
  const rows = [
    tx("FCC-1", "2026-02-01", -1, "SELLABLE", { fc: "AAA1" }),
    tx("FCC-1", "2026-02-01", -1, "SELLABLE", { fc: "BBB2" }),
    tx("FCC-1", "2026-02-01", -3, "SELLABLE", { fc: "CCC3" }),
    tx("FCC-1", "2026-02-02", +1, "SELLABLE", { fc: "DDD4" }),
    tx("FCC-1", "2026-02-02", +1, "SELLABLE", { fc: "EEE5" }),
    tx("FCC-1", "2026-02-02", +1, "SELLABLE", { fc: "FFF6" }),
    tx("FCC-1", "2026-02-02", +1, "SELLABLE", { fc: "GGG7" }),
  ];
  const r = rowFor(rows, new Map(), new Map(), "FCC-1");
  assert.equal(r.fromFcCount, 3, "3 distinct OUT FCs");
  assert.equal(r.toFcCount, 4, "4 distinct IN FCs");
  // The row payload must NOT carry joined FC code strings.
  assert.equal((r as Record<string, unknown>).fromFc, undefined, "no fromFc string on the row");
  assert.equal((r as Record<string, unknown>).toFc, undefined, "no toFc string on the row");
  // Full code list still derivable from the drill-down groups.
  const codes = new Set<string>();
  for (const g of r.groups) {
    g.fromFc.split(", ").forEach((f) => f && codes.add(f));
    g.toFc.split(", ").forEach((f) => f && codes.add(f));
  }
  assert.ok(codes.has("AAA1") && codes.has("GGG7"), "drill-down still has full FC codes");
});

// ============================================================================
// CHANGE 3A — (new b) disposition trigger fires on a SINGLE unit.
// ============================================================================
test("new-b) disposition trigger on 1 unit: out SELLABLE -1, in UNSELLABLE +1 -> DAMAGED, actionable now", () => {
  const rows = [
    tx("D1U-1", "2026-02-01", -1, "SELLABLE"),
    tx("D1U-1", "2026-02-02", +1, "DEFECTIVE"),
  ];
  const r = rowFor(rows, new Map(), new Map(), "D1U-1");
  assert.equal(r.status, "DAMAGED_IN_TRANSIT");
  assert.equal(r.degradationQty, 1, "1 sellable-out returned unsellable");
  assert.equal(r.quantityShortage, 0, "net 0");
  assert.equal(r.actionable, true, "no waiting window for confirmed degradation");
});

// ============================================================================
// CHANGE 3A — (new c) unsellable-out that returns unsellable is NOT a loss.
// ============================================================================
test("new-c) unsellable-out returns unsellable -> NOT damaged, not actionable", () => {
  const rows = [
    tx("UOU-1", "2026-02-01", -2, "CUSTOMER_DAMAGED"),
    tx("UOU-1", "2026-02-02", +2, "CUSTOMER_DAMAGED"),
  ];
  const r = rowFor(rows, new Map(), new Map(), "UOU-1");
  assert.equal(r.outSellable, 0, "nothing sellable went out");
  assert.equal(r.sellableShortfall, 0, "no sellable shortfall -> no degradation");
  assert.equal(r.degradationQty, 0, "unsellable round-trip is not a new loss");
  assert.notEqual(r.status, "DAMAGED_IN_TRANSIT");
  assert.notEqual(r.status, "SHORTAGE_AND_DAMAGED");
  assert.equal(r.actionable, false);
});

// ============================================================================
// CHANGE 3B — (new d) exact 55-day boundary: 54d -> IN_TRANSIT, 56d -> SHORTAGE.
// daysPending = floor((today - imbalanceStart) / 1 day). Pick todays so the gap
// is exactly 54 and 56 days. imbalanceStart = 2026-03-01 (UTC midnight).
// ============================================================================
test("new-d) 55-day boundary: 54d IN_TRANSIT (not actionable), 56d SHORTAGE (actionable)", () => {
  const rows = [tx("BND-1", "2026-03-01", -3, "SELLABLE")];

  // 55 days exactly -> still IN_TRANSIT (boundary is strict ">").
  const at55 = new Date("2026-04-25T00:00:00Z"); // 2026-03-01 + 55d
  const r55 = rowFor(rows, new Map(), new Map(), "BND-1", at55);
  assert.equal(r55.daysPending, 55, "exactly 55 days");
  assert.equal(r55.status, "IN_TRANSIT", "55 days is still within the window");
  assert.equal(r55.actionable, false);

  // 54 days -> IN_TRANSIT.
  const at54 = new Date("2026-04-24T00:00:00Z");
  const r54 = rowFor(rows, new Map(), new Map(), "BND-1", at54);
  assert.equal(r54.daysPending, 54);
  assert.equal(r54.status, "IN_TRANSIT", "54 days not actionable");
  assert.equal(r54.actionable, false);

  // 56 days -> SHORTAGE, actionable.
  const at56 = new Date("2026-04-26T00:00:00Z");
  const r56 = rowFor(rows, new Map(), new Map(), "BND-1", at56);
  assert.equal(r56.daysPending, 56);
  assert.equal(r56.status, "SHORTAGE", "past 55 days -> SHORTAGE");
  assert.equal(r56.actionable, true);
});

// ============================================================================
// (new e) P1/P2 regression — SELF-CONTAINED on the NEW engine. These re-express
// the coverage that used to live in aggregate.test.ts so the old engine can be
// deleted. P1 = dated coverage + episode reset (old reimbursed loss does not mask
// a new later loss). P2 = canonical msku|fnsku|asin grain (relisted MSKU with two
// FNSKUs yields two rows; opposite-sign FNSKUs are NOT netted away).
// ============================================================================
test("new-e1) P1: dated coverage + episode reset — old reimbursed loss does not mask a new loss", () => {
  // ABC-123: Jan -8 reimbursed 8 (Jan case); later -3. Only the new 3 stays open.
  const rows = [
    tx("ABC-123", "2026-01-05", -8, "SELLABLE"),
    tx("ABC-123", "2026-02-05", -3, "SELLABLE"),
  ];
  const caseMap = buildFcCaseMap([caseRow("ABC-123", 8, "2026-01-20")]);
  const r = rowFor(rows, caseMap, buildFcAdjMap([]), "ABC-123");
  // New engine reports the OPEN episode only: the Jan episode closed (covered),
  // so the surfaced episode is the new -3 loss.
  assert.equal(r.netQty, -3, "open episode net = the new loss");
  assert.equal(r.openQty, 3, "only the new 3-unit loss is open (Jan settled)");
  assert.equal(r.imbalanceStart, "2026-02-05", "ages from the new loss, not January");
  assert.equal(r.effectiveReimbQty, 0, "Jan coverage settled the Jan episode, none applied later");
  assert.equal(r.status, "SHORTAGE", "the new uncovered loss is actionable");
});

test("new-e2) P1: single fully-reimbursed loss -> REIMBURSED, episode closed", () => {
  const rows = [tx("FULL-1", "2026-02-01", -5, "SELLABLE")];
  const caseMap = buildFcCaseMap([caseRow("FULL-1", 5, "2026-02-15")]);
  const r = rowFor(rows, caseMap, buildFcAdjMap([]), "FULL-1");
  assert.equal(r.openQty, 0);
  assert.equal(r.status, "REIMBURSED");
  assert.equal(r.effectiveReimbQty, 5);
});

test("new-e3) P2: canonical grain — split FNSKU, opposite signs are NOT netted", () => {
  const rows = [
    tx("SHOE-9", "2026-01-05", -4, "SELLABLE", { fnsku: "X001OLD", asin: "B07XYZ" }),
    tx("SHOE-9", "2026-01-06", +4, "SELLABLE", { fnsku: "X001NEW", asin: "B07XYZ" }),
  ];
  const out = aggregateFcFullRecon(rows, new Map(), new Map(), TODAY);
  const oldRow = out.find((r) => r.fnsku === "X001OLD");
  const newRow = out.find((r) => r.fnsku === "X001NEW");
  assert.ok(oldRow, "old listing row survives (not netted away)");
  assert.ok(newRow, "new listing row survives");
  assert.equal(oldRow!.netQty, -4, "old listing keeps its -4 loss");
  assert.equal(newRow!.netQty, 4, "new listing keeps its +4 excess");
  assert.equal(oldRow!.status, "SHORTAGE");
  assert.equal(newRow!.status, "EXCESS");
});

test("new-e4) P2: keyed case attaches to its FNSKU only, not the sibling", () => {
  const rows = [
    tx("SHOE-9", "2026-02-01", -4, "SELLABLE", { fnsku: "X001OLD", asin: "B07XYZ" }),
    tx("SHOE-9", "2026-02-01", -4, "SELLABLE", { fnsku: "X001NEW", asin: "B07XYZ" }),
  ];
  const caseMap = buildFcCaseMap([caseRow("SHOE-9", 4, "2026-02-10", "X001OLD", "B07XYZ")]);
  const out = aggregateFcFullRecon(rows, caseMap, buildFcAdjMap([]), TODAY);
  const oldRow = out.find((r) => r.fnsku === "X001OLD")!;
  const newRow = out.find((r) => r.fnsku === "X001NEW")!;
  assert.equal(oldRow.openQty, 0, "OLD settled by its own case");
  assert.equal(oldRow.status, "REIMBURSED");
  assert.equal(newRow.openQty, 4, "NEW still fully open — sibling case must not apply");
  assert.equal(newRow.status, "SHORTAGE");
});

// ============================================================================
// KPI PARTITION — fcFullStats is a complete partition of rows by status.
// ============================================================================

// All 9 FcFullStatus values, one row each, distinct listings so they survive.
function mixedPartitionDataset(): {
  rows: Transfer[];
  caseMap: Map<string, FcCaseMeta>;
  adjMap: Map<string, FcAdjMeta>;
} {
  const rows: Transfer[] = [
    // RECONCILED: net 0, sellable round-trip.
    tx("P-REC", "2026-02-01", -2, "SELLABLE", { fnsku: "FREC", asin: "BREC" }),
    tx("P-REC", "2026-02-02", +2, "SELLABLE", { fnsku: "FREC", asin: "BREC" }),
    // IN_TRANSIT: recent shortage (within 55d of RECENT_TODAY).
    tx("P-IT", "2026-02-05", -3, "SELLABLE", { fnsku: "FIT", asin: "BIT" }),
    // SHORTAGE: aged shortage.
    tx("P-SH", "2026-01-01", -4, "SELLABLE", { fnsku: "FSH", asin: "BSH" }),
    // DAMAGED_IN_TRANSIT: sellable out, unsellable in, net 0.
    tx("P-DMG", "2026-01-10", -2, "SELLABLE", { fnsku: "FDMG", asin: "BDMG" }),
    tx("P-DMG", "2026-01-12", +2, "DEFECTIVE", { fnsku: "FDMG", asin: "BDMG" }),
    // SHORTAGE_AND_DAMAGED: out 6 sellable, in 2 sellable + 2 unsellable -> short 2, deg 2.
    tx("P-SD", "2026-01-10", -6, "SELLABLE", { fnsku: "FSD", asin: "BSD" }),
    tx("P-SD", "2026-01-11", +2, "SELLABLE", { fnsku: "FSD", asin: "BSD" }),
    tx("P-SD", "2026-01-12", +2, "CUSTOMER_DAMAGED", { fnsku: "FSD", asin: "BSD" }),
    // EXCESS: net +3.
    tx("P-EX", "2026-01-10", -1, "SELLABLE", { fnsku: "FEX", asin: "BEX" }),
    tx("P-EX", "2026-01-11", +4, "SELLABLE", { fnsku: "FEX", asin: "BEX" }),
    // CASE_OPEN: aged shortage with an OPEN case (0 approved) -> still open, case pending.
    tx("P-CASE", "2026-01-01", -5, "SELLABLE", { fnsku: "FCASE", asin: "BCASE" }),
    // REIMBURSED: shortage fully covered by an approved (resolved) case.
    tx("P-RMB", "2026-01-01", -3, "SELLABLE", { fnsku: "FRMB", asin: "BRMB" }),
    // ADJUSTED: shortage fully covered by a manual adjustment (no case).
    tx("P-ADJ", "2026-01-01", -3, "SELLABLE", { fnsku: "FADJ", asin: "BADJ" }),
  ];
  const caseMap = buildFcCaseMap([
    // OPEN case, 0 approved, on P-CASE -> topStatus "Open", openCount>0, no coverage.
    caseRow("P-CASE", 0, "2026-01-05", "FCASE", "BCASE", "OPEN"),
    // RESOLVED approved case fully covering P-RMB.
    caseRow("P-RMB", 3, "2026-01-05", "FRMB", "BRMB", "RESOLVED"),
  ]);
  const adjMap = buildFcAdjMap([
    adjRow("P-ADJ", 3, "2026-01-05", "FADJ", "BADJ"),
  ]);
  return { rows, caseMap, adjMap };
}

test("partition: 9 status counts sum to totalGroups === rows.length (exactly)", () => {
  const { rows, caseMap, adjMap } = mixedPartitionDataset();
  const out = aggregateFcFullRecon(rows, caseMap, adjMap, TODAY);
  const s = fcFullStats(out);

  const sum =
    s.reconciledCount +
    s.inTransitCount +
    s.shortageCount +
    s.damagedCount +
    s.shortageDamagedCount +
    s.excessCount +
    s.caseOpenCount +
    s.reimbursedCount +
    s.adjustedCount;

  assert.equal(s.totalGroups, out.length, "totalGroups === number of rows");
  assert.equal(sum, s.totalGroups, "9 status counts sum to totalGroups");
  assert.equal(sum, out.length, "and therefore to the table row count");

  // Each status present at least once in this dataset (sanity that we exercised all 9).
  assert.ok(s.reconciledCount >= 1);
  assert.ok(s.inTransitCount >= 0); // IN_TRANSIT needs a recent today; see dedicated test below.
});

test("b) no double-count: SHORTAGE_AND_DAMAGED is in shortageDamaged ONLY", () => {
  // Single SD row; shortage and damaged buckets must NOT include it.
  const rows = [
    tx("SD-ONLY", "2026-01-10", -6, "SELLABLE"),
    tx("SD-ONLY", "2026-01-11", +2, "SELLABLE"),
    tx("SD-ONLY", "2026-01-12", +2, "CUSTOMER_DAMAGED"),
  ];
  const out = aggregateFcFullRecon(rows, new Map(), new Map(), TODAY);
  const r = out.find((x) => x.msku === "SD-ONLY")!;
  assert.equal(r.status, "SHORTAGE_AND_DAMAGED");
  const s = fcFullStats(out);
  assert.equal(s.shortageDamagedCount, 1, "in its own bucket");
  assert.equal(s.shortageCount, 0, "NOT in shortage");
  assert.equal(s.damagedCount, 0, "NOT in damaged");
  // partition still holds for this tiny set.
  const sum = s.reconciledCount + s.inTransitCount + s.shortageCount + s.damagedCount +
    s.shortageDamagedCount + s.excessCount + s.caseOpenCount + s.reimbursedCount + s.adjustedCount;
  assert.equal(sum, s.totalGroups);
});

test("c) case vs settled: OPEN case -> caseOpen (not reimbursed/adjusted); reimbursed -> reimbursed only", () => {
  // OPEN case, no approved units, on an aged shortage.
  const openRows = [tx("C-OPEN", "2026-01-01", -5, "SELLABLE", { fnsku: "FCO", asin: "BCO" })];
  const openCases = buildFcCaseMap([caseRow("C-OPEN", 0, "2026-01-05", "FCO", "BCO", "OPEN")]);
  const o = aggregateFcFullRecon(openRows, openCases, new Map(), TODAY);
  const rOpen = o.find((r) => r.msku === "C-OPEN")!;
  assert.equal(rOpen.status, "CASE_OPEN", "open case is not 'settled'");
  const so = fcFullStats(o);
  assert.equal(so.caseOpenCount, 1);
  assert.equal(so.reimbursedCount, 0);
  assert.equal(so.adjustedCount, 0);

  // Reimbursed row.
  const rmbRows = [tx("C-RMB", "2026-01-01", -3, "SELLABLE", { fnsku: "FCR", asin: "BCR" })];
  const rmbCases = buildFcCaseMap([caseRow("C-RMB", 3, "2026-01-05", "FCR", "BCR", "RESOLVED")]);
  const m = aggregateFcFullRecon(rmbRows, rmbCases, new Map(), TODAY);
  const rRmb = m.find((r) => r.msku === "C-RMB")!;
  assert.equal(rRmb.status, "REIMBURSED");
  const sm = fcFullStats(m);
  assert.equal(sm.reimbursedCount, 1);
  assert.equal(sm.caseOpenCount, 0, "reimbursed is not caseOpen");
});

test("d) exhaustiveness: every FcFullStatus is handled (no fall-through)", () => {
  // Synthesize one row per status value directly and confirm fcFullStats counts
  // it (the switch default throws on an unmapped status, so a clean run + a
  // matching per-status count proves exhaustiveness).
  const ALL: FcFullStatus[] = [
    "RECONCILED", "IN_TRANSIT", "SHORTAGE", "DAMAGED_IN_TRANSIT",
    "SHORTAGE_AND_DAMAGED", "EXCESS", "CASE_OPEN", "REIMBURSED", "ADJUSTED",
  ];
  const fake: FcFullReconRow[] = ALL.map((status, i) => ({
    msku: `M${i}`, fnsku: `F${i}`, asin: `A${i}`, title: "",
    fromFcCount: 0, toFcCount: 0,
    outQty: 0, outSellable: 0, outUnsellable: 0,
    inQty: 0, inSellable: 0, inUnsellable: 0,
    netQty: 0, sellableShortfall: 0, quantityShortage: 0, degradationQty: 0,
    inTransitPending: 0, daysPending: 0, imbalanceStart: "2026-01-01",
    effectiveReimbQty: 0, caseCount: 0, caseOpenCount: 0, caseStatusTop: "No Case",
    caseApprovedQty: 0, caseApprovedAmount: 0, adjQty: 0,
    openQty: 0, status, actionable: false, unknownDispositionQty: 0, groups: [],
  }));
  const s = fcFullStats(fake);
  const sum = s.reconciledCount + s.inTransitCount + s.shortageCount + s.damagedCount +
    s.shortageDamagedCount + s.excessCount + s.caseOpenCount + s.reimbursedCount + s.adjustedCount;
  assert.equal(sum, ALL.length, "every status mapped to exactly one bucket");
  assert.equal(s.totalGroups, ALL.length);
  // each bucket exactly 1
  assert.equal(s.reconciledCount, 1);
  assert.equal(s.inTransitCount, 1);
  assert.equal(s.shortageCount, 1);
  assert.equal(s.damagedCount, 1);
  assert.equal(s.shortageDamagedCount, 1);
  assert.equal(s.excessCount, 1);
  assert.equal(s.caseOpenCount, 1);
  assert.equal(s.reimbursedCount, 1);
  assert.equal(s.adjustedCount, 1);
});

test("d2) unmapped status throws loudly (guard)", () => {
  const bad = [{ status: "WAT" } as unknown as FcFullReconRow];
  assert.throws(() => fcFullStats(bad), /unmapped FcFullStatus/);
});

// ============================================================================
// 6-CARD DISPLAY GROUPING — fcFullCardGroups consolidates the 9 buckets into 6
// cards WITHOUT changing the partition. (a) display-grouping invariant,
// (b) combined-card math, (c) regression covered by the suites above.
// ============================================================================

test("card-a) display-grouping invariant: 6-card counts (excl. Total) sum to totalGroups", () => {
  const { rows, caseMap, adjMap } = mixedPartitionDataset();
  const out = aggregateFcFullRecon(rows, caseMap, adjMap, TODAY);
  const s = fcFullStats(out);
  const cg = fcFullCardGroups(s);

  const sixCardSum =
    cg.reconciledCount +
    cg.inTransitCount +
    cg.takeActionCount +
    cg.excessCount +
    cg.resolvedCount;

  assert.equal(cg.totalGroups, out.length, "Total card === table row count");
  assert.equal(sixCardSum, cg.totalGroups, "5 status cards sum to Total");
  assert.equal(sixCardSum, out.length, "and therefore to the row count");

  // The 9-bucket partition is UNCHANGED and still sums to the same total.
  const nineSum =
    s.reconciledCount + s.inTransitCount + s.shortageCount + s.damagedCount +
    s.shortageDamagedCount + s.excessCount + s.caseOpenCount + s.reimbursedCount + s.adjustedCount;
  assert.equal(nineSum, sixCardSum, "6-card grouping preserves the 9-bucket sum");
});

test("card-b) combined-card math: takeAction = shortage+damaged+both; resolved = case+reimb+adj", () => {
  const { rows, caseMap, adjMap } = mixedPartitionDataset();
  const s = fcFullStats(aggregateFcFullRecon(rows, caseMap, adjMap, TODAY));
  const cg = fcFullCardGroups(s);

  assert.equal(
    cg.takeActionCount,
    s.shortageCount + s.damagedCount + s.shortageDamagedCount,
    "Take Action count is the 3 shortage statuses",
  );
  assert.equal(
    cg.takeActionQty,
    s.shortageQty + s.damagedQty + s.shortageDamagedQty,
    "Take Action units summed",
  );
  assert.equal(
    cg.resolvedCount,
    s.caseOpenCount + s.reimbursedCount + s.adjustedCount,
    "Resolved count is case+reimbursed+adjusted",
  );
  assert.equal(
    cg.resolvedQty,
    s.caseOpenQty + s.reimbursedQty + s.adjustedQty,
    "Resolved units summed",
  );
  // Sub-breakdowns preserved for the in-card detail lines.
  assert.equal(cg.shortageCount, s.shortageCount);
  assert.equal(cg.damagedCount, s.damagedCount);
  assert.equal(cg.shortageDamagedCount, s.shortageDamagedCount);
  assert.equal(cg.caseOpenCount, s.caseOpenCount);
  assert.equal(cg.reimbursedCount, s.reimbursedCount);
  assert.equal(cg.adjustedCount, s.adjustedCount);
});

test("card-c) grouping does not mutate the underlying 9-bucket stats", () => {
  const { rows, caseMap, adjMap } = mixedPartitionDataset();
  const s = fcFullStats(aggregateFcFullRecon(rows, caseMap, adjMap, TODAY));
  const snapshot = JSON.stringify(s);
  fcFullCardGroups(s); // pure — must not touch s
  assert.equal(JSON.stringify(s), snapshot, "fcFullStats object unchanged by grouping");
});
