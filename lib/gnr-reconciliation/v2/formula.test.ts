// FBA Recon v2 — formula unit tests (node:test).
// Run: node --test lib/gnr-reconciliation/v2/formula.test.ts
// (Node 22+ strips TS types natively; this repo runs Node 24.)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actionGroupOf,
  aggregateAsinRows,
  aggregateGnrV2,
  assignFlowToUsedSkus,
  mergeMemberDetails,
  buildAdjMapV2,
  buildCaseMapV2,
  buildInvAdjMap,
  buildLedgerMap,
  buildSalesDetails,
  lookupLedger,
  combineGnrV2Sources,
  composeGnrV2Row,
  computeV2Status,
  daysBetween,
  flowToMatchRows,
  isGradingNewerThanAdj,
  isMixedSkuAgg,
  normId,
  reimbToMatchRows,
  removalsToMatchRows,
  salesToMatchRows,
  summaryStatsV2,
  trimStr,
  usedKeyOf,
  GNR_V2_ACTION_GROUPS,
  STATUS_TO_GROUP,
  type GnrV2LedgerInputRow,
} from "./formula.ts";
import type {
  GnrV2ActionGroup,
  GnrV2Agg,
  GnrV2InMeta,
  GnrV2InvAdjRow,
  GnrV2Ledger,
  GnrV2ManualRow,
  GnrV2MatchRow,
  GnrV2ReimbRow,
  GnrV2ReportRow,
  GnrV2Status,
  GnrV2UsedKey,
} from "./types.ts";

const D = (s: string) => new Date(s + "T00:00:00.000Z");

// ── helpers to build sparse rows ───────────────────────────

function report(p: Partial<GnrV2ReportRow>): GnrV2ReportRow {
  return {
    usedMsku: null,
    usedFnsku: null,
    fnsku: null,
    asin: null,
    usedCondition: null,
    quantity: 0,
    unitStatus: null,
    orderId: null,
    lpn: null,
    reportDate: null,
    ...p,
  };
}
function manual(p: Partial<GnrV2ManualRow>): GnrV2ManualRow {
  return {
    msku: "M",
    fnsku: null,
    asin: null,
    usedMsku: null,
    usedFnsku: null,
    usedCondition: null,
    grade: null,
    quantity: 0,
    unitStatus: null,
    orderId: null,
    lpn: null,
    gradedDate: null,
    ...p,
  };
}
function ledgerRow(p: Partial<GnrV2LedgerInputRow>): GnrV2LedgerInputRow {
  return {
    msku: null,
    fnsku: null,
    endingBalance: 0,
    startingBalance: 0,
    disposition: null,
    receipts: 0,
    found: 0,
    lost: 0,
    damaged: 0,
    disposedQty: 0,
    otherEvents: 0,
    unknownEvents: 0,
    summaryDate: null,
    ...p,
  };
}
function invAdj(p: Partial<GnrV2InvAdjRow>): GnrV2InvAdjRow {
  return {
    fnsku: null,
    quantity: 0,
    reason: null,
    adjDate: null,
    referenceId: null,
    fulfillmentCenter: null,
    disposition: null,
    ...p,
  };
}
function agg(p: Partial<GnrV2Agg>): GnrV2Agg {
  return {
    usedMsku: "UM",
    usedFnsku: "X0USED",
    origFnsku: "X0ORIG",
    asin: "B00ASIN",
    usedCondition: "Used - Good",
    gnrQty: 0,
    succeededQty: 0,
    failedQty: 0,
    orderCount: 0,
    firstDate: null,
    lastDate: null,
    gnrDates: [],
    ...p,
  };
}
/** Build a complete ledger anchor for compose() tests. */
function ledger(p: Partial<GnrV2Ledger>): GnrV2Ledger {
  return {
    ledgerDate: D("2026-06-05"),
    ledgerEnding: 0,
    ledgerIn: 0,
    ledgerFound: 0,
    ledgerLost: 0,
    ledgerDamaged: 0,
    ledgerDisposed: 0,
    ledgerOther: 0,
    ledgerUnknown: 0,
    unsellableOnHand: 0,
    openingBal: 0,
    ...p,
  };
}
function inMeta(qty: number): GnrV2InMeta {
  return { gnrInQty: qty, events: [] };
}
/** compose wrapper: defaults adjCoverageEnd (null) for brevity. */
type ComposeArgs = Parameters<typeof composeGnrV2Row>[0];
function compose(p: Omit<ComposeArgs, "adjCoverageEnd"> & { adjCoverageEnd?: Date | null }) {
  return composeGnrV2Row({ adjCoverageEnd: null, ...p });
}

// ── trimStr ────────────────────────────────────────────────

test("trimStr handles null/undefined/whitespace", () => {
  assert.equal(trimStr(null), "");
  assert.equal(trimStr(undefined), "");
  assert.equal(trimStr("  a "), "a");
});

// ── combine + dedupe ───────────────────────────────────────

test("combine: manual row skipped when lpn collides with report for same usedFnsku", () => {
  const out = combineGnrV2Sources(
    [report({ usedFnsku: "F1", lpn: "LPN1", quantity: 1, unitStatus: "Succeeded" })],
    [manual({ usedFnsku: "F1", lpn: "LPN1", quantity: 5, unitStatus: "Succeeded" })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 1);
});

test("combine: manual row skipped when orderId collides for same usedFnsku", () => {
  const out = combineGnrV2Sources(
    [report({ usedFnsku: "F1", orderId: "O1", quantity: 1 })],
    [manual({ usedFnsku: "F1", orderId: "O1", quantity: 5 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 1);
});

test("combine: collision on a DIFFERENT usedFnsku does not dedupe", () => {
  const out = combineGnrV2Sources(
    [report({ usedFnsku: "F1", lpn: "LPN1", quantity: 1 })],
    [manual({ usedFnsku: "F2", lpn: "LPN1", quantity: 5 })],
  );
  assert.equal(out.length, 2);
});

test("combine: manual row with no lpn/orderId is always kept", () => {
  const out = combineGnrV2Sources(
    [report({ usedFnsku: "F1", lpn: "LPN1", quantity: 1 })],
    [manual({ usedFnsku: "F1", quantity: 5 })],
  );
  assert.equal(out.length, 2);
});

test("combine: manual fallbacks (usedMsku, usedFnsku, condition, unitStatus)", () => {
  const out = combineGnrV2Sources(
    [],
    [manual({ msku: "RAW", fnsku: "ORIGF", grade: "Good", quantity: 3 })],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].usedMsku, "Manual: RAW");
  assert.equal(out[0].usedFnsku, "ORIGF");
  assert.equal(out[0].usedCondition, "Good");
  assert.equal(out[0].unitStatus, "Succeeded");
});

// ── aggregation ────────────────────────────────────────────

test("aggregate: succeeded/failed are case-insensitive; orders counted distinctly", () => {
  const combined = combineGnrV2Sources(
    [
      report({ usedMsku: "UM", usedFnsku: "F1", quantity: 4, unitStatus: "SUCCEEDED", orderId: "O1", reportDate: D("2026-01-01") }),
      report({ usedMsku: "UM", usedFnsku: "F1", quantity: 3, unitStatus: "failed", orderId: "O1", reportDate: D("2026-02-01") }),
      report({ usedMsku: "UM", usedFnsku: "F1", quantity: 2, unitStatus: "Succeeded", orderId: "O2", reportDate: D("2026-03-01") }),
    ],
    [],
  );
  const aggs = aggregateGnrV2(combined);
  assert.equal(aggs.length, 1);
  const a = aggs[0];
  assert.equal(a.gnrQty, 9);
  assert.equal(a.succeededQty, 6);
  assert.equal(a.failedQty, 3);
  assert.equal(a.orderCount, 2);
  assert.deepEqual(a.firstDate, D("2026-01-01"));
  assert.deepEqual(a.lastDate, D("2026-03-01"));
});

test("aggregate: gnrDates breaks qty out per date, newest first", () => {
  const aggs = aggregateGnrV2(
    combineGnrV2Sources(
      [
        report({ usedMsku: "UM", usedFnsku: "F1", quantity: 2, unitStatus: "Succeeded", reportDate: D("2026-05-08") }),
        report({ usedMsku: "UM", usedFnsku: "F1", quantity: 1, unitStatus: "Succeeded", reportDate: D("2026-03-01") }),
        report({ usedMsku: "UM", usedFnsku: "F1", quantity: 3, unitStatus: "Failed", reportDate: D("2026-05-08") }),
      ],
      [],
    ),
  );
  assert.equal(aggs.length, 1);
  assert.deepEqual(aggs[0].gnrDates, [
    { date: "2026-05-08", qty: 5 }, // 2 + 3, newest first
    { date: "2026-03-01", qty: 1 },
  ]);
});

test("aggregate: distinct (usedMsku, usedFnsku) keys produce separate buckets", () => {
  const aggs = aggregateGnrV2(
    combineGnrV2Sources(
      [
        report({ usedMsku: "A", usedFnsku: "F1", quantity: 1, unitStatus: "Succeeded" }),
        report({ usedMsku: "B", usedFnsku: "F1", quantity: 1, unitStatus: "Succeeded" }),
      ],
      [],
    ),
  );
  assert.equal(aggs.length, 2);
});

// ── ledger anchor ──────────────────────────────────────────

test("ledger: ending = sum across dispositions on latest date; in/lost/etc = all dates", () => {
  const m = buildLedgerMap([
    ledgerRow({ fnsku: "F1", endingBalance: 10, summaryDate: D("2026-03-01"), receipts: 2, found: 1 }),
    ledgerRow({ fnsku: "F1", endingBalance: 4, summaryDate: D("2026-03-01"), lost: 3, damaged: 1, disposedQty: 2 }),
    ledgerRow({ fnsku: "F1", endingBalance: 99, summaryDate: D("2026-01-01"), receipts: 5, found: 2, lost: 1 }),
  ]);
  const l = lookupLedger(m, "", "F1")!;
  assert.equal(l.ledgerEnding, 14);
  assert.deepEqual(l.ledgerDate, D("2026-03-01"));
  assert.equal(l.ledgerIn, 2 + 1 + 5 + 2);
  assert.equal(l.ledgerFound, 1 + 2); // found alone (+ side of W/H Events)
  assert.equal(l.ledgerLost, 3 + 1);
  assert.equal(l.ledgerDamaged, 1);
  assert.equal(l.ledgerDisposed, 2);
});

test("ledger: unsellableOnHand sums latest-date endingBalance for non-SELLABLE dispositions only", () => {
  const m = buildLedgerMap([
    ledgerRow({ fnsku: "F1", endingBalance: 6, disposition: "SELLABLE", summaryDate: D("2026-03-01") }),
    ledgerRow({ fnsku: "F1", endingBalance: 3, disposition: "CUSTOMER_DAMAGED", summaryDate: D("2026-03-01") }),
    ledgerRow({ fnsku: "F1", endingBalance: 2, disposition: "DEFECTIVE", summaryDate: D("2026-03-01") }),
    // earlier date — must not count toward on-hand
    ledgerRow({ fnsku: "F1", endingBalance: 50, disposition: "CUSTOMER_DAMAGED", summaryDate: D("2026-01-01") }),
  ]);
  const l = lookupLedger(m, "", "F1")!;
  assert.equal(l.ledgerEnding, 11); // 6 + 3 + 2 latest date
  assert.equal(l.unsellableOnHand, 5); // 3 + 2, SELLABLE excluded, earlier date excluded
});

test("ledger: openingBal sums startingBalance at the earliest dated rows", () => {
  const m = buildLedgerMap([
    ledgerRow({ fnsku: "F1", startingBalance: 7, disposition: "SELLABLE", summaryDate: D("2026-01-01") }),
    ledgerRow({ fnsku: "F1", startingBalance: 1, disposition: "CUSTOMER_DAMAGED", summaryDate: D("2026-01-01") }),
    ledgerRow({ fnsku: "F1", startingBalance: 999, disposition: "SELLABLE", summaryDate: D("2026-03-01") }),
  ]);
  const l = lookupLedger(m, "", "F1")!;
  assert.equal(l.openingBal, 8); // 7 + 1 at earliest date; later date ignored
});

test("ledger: blank fnsku ignored", () => {
  const m = buildLedgerMap([ledgerRow({ fnsku: "  ", endingBalance: 5, summaryDate: D("2026-01-01") })]);
  assert.equal(m.byPair.size, 0);
  assert.equal(m.byFnskuBlank.size, 0);
});

test("ledger: pair-matched — two used MSKUs sharing an fnsku get separate ledgers", () => {
  const m = buildLedgerMap([
    ledgerRow({ msku: "MA", fnsku: "F1", endingBalance: 4, summaryDate: D("2026-03-01") }),
    ledgerRow({ msku: "MB", fnsku: "F1", endingBalance: 9, summaryDate: D("2026-03-01") }),
  ]);
  // Each used SKU resolves to its OWN pair — no cross-leak.
  assert.equal(lookupLedger(m, "MA", "F1")!.ledgerEnding, 4);
  assert.equal(lookupLedger(m, "MB", "F1")!.ledgerEnding, 9);
  // A third msku on the same fnsku, with no blank-msku rows, has no ledger.
  assert.equal(lookupLedger(m, "MC", "F1"), undefined);
});

test("ledger: blank-msku rows fall back by fnsku only (no leak into a pair msku)", () => {
  const m = buildLedgerMap([
    ledgerRow({ msku: "MA", fnsku: "F1", endingBalance: 4, summaryDate: D("2026-03-01") }),
    ledgerRow({ msku: null, fnsku: "F1", endingBalance: 7, summaryDate: D("2026-03-01") }),
    ledgerRow({ msku: "  ", fnsku: "F1", endingBalance: 1, summaryDate: D("2026-03-01") }), // blank too
  ]);
  // MA keeps its exact pair (4) — the blank-msku rows do NOT merge into it.
  assert.equal(lookupLedger(m, "MA", "F1")!.ledgerEnding, 4);
  // An unknown msku falls back to the blank-msku aggregate (7 + 1).
  assert.equal(lookupLedger(m, "MZ", "F1")!.ledgerEnding, 8);
});

// ── inventory_adjustments reason='3' arrivals ──────────────

test("invAdj: counts only reason='3' positive qty; Q/P and others ignored", () => {
  const m = buildInvAdjMap([
    invAdj({ fnsku: "F1", quantity: 5, reason: "3", adjDate: D("2026-02-01"), referenceId: "A1", fulfillmentCenter: "FC1", disposition: "CUSTOMER_DAMAGED" }),
    invAdj({ fnsku: "F1", quantity: 3, reason: " 3 ", adjDate: D("2026-02-02"), referenceId: "A2", fulfillmentCenter: "FC1", disposition: "SELLABLE" }), // trims to "3"
    invAdj({ fnsku: "F1", quantity: 4, reason: "Q", adjDate: D("2026-02-03") }), // disposition flip out — ignore
    invAdj({ fnsku: "F1", quantity: 4, reason: "P", adjDate: D("2026-02-03") }), // disposition flip in — ignore
    invAdj({ fnsku: "F1", quantity: 9, reason: "7", adjDate: D("2026-02-04") }), // other reason — ignore
  ]);
  const meta = m.get("F1")!;
  assert.equal(meta.gnrInQty, 8); // 5 + 3
  assert.equal(meta.events.length, 2);
  // events sorted by date desc
  assert.equal(meta.events[0].adjDate, "2026-02-02");
  assert.equal(meta.events[0].referenceId, "A2");
  assert.equal(meta.events[1].fc, "FC1");
});

test("invAdj: non-positive reason='3' rows are dropped", () => {
  const m = buildInvAdjMap([
    invAdj({ fnsku: "F1", quantity: 0, reason: "3" }),
    invAdj({ fnsku: "F1", quantity: -2, reason: "3" }),
  ]);
  assert.equal(m.get("F1") ?? undefined, undefined);
});

// ── Ledger Adj column (fba_summary other/unknown, less Actual In) ──

test("ledgerAdj: (other + unknown) − actualIn — display column, NOT in computed", () => {
  // ledgerOther 6 + ledgerUnknown 2 = 8; actualIn 10 → ledgerAdjSigned = 8 − 10 = −2.
  // Ledger Adj is a display-only column; computedEnding = actualIn 10 (no other flows).
  const row = compose({
    agg: agg({ usedFnsku: "F1", origFnsku: "ORIG", succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 8, ledgerIn: 10, ledgerOther: 6, ledgerUnknown: 2 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.ledgerAdjSigned, -2); // still surfaced as its own column
  assert.deepEqual(row.ledgerAdjBreakdown, { other: 6, unknown: 2, actualIn: 10 });
  assert.equal(row.computedEnding, 10); // actualIn only — ledgerAdj NOT in the sum
  assert.equal(row.variance, -2); // ledger 8 − computed 10
});

test("ledgerAdj: built from the pair-matched ledger (other/unknown summed all dates)", () => {
  const m = buildLedgerMap([
    ledgerRow({ msku: "MA", fnsku: "F1", otherEvents: 3, unknownEvents: 1, summaryDate: D("2026-03-01") }),
    ledgerRow({ msku: "MA", fnsku: "F1", otherEvents: 2, summaryDate: D("2026-01-01") }),
    // a different msku must NOT contribute to MA's ledger adj.
    ledgerRow({ msku: "MB", fnsku: "F1", otherEvents: 99, summaryDate: D("2026-03-01") }),
  ]);
  const l = lookupLedger(m, "MA", "F1")!;
  assert.equal(l.ledgerOther, 5); // 3 + 2 (MB's 99 excluded)
  assert.equal(l.ledgerUnknown, 1);
});

// ── composite-key flow matching ────────────────────────────

const U = (usedMsku: string, usedFnsku: string): GnrV2UsedKey => ({ usedMsku, usedFnsku });
function mrow(p: Partial<GnrV2MatchRow>): GnrV2MatchRow {
  return { msku: null, fnsku: null, qty: 0, amount: 0, date: null, ...p };
}

test("normId / usedKeyOf: trim + upper-case", () => {
  assert.equal(normId("  x0abc "), "X0ABC");
  assert.equal(usedKeyOf(" m1 ", "f1"), "M1|F1");
});

test("match: exact pair beats fnsku-only — both-field row goes only to its pair", () => {
  // Two used SKUs share fnsku F1; the row carries msku+fnsku for SKU A.
  const used = [U("MA", "F1"), U("MB", "F1")];
  const res = assignFlowToUsedSkus([mrow({ msku: "MA", fnsku: "F1", qty: 5 })], used, new Map());
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 5);
  assert.equal(res.byUsedKey.get("MB|F1"), undefined);
  assert.equal(res.ambiguous, 0);
});

test("match: both-field row with NO exact pair is dropped (no fnsku fallback)", () => {
  const used = [U("MB", "F1")]; // only MB|F1 exists
  const res = assignFlowToUsedSkus([mrow({ msku: "MA", fnsku: "F1", qty: 5 })], used, new Map());
  assert.equal(res.byUsedKey.size, 0);
});

test("match: fnsku-blank row matched by msku (tier c)", () => {
  const used = [U("MA", "F1")];
  const res = assignFlowToUsedSkus([mrow({ msku: "ma", fnsku: null, qty: 3 })], used, new Map());
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 3); // case-insensitive
});

test("match: msku-blank row matched by fnsku (tier b)", () => {
  const used = [U("MA", "F1")];
  const res = assignFlowToUsedSkus([mrow({ msku: null, fnsku: "F1", qty: 7 })], used, new Map());
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 7);
});

test("match: ambiguous fnsku-only row counted once + flagged", () => {
  // Row has fnsku only; two used SKUs share F1 → ambiguous, assigned once.
  const used = [U("MA", "F1"), U("MB", "F1")];
  const res = assignFlowToUsedSkus([mrow({ fnsku: "F1", qty: 9 })], used, new Map());
  const total =
    (res.byUsedKey.get("MA|F1")?.qty ?? 0) + (res.byUsedKey.get("MB|F1")?.qty ?? 0);
  assert.equal(total, 9); // counted exactly once
  assert.equal(res.ambiguous, 1);
  // Deterministic smallest-key pick → MA|F1.
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 9);
});

test("match: row with neither identifier is dropped", () => {
  const res = assignFlowToUsedSkus([mrow({ qty: 5 })], [U("MA", "F1")], new Map());
  assert.equal(res.byUsedKey.size, 0);
});

test("match: ledger-date cutoff applies on the flow row's own fnsku", () => {
  const used = [U("MA", "F1")];
  const cutoff = new Map([["F1", D("2026-02-01")]]);
  const res = assignFlowToUsedSkus(
    [
      mrow({ msku: "MA", fnsku: "F1", qty: 5, date: D("2026-01-15") }), // in
      mrow({ msku: "MA", fnsku: "F1", qty: 7, date: D("2026-02-01") }), // equal → in
      mrow({ msku: "MA", fnsku: "F1", qty: 9, date: D("2026-03-01") }), // after → out
      mrow({ msku: "MA", fnsku: "F1", qty: 3, date: null }), // null → in
    ],
    used,
    cutoff,
  );
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 15);
});

test("match: cutoff is day-granular + 3-day grace (snapshot/export cadence skew)", () => {
  // Ledger snapshot at midnight 2026-02-01. The sales export runs slightly later,
  // so a same-day sale with a real timestamp and sales up to +3 days must still
  // count (the ledger ending already reflects the unit leaving). +4 days is out.
  const used = [U("MA", "F1")];
  const cutoff = new Map([["F1", D("2026-02-01")]]); // midnight UTC
  const res = assignFlowToUsedSkus(
    [
      mrow({ msku: "MA", fnsku: "F1", qty: 1, date: new Date("2026-02-01T18:30:00.000Z") }), // same day, after midnight → IN
      mrow({ msku: "MA", fnsku: "F1", qty: 1, date: D("2026-02-02") }), // +1d → IN
      mrow({ msku: "MA", fnsku: "F1", qty: 1, date: D("2026-02-04") }), // +3d boundary → IN
      mrow({ msku: "MA", fnsku: "F1", qty: 1, date: D("2026-02-05") }), // +4d → OUT
    ],
    used,
    cutoff,
  );
  assert.equal(res.byUsedKey.get("MA|F1")?.qty, 3); // 3 in, the +4d one dropped
});

test("match: amount accumulates alongside qty (reimb path)", () => {
  const res = assignFlowToUsedSkus(
    [mrow({ msku: "MA", fnsku: "F1", qty: 4, amount: 40 })],
    [U("MA", "F1")],
    new Map(),
  );
  assert.deepEqual(res.byUsedKey.get("MA|F1"), { qty: 4, amount: 40 });
});

// ── flow row builders ──────────────────────────────────────

test("salesToMatchRows: drops productAmount == 0; keeps msku + fnsku", () => {
  const out = salesToMatchRows([
    { msku: "M1", fnsku: "F1", quantity: 3, date: null, productAmount: { toString: () => "12.50" } },
    { msku: "M1", fnsku: "F1", quantity: 9, date: null, productAmount: { toString: () => "0" } },
    { msku: "M1", fnsku: "F1", quantity: 1, date: null, productAmount: null },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].qty, 3);
  assert.equal(out[0].msku, "M1");
});

test("removalsToMatchRows: shipment present blocks fallback for that fnsku (presence, not qty)", () => {
  const out = removalsToMatchRows(
    [{ msku: "M1", fnsku: "F1", quantity: 4, date: null }],
    [
      { msku: "M1", fnsku: "F1", quantity: 100, date: null }, // blocked (F1 has shipment)
      { msku: "M2", fnsku: "F2", quantity: 7, date: null }, // used (F2 absent from shipments)
    ],
  );
  const f1 = out.filter((r) => normId(r.fnsku) === "F1").reduce((s, r) => s + r.qty, 0);
  const f2 = out.filter((r) => normId(r.fnsku) === "F2").reduce((s, r) => s + r.qty, 0);
  assert.equal(f1, 4);
  assert.equal(f2, 7);
});

// ── reimb resolution (reversal-aware) ──────────────────────

function reimbAssigned(rows: GnrV2ReimbRow[], used: GnrV2UsedKey[]) {
  return assignFlowToUsedSkus(reimbToMatchRows(rows), used, new Map());
}
const RU = [U("M1", "F1")];
const rrow = (p: Partial<GnrV2ReimbRow>): GnrV2ReimbRow => ({
  msku: "M1", fnsku: "F1", quantity: 0, amount: null, reason: null,
  reimbursementId: null, originalReimbId: null, originalReimbType: null, date: null, ...p,
});

test("reimb: only whitelisted reasons count", () => {
  const res = reimbAssigned(
    [
      rrow({ quantity: 2, amount: { toString: () => "20" }, reason: "lost_warehouse", reimbursementId: "r1" }),
      rrow({ quantity: 9, amount: { toString: () => "90" }, reason: "some_other_reason", reimbursementId: "r2" }),
    ],
    RU,
  );
  assert.deepEqual(res.byUsedKey.get("M1|F1"), { qty: 2, amount: 20 });
});

test("reimb: reversal negates when original reason resolved via originalReimbType", () => {
  const res = reimbAssigned(
    [
      rrow({ quantity: 5, amount: { toString: () => "50" }, reason: "damaged_warehouse", reimbursementId: "r1" }),
      rrow({ quantity: 2, amount: { toString: () => "20" }, reason: "Reimbursement_Reversal", reimbursementId: "r2", originalReimbType: "damaged_warehouse" }),
    ],
    RU,
  );
  assert.deepEqual(res.byUsedKey.get("M1|F1"), { qty: 3, amount: 30 });
});

test("reimb: reversal resolves original reason via originalReimbId lookup", () => {
  const res = reimbAssigned(
    [
      rrow({ quantity: 5, amount: { toString: () => "50" }, reason: "lost_warehouse", reimbursementId: "ORIG" }),
      rrow({ quantity: 1, amount: { toString: () => "10" }, reason: "reimbursement_reversal", reimbursementId: "REV", originalReimbId: "ORIG" }),
    ],
    RU,
  );
  assert.deepEqual(res.byUsedKey.get("M1|F1"), { qty: 4, amount: 40 });
});

test("reimb: reversal whose original reason fails the filter is skipped", () => {
  const res = reimbAssigned(
    [
      rrow({ quantity: 5, amount: { toString: () => "50" }, reason: "lost_warehouse", reimbursementId: "r1" }),
      rrow({ quantity: 2, amount: { toString: () => "20" }, reason: "Reimbursement_Reversal", reimbursementId: "r2", originalReimbType: "not_whitelisted" }),
    ],
    RU,
  );
  assert.deepEqual(res.byUsedKey.get("M1|F1"), { qty: 5, amount: 50 });
});

test("reimb: cutoff excludes reimbursements dated after ledgerDate", () => {
  const res = assignFlowToUsedSkus(
    reimbToMatchRows([
      rrow({ quantity: 5, amount: { toString: () => "50" }, reason: "lost_warehouse", reimbursementId: "r1", date: D("2026-01-01") }),
      rrow({ quantity: 4, amount: { toString: () => "40" }, reason: "lost_warehouse", reimbursementId: "r2", date: D("2026-09-01") }),
    ]),
    RU,
    new Map([["F1", D("2026-02-01")]]),
  );
  assert.deepEqual(res.byUsedKey.get("M1|F1"), { qty: 5, amount: 50 });
});

// ── case + adj overlays ────────────────────────────────────

test("buildCaseMapV2: sums claimed + approved qty/amount and picks highest-priority status", () => {
  const m = buildCaseMapV2([
    // A raised-but-not-approved case still contributes its CLAIMED qty.
    { fnsku: "F1", unitsClaimed: 4, unitsApproved: 0, amountApproved: { toString: () => "0" }, status: "OPEN", referenceId: "C1", caseReason: "lost", raisedDate: null },
    { fnsku: "F1", unitsClaimed: 3, unitsApproved: 3, amountApproved: { toString: () => "30" }, status: "RESOLVED", referenceId: "C2", caseReason: "lost", raisedDate: null },
  ]);
  const meta = m.get("F1")!;
  assert.equal(meta.claimedQty, 7); // 4 + 3 — shown immediately, no approval needed
  assert.equal(meta.approvedQty, 3); // only the approved case
  assert.equal(meta.approvedAmount, 30);
  assert.equal(meta.count, 2);
  assert.equal(meta.topStatus, "resolved");
  assert.equal(meta.caseIds, "C1, C2");
});

test("buildAdjMapV2: sums qtyAdjusted by msku and joins reasons", () => {
  const m = buildAdjMapV2([
    { msku: "UM", qtyAdjusted: 2, reason: "count fix" },
    { msku: "UM", qtyAdjusted: -1, reason: "shrink" },
  ]);
  const meta = m.get("UM")!;
  assert.equal(meta.qty, 1);
  assert.equal(meta.count, 2);
  assert.equal(meta.reasons, "count fix; shrink");
});

// ── daysBetween ────────────────────────────────────────────

test("daysBetween: null from → 999; else floored day diff", () => {
  assert.equal(daysBetween(null, D("2026-06-10")), 999);
  assert.equal(daysBetween(D("2026-06-01"), D("2026-06-10")), 9);
});

// ── computeV2Status: every branch ──────────────────────────

const STATUS_BASE = {
  isMixedSku: false,
  hasLedger: true,
  computedEnding: 0,
  inboundGap: 0,
  inboundSuppressed: false,
  gradingNewerThanAdj: false,
  variance: 0,
  reimbQty: 0,
  caseApprovedQty: 0,
  resolvedByHuman: false,
  daysSince: 5,
};

test("status: mixed SKU outranks everything → mixed-sku", () => {
  assert.equal(
    computeV2Status({ ...STATUS_BASE, isMixedSku: true, inboundGap: 5, variance: -9 }),
    "mixed-sku",
  );
});

test("status: no ledger → take-action / review / no-snapshot", () => {
  const base = { ...STATUS_BASE, hasLedger: false };
  assert.equal(computeV2Status({ ...base, computedEnding: 0 }), "take-action"); // unverified, no anchor
  assert.equal(computeV2Status({ ...base, computedEnding: -3 }), "review");
  assert.equal(computeV2Status({ ...base, computedEnding: 4 }), "no-snapshot");
});

test("status: inboundGap < 0 (actual < expected, older grading) → claim-inbound", () => {
  assert.equal(computeV2Status({ ...STATUS_BASE, inboundGap: -3, variance: 0 }), "claim-inbound");
});

test("status: inboundGap < 0 but grading newer than adjustments → pending-data", () => {
  assert.equal(
    computeV2Status({ ...STATUS_BASE, inboundGap: -3, gradingNewerThanAdj: true, variance: 0 }),
    "pending-data",
  );
});

test("status: inboundGap < 0 but suppressed (pre-window) falls through to variance", () => {
  // suppressed gap + variance 0 → matched, not claim-inbound
  assert.equal(
    computeV2Status({ ...STATUS_BASE, inboundGap: -3, inboundSuppressed: true, variance: 0 }),
    "matched",
  );
});

test("status: variance == 0 → matched (organic); resolvedByHuman → resolved", () => {
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: 0 }), "matched");
  assert.equal(
    computeV2Status({ ...STATUS_BASE, variance: 0, resolvedByHuman: true }),
    "resolved",
  );
});

test("status: variance > 0 → over-accounted", () => {
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: 4 }), "over-accounted");
});

test("status: variance < 0 fully covered by reimb + case → reimbursed", () => {
  assert.equal(
    computeV2Status({ ...STATUS_BASE, variance: -4, reimbQty: 3, caseApprovedQty: 1, daysSince: 200 }),
    "reimbursed",
  );
});

test("status: variance < 0 uncovered but recent → waiting; aged → take-action", () => {
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: -4, daysSince: 30 }), "waiting");
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: -4, daysSince: 90 }), "take-action");
});

test("status: waiting boundary is inclusive at 60 days", () => {
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: -1, daysSince: 60 }), "waiting");
  assert.equal(computeV2Status({ ...STATUS_BASE, variance: -1, daysSince: 61 }), "take-action");
});

// ── composeGnrV2Row: end-to-end arithmetic ─────────────────

const TODAY = D("2026-06-10");

test("compose: inboundGap = gnrIn − expectedIn drives claim-inbound", () => {
  // 10 graded (all succeeded), only 4 arrived as reason='3' → gap 4 − 10 = −6
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 4, ledgerIn: 4 }),
    inMeta: inMeta(4),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.expectedInQty, 10);
  assert.equal(row.gnrInQty, 4);
  assert.equal(row.inboundGap, -6); // actual 4 − expected 10
  assert.equal(row.inboundNote, "");
  assert.equal(row.status, "claim-inbound");
});

test("compose: Failed units arriving via reason 3 do NOT create false over-accounted", () => {
  // 6 succeeded + 4 failed = 10 expected; all 10 arrived as reason='3'.
  // Balance starts from gnrIn 10. Ledger ending 10 (4 unsellable + 6 sellable).
  const row = compose({
    agg: agg({ succeededQty: 6, failedQty: 4, gnrQty: 10, lastDate: D("2026-06-01") }),
    // ledgerOther includes the reason-3 arrivals (10) → ledgerAdj nets to 0.
    ledger: ledger({ ledgerEnding: 10, ledgerIn: 10, ledgerOther: 10, unsellableOnHand: 4 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.expectedInQty, 10);
  assert.equal(row.gnrInQty, 10);
  assert.equal(row.inboundGap, 0); // all expected units arrived
  assert.equal(row.computedEnding, 10); // gnrIn 10, no outflows
  assert.equal(row.variance, 0);
  assert.equal(row.status, "matched"); // NOT over-accounted
});

test("compose: succeeded-only FNSKU (no failed) reconciles from arrivals", () => {
  const row = compose({
    agg: agg({ succeededQty: 8, failedQty: 0, gnrQty: 8, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 5, ledgerIn: 8, ledgerOther: 8, unsellableOnHand: 0 }),
    inMeta: inMeta(8),
    salesQty: 3,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.expectedInQty, 8);
  assert.equal(row.inboundGap, 0);
  assert.equal(row.computedEnding, 5); // 8 - 3 sales
  assert.equal(row.variance, 0);
  assert.equal(row.unsellableOnHand, 0);
  assert.equal(row.status, "matched");
});

test("compose: failed stock still on hand surfaces unsellableOnHand", () => {
  // 4 failed graded, arrived, never removed → sit in unsellable; ledger ending 4.
  const row = compose({
    agg: agg({ succeededQty: 0, failedQty: 4, gnrQty: 4, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 4, ledgerIn: 4, ledgerOther: 4, unsellableOnHand: 4 }),
    inMeta: inMeta(4),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.unsellableOnHand, 4);
  assert.equal(row.computedEnding, 4);
  assert.equal(row.variance, 0);
  assert.equal(row.status, "matched");
});

test("compose: opening-balance suppresses an inbound claim (pre-window)", () => {
  // 10 graded, 0 arrivals in window → raw gap 10, but openingBal 12 covers it.
  const row = compose({
    agg: agg({ succeededQty: 10, failedQty: 0, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 10, ledgerIn: 0, openingBal: 12 }),
    inMeta: inMeta(0),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.inboundGap, -10); // actual 0 − expected 10
  assert.equal(row.inboundNote, "pre-window");
  // gnrIn 0 → computed 0; variance = 10 - 0 = 10 → over-accounted (NOT claim-inbound)
  assert.equal(row.computedEnding, 0);
  assert.equal(row.variance, 10);
  assert.equal(row.status, "over-accounted");
});

test("compose: opening-balance below the gap does NOT suppress the claim", () => {
  const row = compose({
    agg: agg({ succeededQty: 10, failedQty: 0, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 10, ledgerIn: 0, openingBal: 3 }),
    inMeta: inMeta(2),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.inboundGap, -8); // actual 2 − expected 10
  assert.equal(row.inboundNote, ""); // openingBal 3 < shortfall 8
  assert.equal(row.status, "claim-inbound");
});

test("compose: Computed End = Actual + Sales + Returns + Removals + Reimb + Manual Adj", () => {
  // computed = 20 − 5 + 2 − 3 + reimb(−4) + adj 1 = 11.
  // reimb IS a contributor; case (1) is money-side only. Ledger 11 → var 0.
  const row = compose({
    agg: agg({ succeededQty: 20, failedQty: 0, gnrQty: 20, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 11, ledgerIn: 20, ledgerOther: 20 }),
    inMeta: inMeta(20),
    salesQty: 5,
    returnQty: 2,
    removalQty: 3,
    reimb: { qty: 4, amount: 40 },
    caseMeta: { approvedQty: 1, approvedAmount: 10, count: 1, topStatus: "resolved", caseIds: "C1", reasons: "lost" },
    adj: { qty: 1, count: 1, reasons: "fix" },
    today: TODAY,
  });
  assert.equal(row.reimbSigned, -4); // contributor
  assert.equal(row.caseApprSigned, 1); // displayed but excluded
  assert.equal(row.computedEnding, 11);
  assert.equal(row.variance, 0);
  // adj qty 1 + approved case → closed by a human → resolved (not organic matched).
  assert.equal(row.status, "resolved");
});

test("compose: W/H Events is a display column, NOT part of Computed End", () => {
  // wh = found 1 − lost 2 − damaged 1 − disposed 1 = −3 (surfaced as its column).
  // computed = actualIn 10 only (no sales/returns/removals/reimb/adj). Ledger 10 → var 0.
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 10, ledgerIn: 11, ledgerFound: 1, ledgerLost: 2, ledgerDamaged: 1, ledgerDisposed: 1, ledgerOther: 10 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.whEventsSigned, -3); // still computed + surfaced
  assert.deepEqual(row.whBreakdown, { found: 1, lost: 2, damaged: 1, disposed: 1 });
  assert.equal(row.computedEnding, 10); // wh NOT in the sum
  assert.equal(row.variance, 0);
  assert.equal(row.status, "matched");
});

test("compose: reimb is a Computed-End contributor (Reimb Qty subtracts a unit)", () => {
  // 10 arrived; a reimb of 1 subtracts via reimbSigned → computed 9. Ledger 9.
  // W/H Events (−1) is display only and does NOT double-subtract.
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-03-01") }),
    ledger: ledger({ ledgerEnding: 9, ledgerIn: 10, ledgerLost: 1, ledgerOther: 10 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: { qty: 1, amount: 10 },
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.whEventsSigned, -1); // display only, NOT in the sum
  assert.equal(row.reimbSigned, -1); // contributor
  assert.equal(row.computedEnding, 9); // 10 + reimb(−1) — wh not added
  assert.equal(row.variance, 0);
  assert.equal(row.status, "matched");
});

test("compose: no ledger → variance null, hasLedger false, computed drives status", () => {
  const row = compose({
    agg: agg({ succeededQty: 5, gnrQty: 5, lastDate: D("2026-06-01") }),
    ledger: undefined,
    inMeta: inMeta(5),
    salesQty: 5,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.hasLedger, false);
  assert.equal(row.variance, null);
  assert.equal(row.computedEnding, 0); // gnrIn 5 - sales 5
  assert.equal(row.status, "take-action"); // no ledger anchor → unverified
});

test("compose: negative variance uncovered → take-action", () => {
  // gnrIn 10; computed = 10 (case is money-side, excluded). variance = 3 - 10 = -7.
  // covered = reimb 0 + case 4 = 4 < 7 → uncovered, aged → take-action.
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-01-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 10, ledgerOther: 10 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: { qty: 0, amount: 0 },
    caseMeta: { approvedQty: 4, approvedAmount: 40, count: 1, topStatus: "resolved", caseIds: "C1", reasons: "lost" },
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.computedEnding, 10);
  assert.equal(row.variance, -7);
  assert.equal(row.status, "take-action");
});

test("compose: negative variance fully covered by reimb + case → reimbursed", () => {
  // reimb 2 IS a contributor → computed = 10 + (−2) = 8. Ledger 6 → variance −2.
  // covered = reimbQty 2 + caseApprovedQty 2 = 4 >= |−2| → reimbursed.
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-01-01") }),
    ledger: ledger({ ledgerEnding: 6, ledgerIn: 10, ledgerOther: 10 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: { qty: 2, amount: 20 },
    caseMeta: { approvedQty: 2, approvedAmount: 20, count: 1, topStatus: "resolved", caseIds: "C1", reasons: "lost" },
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.computedEnding, 8);
  assert.equal(row.variance, -2);
  assert.equal(row.status, "reimbursed");
});

// ── negative inbound gap (extra/unrecorded arrivals) ───────

test("status: inboundGap > 0 → review (overrides variance branches)", () => {
  // Positive gap (actual > expected) with a non-zero variance must still → review.
  assert.equal(
    computeV2Status({ ...STATUS_BASE, inboundGap: 3, variance: -5, daysSince: 5 }),
    "review",
  );
});

test("compose: more arrivals than expected → positive gap → review", () => {
  // expectedIn 6, gnrIn 9 → gap 9 − 6 = +3.
  const row = compose({
    agg: agg({ succeededQty: 4, failedQty: 2, gnrQty: 6, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 9, ledgerIn: 9 }),
    inMeta: inMeta(9),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.expectedInQty, 6);
  assert.equal(row.gnrInQty, 9);
  assert.equal(row.inboundGap, 3); // actual 9 − expected 6
  assert.equal(row.status, "review");
});

// ── mixed-sku detection + status ───────────────────────────

test("isMixedSkuAgg: used == orig, empty used, or placeholder → mixed", () => {
  assert.equal(isMixedSkuAgg({ usedFnsku: "X0ABC", origFnsku: "X0ABC" }), true); // identical
  assert.equal(isMixedSkuAgg({ usedFnsku: "x0abc", origFnsku: "X0ABC" }), true); // case-insensitive
  assert.equal(isMixedSkuAgg({ usedFnsku: "(No Used FNSKU)", origFnsku: "X0ABC" }), true); // placeholder
  assert.equal(isMixedSkuAgg({ usedFnsku: "", origFnsku: "X0ABC" }), true); // empty
  assert.equal(isMixedSkuAgg({ usedFnsku: "X0USED", origFnsku: "X0ORIG" }), false); // distinct
});

test("compose: same-FNSKU row → mixed-sku, no claim, computed/variance suppressed", () => {
  // usedFnsku === origFnsku; even with a fat inbound gap + ledger, it must not claim.
  const row = compose({
    agg: agg({ usedFnsku: "X0SAME", origFnsku: "X0SAME", succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 0 }),
    inMeta: inMeta(0), // gap would be −10
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  });
  assert.equal(row.isMixedSku, true);
  assert.equal(row.status, "mixed-sku");
  assert.equal(row.variance, null); // recon math suppressed
  assert.equal(row.inboundGap, -10); // actual 0 − expected 10; flow still surfaced
});

// ── pending-data timing guard ──────────────────────────────

test("isGradingNewerThanAdj: grading after (coverageEnd − 7d) → true; older → false; no coverage → false", () => {
  const coverageEnd = D("2026-06-01");
  assert.equal(isGradingNewerThanAdj(D("2026-05-28"), coverageEnd), true); // within 7d window
  assert.equal(isGradingNewerThanAdj(D("2026-06-05"), coverageEnd), true); // after end
  assert.equal(isGradingNewerThanAdj(D("2026-05-20"), coverageEnd), false); // older than window
  assert.equal(isGradingNewerThanAdj(D("2026-05-25"), coverageEnd), false); // exactly 7d → not strictly after
  assert.equal(isGradingNewerThanAdj(null, coverageEnd), false); // no grading date
  assert.equal(isGradingNewerThanAdj(D("2026-06-05"), null), false); // no coverage end
});

test("compose: inbound gap + recent grading → pending-data (not claim-inbound)", () => {
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-05-30") }), // recent grading
    ledger: ledger({ ledgerEnding: 4, ledgerIn: 4 }),
    inMeta: inMeta(4), // gap −6
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    adjCoverageEnd: D("2026-06-01"), // grading 05-30 is within 7d of this
    today: TODAY,
  });
  assert.equal(row.inboundGap, -6); // actual 4 − expected 10
  assert.equal(row.status, "pending-data");
});

test("compose: inbound gap + older grading → claim-inbound", () => {
  const row = compose({
    agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-03-01") }), // old grading
    ledger: ledger({ ledgerEnding: 4, ledgerIn: 4 }),
    inMeta: inMeta(4), // gap −6
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    adjCoverageEnd: D("2026-06-01"), // grading well before window
    today: TODAY,
  });
  assert.equal(row.inboundGap, -6); // actual 4 − expected 10
  assert.equal(row.status, "claim-inbound");
});

// ── signed display fields = single source of truth ─────────

test("compose: signed display fields carry the correct sign", () => {
  const row = compose({
    agg: agg({ succeededQty: 20, failedQty: 0, gnrQty: 20, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 12, ledgerIn: 20 }),
    inMeta: inMeta(20),
    salesQty: 5,
    returnQty: 2,
    removalQty: 3,
    reimb: { qty: 4, amount: 40 },
    caseMeta: { approvedQty: 1, approvedAmount: 10, count: 1, topStatus: "resolved", caseIds: "C1", reasons: "lost" },
    adj: { qty: 1, count: 1, reasons: "fix" },
    today: TODAY,
  });
  assert.equal(row.actualIn, 20); // + reason-3 arrivals
  assert.equal(row.salesSigned, -5); // − sales
  assert.equal(row.returnsSigned, 2); // + returns
  assert.equal(row.removalsSigned, -3); // − removals
  assert.equal(row.reimbSigned, -4); // − reimb
  assert.equal(row.adjSigned, 1); // ± adj (stored sign)
  assert.equal(row.caseApprSigned, 1); // + case approved
});

test("compose: adjSigned keeps the stored sign (negative adjustment)", () => {
  const row = compose({
    agg: agg({ succeededQty: 5, gnrQty: 5, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 5, ledgerOther: 5 }),
    inMeta: inMeta(5),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: { qty: -2, count: 1, reasons: "shrink" },
    today: TODAY,
  });
  assert.equal(row.adjSigned, -2);
  assert.equal(row.computedEnding, 3); // 5 + (−2)
});

test("compose: computedEnding is EXACTLY the sum of the signed display fields", () => {
  const make = (p: Partial<Parameters<typeof compose>[0]>) =>
    compose({
      agg: agg({ succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
      ledger: ledger({ ledgerEnding: 0, ledgerIn: 10 }),
      inMeta: inMeta(10),
      salesQty: 0,
      returnQty: 0,
      removalQty: 0,
      reimb: undefined,
      caseMeta: undefined,
      adj: undefined,
      today: TODAY,
      ...p,
    });
  const rows = [
    make({}),
    make({ salesQty: 3, returnQty: 1 }),
    make({ removalQty: 2 }),
    make({ adj: { qty: -4, count: 1, reasons: "x" } }),
    // reimb IS a contributor now; case is NOT.
    make({ reimb: { qty: 5, amount: 50 }, caseMeta: { approvedQty: 2, approvedAmount: 20, count: 1, topStatus: "resolved", caseIds: "C", reasons: "lost" } }),
  ];
  for (const r of rows) {
    const sum =
      r.actualIn +
      r.salesSigned +
      r.returnsSigned +
      r.removalsSigned +
      r.reimbSigned +
      r.adjSigned;
    assert.equal(r.computedEnding, sum);
  }
});

test("Computed End header total == sum of the contributor column totals (fixture)", () => {
  // Mirrors the table header: Σ computedEnding must equal the sum of the
  // per-column signed totals. Asserted on a multi-row fixture so a regression in
  // either the formula or the column accessors breaks this test.
  const make = (p: Partial<Parameters<typeof compose>[0]>) =>
    compose({
      agg: agg({ succeededQty: 8, gnrQty: 8, lastDate: D("2026-06-01") }),
      ledger: ledger({ ledgerEnding: 0, ledgerIn: 8 }),
      inMeta: inMeta(8),
      salesQty: 0,
      returnQty: 0,
      removalQty: 0,
      reimb: undefined,
      caseMeta: undefined,
      adj: undefined,
      today: TODAY,
      ...p,
    });
  const rows = [
    make({ salesQty: 2 }),
    make({ returnQty: 3, removalQty: 1 }),
    make({ adj: { qty: 4, count: 1, reasons: "x" } }),
    // reimb IS a contributor; case is NOT.
    make({ reimb: { qty: 2, amount: 20 }, caseMeta: { approvedQty: 5, approvedAmount: 50, count: 1, topStatus: "resolved", caseIds: "C", reasons: "lost" } }),
    // mixed-sku row: computedEnding still equals its signed-field sum and must be
    // included on both sides of the identity.
    make({ agg: agg({ usedFnsku: "X0SAME", origFnsku: "X0SAME", succeededQty: 6, gnrQty: 6, lastDate: D("2026-06-01") }), inMeta: inMeta(6), salesQty: 1 }),
  ];
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const colTotalSum =
    sum((r) => r.actualIn) +
    sum((r) => r.salesSigned) +
    sum((r) => r.returnsSigned) +
    sum((r) => r.removalsSigned) +
    sum((r) => r.reimbSigned) +
    sum((r) => r.adjSigned);
  const computedEndTotal = sum((r) => r.computedEnding);
  assert.equal(computedEndTotal, colTotalSum);
});

// ── flow detail popovers (Sales / Returns / Removals) ──────

test("compose: Σ sales detail qty equals the Sales cell value; amount carried", () => {
  // Two used SKUs share F1; the matched rows for MA|F1 are the ones the action
  // hands to compose via detailsByUsedKey.
  const used = [U("MA", "F1")];
  const sales = salesToMatchRows([
    { msku: "MA", fnsku: "F1", quantity: 3, date: D("2026-05-01"), productAmount: { toString: () => "30" }, orderId: "O1" },
    { msku: "MA", fnsku: "F1", quantity: 2, date: D("2026-05-03"), productAmount: { toString: () => "25" }, orderId: "O2" },
    { msku: "MA", fnsku: "F1", quantity: 9, date: D("2026-05-04"), productAmount: { toString: () => "0" }, orderId: "O3" }, // dropped (amt 0)
  ]);
  const m = assignFlowToUsedSkus(sales, used, new Map(), "sales");
  const matched = m.detailsByUsedKey.get("MA|F1");

  const row = compose({
    agg: agg({ usedMsku: "MA", usedFnsku: "F1", origFnsku: "ORIG", succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 5, ledgerIn: 10 }),
    inMeta: inMeta(10),
    salesQty: m.byUsedKey.get("MA|F1")!.qty,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    salesMatched: matched,
    today: TODAY,
  });

  // Cell value (absolute) and signed display.
  assert.equal(row.salesQty, 5);
  assert.equal(row.salesSigned, -5);
  // Σ detail qty === cell value.
  const sumQty = row.salesDetails.rows.reduce((s, d) => s + d.qty, 0);
  assert.equal(sumQty, row.salesQty);
  // Amounts carried; date-desc order.
  assert.equal(row.salesDetails.totalCount, 2);
  assert.equal(row.salesDetails.rows[0].date, "2026-05-03"); // newest first
  assert.equal(row.salesDetails.rows[0].amount, 25);
  assert.equal(row.salesDetails.rows[1].amount, 30);
});

test("compose: Σ return / removal detail qty equals the cell value", () => {
  const used = [U("MA", "F1")];
  const returns = flowToMatchRows([
    { msku: "MA", fnsku: "F1", quantity: 2, date: D("2026-05-02"), orderId: "R1", disposition: "SELLABLE" },
    { msku: "MA", fnsku: "F1", quantity: 1, date: D("2026-05-05"), orderId: "R2", disposition: "DEFECTIVE" },
  ]);
  const removals = removalsToMatchRows(
    [{ msku: "MA", fnsku: "F1", quantity: 4, date: D("2026-05-01"), orderId: "S1", disposition: "DISPOSE" }],
    [{ msku: "MA", fnsku: "F1", quantity: 99, date: D("2026-05-09"), orderId: "X1", disposition: "DISPOSE" }], // blocked: F1 has a shipment
  );
  const rm = assignFlowToUsedSkus(returns, used, new Map(), "returns");
  const rmo = assignFlowToUsedSkus(removals, used, new Map(), "removals");

  const row = compose({
    agg: agg({ usedMsku: "MA", usedFnsku: "F1", origFnsku: "ORIG", succeededQty: 10, gnrQty: 10, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 9, ledgerIn: 10 }),
    inMeta: inMeta(10),
    salesQty: 0,
    returnQty: rm.byUsedKey.get("MA|F1")!.qty,
    removalQty: rmo.byUsedKey.get("MA|F1")!.qty,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    returnsMatched: rm.detailsByUsedKey.get("MA|F1"),
    removalsMatched: rmo.detailsByUsedKey.get("MA|F1"),
    today: TODAY,
  });

  assert.equal(row.returnQty, 3);
  assert.equal(
    row.returnDetails.rows.reduce((s, d) => s + d.qty, 0),
    row.returnQty,
  );
  assert.equal(row.returnDetails.rows[0].disposition, "DEFECTIVE"); // newest first
  // removals: only the shipment row matched (fallback F1 blocked).
  assert.equal(row.removalQty, 4);
  assert.equal(
    row.removalDetails.rows.reduce((s, d) => s + d.qty, 0),
    row.removalQty,
  );
  assert.equal(row.removalDetails.rows[0].source, "shipment");
});

test("compose: zero-qty cells carry no details (payload stays lean)", () => {
  const row = compose({
    agg: agg({ succeededQty: 5, gnrQty: 5, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 5, ledgerIn: 5 }),
    inMeta: inMeta(5),
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    // Even if matched rows are (spuriously) passed, a 0 cell stays empty.
    salesMatched: [{ msku: "MA", fnsku: "F1", qty: 0, amount: 0, date: null }],
    today: TODAY,
  });
  assert.deepEqual(row.salesDetails, { rows: [], totalCount: 0 });
  assert.deepEqual(row.returnDetails, { rows: [], totalCount: 0 });
  assert.deepEqual(row.removalDetails, { rows: [], totalCount: 0 });
});

test("buildSalesDetails: caps at 50, keeps totalCount, newest first", () => {
  const matched = Array.from({ length: 73 }, (_, i) => ({
    msku: "MA",
    fnsku: "F1",
    qty: 1,
    amount: 1,
    date: D(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
    orderId: `O${i}`,
  }));
  const list = buildSalesDetails(matched);
  assert.equal(list.totalCount, 73);
  assert.equal(list.rows.length, 50); // capped
});

// ── summaryStatsV2 ─────────────────────────────────────────

test("summaryStatsV2 counts buckets and account-wide reason3 totals; mixed excluded", () => {
  const rows = [
    compose({ agg: agg({ succeededQty: 4, failedQty: 0, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 4, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY }), // matched, expected 4 / in 4
    compose({ agg: agg({ succeededQty: 4, failedQty: 0, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 4, ledgerIn: 1 }), inMeta: inMeta(1), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY }), // claim-inbound, expected 4 / in 1
    // mixed-sku row: large expected/in that must NOT skew account-wide reason3 totals
    compose({ agg: agg({ usedFnsku: "X0SAME", origFnsku: "X0SAME", succeededQty: 999, failedQty: 0, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 0, ledgerIn: 0 }), inMeta: inMeta(0), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY }),
  ];
  const s = summaryStatsV2(rows, 2);
  assert.equal(s.totalSkus, 3);
  assert.equal(s.matched, 1);
  assert.equal(s.claimInbound, 1);
  assert.equal(s.mixedSku, 1);
  assert.equal(s.totalExpectedIn, 8); // mixed row's 999 excluded
  assert.equal(s.totalReason3Qty, 5); // 4 + 1, mixed excluded
  assert.equal(s.reason3Warn, true); // |5-8|/8 = 0.375 > 0.10
  assert.equal(s.ambiguousFlowRows, 2); // passed through
  // byStatus + byGroup: matched (no-action) + claim-inbound & mixed-sku (take-action).
  assert.equal(s.byStatus["matched"], 1);
  assert.equal(s.byStatus["claim-inbound"], 1);
  assert.equal(s.byStatus["mixed-sku"], 1);
  assert.equal(s.byGroup["take-action"], 2); // claim-inbound + mixed-sku
  assert.equal(s.byGroup["no-action"], 1); // matched
  assert.equal(s.byGroup["excess"], 0);
});

// ── action grouping (STATUS_TO_GROUP) ──────────────────────

// Every GnrV2Status, enumerated independently from the source map so a status
// added without updating this list (or the map) fails the test.
const ALL_GNR_V2_STATUSES: GnrV2Status[] = [
  "mixed-sku",
  "review",
  "no-snapshot",
  "claim-inbound",
  "pending-data",
  "matched",
  "resolved",
  "over-accounted",
  "reimbursed",
  "waiting",
  "take-action",
];

/** Build a compose() row that deterministically resolves to the given status. */
function statusFixtureRow(s: GnrV2Status) {
  const recent = D("2026-06-10"); // within waiting window
  const old = D("2026-01-01"); // aged past 60d
  const base = {
    salesQty: 0,
    returnQty: 0,
    removalQty: 0,
    reimb: undefined,
    caseMeta: undefined,
    adj: undefined,
    today: TODAY,
  } as const;
  switch (s) {
    case "mixed-sku":
      return compose({ ...base, agg: agg({ usedFnsku: "X0SAME", origFnsku: "X0SAME", succeededQty: 1, gnrQty: 1, lastDate: recent }), ledger: ledger({ ledgerEnding: 0, ledgerIn: 0 }), inMeta: inMeta(0) });
    case "no-snapshot":
      // no ledger, computed > 0.
      return compose({ ...base, agg: agg({ succeededQty: 2, gnrQty: 2, lastDate: recent }), ledger: undefined, inMeta: inMeta(2) });
    case "review":
      // ledger present, actual > expected → inboundGap > 0.
      return compose({ ...base, agg: agg({ succeededQty: 1, gnrQty: 1, lastDate: recent }), ledger: ledger({ ledgerEnding: 3, ledgerIn: 3, ledgerOther: 3 }), inMeta: inMeta(3) });
    case "claim-inbound":
      // ledger, gap < 0 (actual < expected), OLD grading, no adj coverage guard.
      return compose({ ...base, agg: agg({ succeededQty: 5, gnrQty: 5, lastDate: old }), ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }), inMeta: inMeta(1) });
    case "pending-data":
      // same gap < 0 but grading NEWER than adjustments coverage.
      return compose({ ...base, agg: agg({ succeededQty: 5, gnrQty: 5, lastDate: D("2026-05-30") }), ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }), inMeta: inMeta(1), adjCoverageEnd: D("2026-06-01") });
    case "matched":
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: recent }), ledger: ledger({ ledgerEnding: 4, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4) });
    case "resolved":
      // variance 0 but closed by a manual adj: computed 4 + adj 1 = 5, ledger 5.
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: recent }), ledger: ledger({ ledgerEnding: 5, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4), adj: { qty: 1, count: 1, reasons: "fix" } });
    case "over-accounted":
      // gap 0 (actual == expected) but variance > 0 (ledger above computed).
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: recent }), ledger: ledger({ ledgerEnding: 7, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4) });
    case "reimbursed":
      // reimb 2 subtracts in computed (4 − 2 = 2); ledger 0 → variance −2,
      // fully covered by reimbQty 2 → reimbursed.
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: old }), ledger: ledger({ ledgerEnding: 0, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4), reimb: { qty: 2, amount: 20 } });
    case "waiting":
      // variance < 0 uncovered, RECENT grading (<=60d).
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: recent }), ledger: ledger({ ledgerEnding: 2, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4) });
    case "take-action":
      // variance < 0 uncovered, AGED.
      return compose({ ...base, agg: agg({ succeededQty: 4, gnrQty: 4, lastDate: old }), ledger: ledger({ ledgerEnding: 2, ledgerIn: 4, ledgerOther: 4 }), inMeta: inMeta(4) });
  }
}

test("statusFixtureRow produces each intended status (guards the group fixtures)", () => {
  for (const s of ALL_GNR_V2_STATUSES) {
    assert.equal(statusFixtureRow(s).status, s, `fixture for ${s}`);
  }
});

test("STATUS_TO_GROUP: exhaustive — every GnrV2Status maps to a valid group", () => {
  const VALID: GnrV2ActionGroup[] = ["take-action", "no-action", "excess"];
  for (const s of ALL_GNR_V2_STATUSES) {
    const g = STATUS_TO_GROUP[s];
    assert.ok(g !== undefined, `status ${s} has no group`);
    assert.ok(VALID.includes(g), `status ${s} → invalid group ${g}`);
    assert.equal(actionGroupOf(s), g); // helper agrees with the map
  }
  // Map has no extra keys beyond the known statuses.
  assert.equal(Object.keys(STATUS_TO_GROUP).length, ALL_GNR_V2_STATUSES.length);
});

test("STATUS_TO_GROUP: exact group membership", () => {
  const expect: Record<GnrV2ActionGroup, GnrV2Status[]> = {
    "take-action": ["claim-inbound", "take-action", "mixed-sku", "no-snapshot", "waiting", "pending-data"],
    "no-action": ["matched", "resolved", "reimbursed"],
    excess: ["over-accounted", "review"],
  };
  for (const g of GNR_V2_ACTION_GROUPS) {
    const members = ALL_GNR_V2_STATUSES.filter((s) => STATUS_TO_GROUP[s] === g).sort();
    assert.deepEqual(members, [...expect[g]].sort());
  }
});

test("summaryStatsV2: every group count equals the sum of its member status counts", () => {
  // Build one row per status by choosing inputs that deterministically produce it.
  const rowFor = (s: GnrV2Status) => statusFixtureRow(s);
  const rows = ALL_GNR_V2_STATUSES.flatMap((s) => [rowFor(s), rowFor(s)]); // 2 of each
  const st = summaryStatsV2(rows);
  // Each status counted twice.
  for (const s of ALL_GNR_V2_STATUSES) assert.equal(st.byStatus[s], 2, `byStatus ${s}`);
  // Group count == Σ member status counts.
  for (const g of GNR_V2_ACTION_GROUPS) {
    const expected = ALL_GNR_V2_STATUSES.filter((s) => STATUS_TO_GROUP[s] === g).reduce(
      (acc, s) => acc + st.byStatus[s],
      0,
    );
    assert.equal(st.byGroup[g], expected, `byGroup ${g}`);
  }
  // Totals add up.
  assert.equal(st.totalSkus, ALL_GNR_V2_STATUSES.length * 2);
  assert.equal(
    GNR_V2_ACTION_GROUPS.reduce((acc, g) => acc + st.byGroup[g], 0),
    st.totalSkus,
  );
});

test("summaryStatsV2: within 10% does not warn", () => {
  const rows = [
    compose({ agg: agg({ succeededQty: 100, failedQty: 0, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 95, ledgerIn: 95 }), inMeta: inMeta(95), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY }),
  ];
  const s = summaryStatsV2(rows);
  assert.equal(s.totalExpectedIn, 100);
  assert.equal(s.totalReason3Qty, 95);
  assert.equal(s.reason3Warn, false); // 5% off
  assert.equal(s.ambiguousFlowRows, 0); // defaults to 0
});

// ── ASIN drill-down: aggregateAsinRows + mergeMemberDetails ─

test("aggregateAsinRows: sums non-mixed members; mixed excluded but surfaced", () => {
  // Two real members on ASIN B1 + one mixed member (must not enter sums).
  const m1 = compose({
    agg: agg({ asin: "B1", usedMsku: "MA", usedFnsku: "F1", origFnsku: "O1", succeededQty: 4, gnrQty: 4, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 4, ledgerOther: 4 }),
    inMeta: inMeta(4),
    salesQty: 1, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const m2 = compose({
    agg: agg({ asin: "B1", usedMsku: "MB", usedFnsku: "F2", origFnsku: "O2", succeededQty: 6, gnrQty: 6, lastDate: D("2026-06-05") }),
    ledger: ledger({ ledgerEnding: 6, ledgerIn: 6, ledgerOther: 6 }),
    inMeta: inMeta(6),
    salesQty: 2, returnQty: 1, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const mixed = compose({
    agg: agg({ asin: "B1", usedMsku: "MC", usedFnsku: "X0SAME", origFnsku: "X0SAME", succeededQty: 99, gnrQty: 99, lastDate: D("2026-06-03") }),
    ledger: ledger({ ledgerEnding: 0, ledgerIn: 0 }),
    inMeta: inMeta(0),
    salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });

  const [a] = aggregateAsinRows([m1, m2, mixed]);
  assert.equal(a.asin, "B1");
  assert.equal(a.memberCount, 3);
  assert.equal(a.mixedCount, 1);
  // Sums over non-mixed only (mixed 99 excluded).
  assert.equal(a.expectedInQty, m1.expectedInQty + m2.expectedInQty);
  assert.equal(a.actualIn, m1.actualIn + m2.actualIn);
  assert.equal(a.salesSigned, m1.salesSigned + m2.salesSigned);
  assert.equal(a.returnsSigned, m1.returnsSigned + m2.returnsSigned);
  assert.equal(a.computedEnding, m1.computedEnding + m2.computedEnding);
  assert.equal(a.ledgerEnding, (m1.ledgerEnding ?? 0) + (m2.ledgerEnding ?? 0));
  assert.equal(a.variance, a.ledgerEnding! - a.computedEnding);
  assert.equal(a.inboundGap, a.actualIn - a.expectedInQty);
  // gnrDate = latest member date.
  assert.equal(a.gnrDate, "2026-06-05");
});

test("aggregateAsinRows: groups distinct ASINs separately", () => {
  const a = compose({ agg: agg({ asin: "B1", usedFnsku: "F1", origFnsku: "O1", succeededQty: 1, gnrQty: 1, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }), inMeta: inMeta(1), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY });
  const b = compose({ agg: agg({ asin: "B2", usedFnsku: "F9", origFnsku: "O9", succeededQty: 1, gnrQty: 1, lastDate: D("2026-06-01") }), ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }), inMeta: inMeta(1), salesQty: 0, returnQty: 0, removalQty: 0, reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY });
  const rows = aggregateAsinRows([a, b]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.asin).sort(), ["B1", "B2"]);
});

test("mergeMemberDetails: merged flow/inbound totals equal the aggregated row fields", () => {
  const m1 = compose({
    agg: agg({ asin: "B1", usedMsku: "MA", usedFnsku: "F1", origFnsku: "O1", succeededQty: 4, gnrQty: 4, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 4, ledgerOther: 4 }),
    // inMeta with two reason-3 events.
    inMeta: { gnrInQty: 4, events: [
      { adjDate: "2026-05-10", qty: 3, referenceId: "R1", fc: "FC1", disposition: "SELLABLE" },
      { adjDate: "2026-05-12", qty: 1, referenceId: "R2", fc: "FC1", disposition: "CUSTOMER_DAMAGED" },
    ] },
    salesQty: 2, returnQty: 1, removalQty: 0,
    salesMatched: [
      { msku: "MA", fnsku: "F1", qty: 2, amount: 20, date: D("2026-05-15"), orderId: "S1" },
    ],
    returnsMatched: [
      { msku: "MA", fnsku: "F1", qty: 1, amount: 0, date: D("2026-05-16"), orderId: "RT1", disposition: "SELLABLE" },
    ],
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const m2 = compose({
    agg: agg({ asin: "B1", usedMsku: "MB", usedFnsku: "F2", origFnsku: "O2", succeededQty: 6, gnrQty: 6, lastDate: D("2026-06-05") }),
    ledger: ledger({ ledgerEnding: 5, ledgerIn: 6, ledgerOther: 6 }),
    inMeta: { gnrInQty: 6, events: [
      { adjDate: "2026-05-11", qty: 6, referenceId: "R3", fc: "FC2", disposition: "SELLABLE" },
    ] },
    salesQty: 1, returnQty: 0, removalQty: 0,
    salesMatched: [
      { msku: "MB", fnsku: "F2", qty: 1, amount: 9, date: D("2026-05-14"), orderId: "S2" },
    ],
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });

  const members = [m1, m2];
  const [a] = aggregateAsinRows(members);
  const detail = mergeMemberDetails(members);

  // Inbound events merged + sorted ASC by date.
  assert.equal(detail.inEvents.length, 3);
  assert.deepEqual(detail.inEvents.map((e) => e.adjDate), ["2026-05-10", "2026-05-11", "2026-05-12"]);
  const inboundTotal = detail.inEvents.reduce((s, e) => s + e.qty, 0);
  assert.equal(inboundTotal, a.actualIn); // 4 + 6
  // Member FNSKU tag preserved.
  assert.ok(detail.inEvents.every((e) => e.fnsku === "F1" || e.fnsku === "F2"));

  // Sales total qty == aggregated salesQty (== −salesSigned).
  const salesQty = detail.sales.reduce((s, d) => s + d.qty, 0);
  assert.equal(salesQty, a.salesQty);
  assert.equal(salesQty, -a.salesSigned);
  // Returns total qty == aggregated returnQty.
  const returnQty = detail.returns.reduce((s, d) => s + d.qty, 0);
  assert.equal(returnQty, a.returnQty);
  assert.equal(returnQty, a.returnsSigned);
});

test("aggregateAsinRows: PARTIAL ledger coverage → no-snapshot, ledger/variance null", () => {
  // Two non-mixed members on B7: one HAS a ledger, one does NOT.
  const covered = compose({
    agg: agg({ asin: "B7", usedMsku: "MA", usedFnsku: "F1", origFnsku: "O1", succeededQty: 4, gnrQty: 4, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 4, ledgerIn: 4, ledgerOther: 4 }),
    inMeta: inMeta(4),
    salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const uncovered = compose({
    agg: agg({ asin: "B7", usedMsku: "MB", usedFnsku: "F2", origFnsku: "O2", succeededQty: 3, gnrQty: 3, lastDate: D("2026-06-02") }),
    ledger: undefined, // no snapshot
    inMeta: inMeta(3),
    salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });

  const [a] = aggregateAsinRows([covered, uncovered]);
  assert.equal(a.reconcilableCount, 2);
  assert.equal(a.ledgerCoveredCount, 1);
  assert.equal(a.partialLedger, true);
  assert.equal(a.status, "no-snapshot"); // forced — partial variance is misleading
  assert.equal(a.ledgerEnding, null); // ledger-side suppressed
  assert.equal(a.variance, null);
  assert.equal(a.whBreakdownSuppressed, true);
  assert.ok(a.ledgerNote.includes("1 of 2"));
  // Flow / inbound sums still computed.
  assert.equal(a.expectedInQty, covered.expectedInQty + uncovered.expectedInQty);
  assert.equal(a.actualIn, covered.actualIn + uncovered.actualIn);
});

test("aggregateAsinRows: FULL coverage unchanged — ledger + variance present", () => {
  const m1 = compose({
    agg: agg({ asin: "B8", usedMsku: "MA", usedFnsku: "F1", origFnsku: "O1", succeededQty: 4, gnrQty: 4, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 3, ledgerIn: 4, ledgerOther: 4 }),
    inMeta: inMeta(4), salesQty: 1, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const m2 = compose({
    agg: agg({ asin: "B8", usedMsku: "MB", usedFnsku: "F2", origFnsku: "O2", succeededQty: 6, gnrQty: 6, lastDate: D("2026-06-05") }),
    ledger: ledger({ ledgerEnding: 6, ledgerIn: 6, ledgerOther: 6 }),
    inMeta: inMeta(6), salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined, today: TODAY,
  });
  const [a] = aggregateAsinRows([m1, m2]);
  assert.equal(a.partialLedger, false);
  assert.equal(a.ledgerCoveredCount, 2);
  assert.equal(a.whBreakdownSuppressed, false);
  assert.equal(a.ledgerEnding, (m1.ledgerEnding ?? 0) + (m2.ledgerEnding ?? 0));
  assert.equal(a.variance, a.ledgerEnding! - a.computedEnding);
  assert.equal(a.ledgerNote, "");
});

test("aggregateAsinRows: title = first non-empty member title (fallback when blank)", () => {
  const blank = compose({
    agg: agg({ asin: "B9", usedMsku: "MA", usedFnsku: "F1", origFnsku: "O1", succeededQty: 1, gnrQty: 1, lastDate: D("2026-06-01") }),
    ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }),
    inMeta: inMeta(1), salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined,
    title: "", // no title on this member
    today: TODAY,
  });
  const titled = compose({
    agg: agg({ asin: "B9", usedMsku: "MB", usedFnsku: "F2", origFnsku: "O2", succeededQty: 1, gnrQty: 1, lastDate: D("2026-06-02") }),
    ledger: ledger({ ledgerEnding: 1, ledgerIn: 1, ledgerOther: 1 }),
    inMeta: inMeta(1), salesQty: 0, returnQty: 0, removalQty: 0,
    reimb: undefined, caseMeta: undefined, adj: undefined,
    title: "Great Widget 500g",
    today: TODAY,
  });
  const [a] = aggregateAsinRows([blank, titled]);
  assert.equal(a.title, "Great Widget 500g"); // falls through the blank member
});
