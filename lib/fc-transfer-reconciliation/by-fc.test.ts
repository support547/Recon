// Run: node --test --experimental-strip-types --experimental-loader ./lib/fc-transfer-reconciliation/ts-ext-resolve.mjs lib/fc-transfer-reconciliation/by-fc.test.ts
// The loader lets the production module's EXTENSIONLESS sibling import
// (by-fc.ts → "./full-recon") resolve under the strip-types runner; the Next
// build requires extensionless (TS5097), so by-fc.ts cannot carry a ".ts" ext.
// Tests for the "By FC" analysis summary. ADDITIVE — does not touch
// full-recon.test.ts. Covers grouping, disposition split, derived metrics, sort
// order, and the DATA-INTEGRITY INVARIANT (per-FC roll-up ties to the raw ledger).
import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateFcByFc, fcByFcStats, fcByFcDetails } from "./by-fc.ts";

type Row = Parameters<typeof aggregateFcByFc>[0][number];

function tx(
  fc: string | null,
  date: string,
  quantity: number,
  disposition: string | null = "SELLABLE",
  opts: { msku?: string; fnsku?: string; asin?: string } = {},
): Row {
  return {
    id: `${fc}-${date}-${quantity}-${disposition}`,
    msku: opts.msku ?? "MSKU-1",
    fnsku: opts.fnsku ?? "X000FN",
    asin: opts.asin ?? "B000AS",
    title: null,
    quantity,
    transferDate: new Date(date + "T00:00:00Z"),
    fulfillmentCenter: fc,
    disposition,
  };
}

// ============================================================================
// Grouping + disposition split + derived metrics.
// ============================================================================
test("groups by FC; out/in disposition split; net/volume/damageIntakePct/mskuCount", () => {
  const rows = [
    // PHX7: out 6 sellable, in 4 sellable + 2 unsellable -> net 0, vol 12.
    tx("PHX7", "2026-02-01", -6, "SELLABLE", { msku: "A" }),
    tx("PHX7", "2026-02-03", +4, "SELLABLE", { msku: "A" }),
    tx("PHX7", "2026-02-04", +2, "CUSTOMER_DAMAGED", { msku: "B" }),
    // LAS2: in 3 sellable only.
    tx("LAS2", "2026-02-02", +3, "SELLABLE", { msku: "A" }),
  ];
  const out = aggregateFcByFc(rows);
  const phx = out.find((r) => r.fc === "PHX7")!;
  const las = out.find((r) => r.fc === "LAS2")!;

  assert.equal(phx.outQty, 6);
  assert.equal(phx.outSellable, 6);
  assert.equal(phx.outUnsellable, 0);
  assert.equal(phx.inQty, 6);
  assert.equal(phx.inSellable, 4);
  assert.equal(phx.inUnsellable, 2);
  assert.equal(phx.netQty, 0, "in 6 - out 6");
  assert.equal(phx.volume, 12, "in 6 + out 6");
  assert.equal(phx.damageIntakePct, 2 / 6, "inUnsellable / inQty");
  assert.equal(phx.mskuCount, 2, "A and B");
  assert.equal(phx.events, 3);

  assert.equal(las.inQty, 3);
  assert.equal(las.outQty, 0);
  assert.equal(las.damageIntakePct, 0, "no unsellable in");
});

// ============================================================================
// UNKNOWN disposition counts in qty totals only (not sellable/unsellable).
// ============================================================================
test("blank disposition -> UNKNOWN: counts in in/outQty + unknownQty only", () => {
  const rows = [
    tx("FC1", "2026-02-01", -4, "SELLABLE"),
    tx("FC1", "2026-02-02", +4, null), // blank disposition in
  ];
  const r = aggregateFcByFc(rows).find((x) => x.fc === "FC1")!;
  assert.equal(r.inQty, 4, "blank still counts in inQty");
  assert.equal(r.inSellable, 0, "blank is not sellable");
  assert.equal(r.inUnsellable, 0, "blank is not unsellable");
  assert.equal(r.unknownQty, 4, "tracked as data-quality");
  assert.equal(r.damageIntakePct, 0, "0 unsellable / 4 in");
});

// ============================================================================
// damageIntakePct === 0 when inQty === 0 (out-only FC, no divide-by-zero).
// ============================================================================
test("out-only FC: inQty 0 -> damageIntakePct 0", () => {
  const rows = [tx("OUTONLY", "2026-02-01", -5, "SELLABLE")];
  const r = aggregateFcByFc(rows).find((x) => x.fc === "OUTONLY")!;
  assert.equal(r.inQty, 0);
  assert.equal(r.damageIntakePct, 0);
  assert.equal(r.volume, 5);
  assert.equal(r.netQty, -5);
});

// ============================================================================
// Skips: no FC, zero qty.
// ============================================================================
test("rows with no FC code or zero qty are skipped", () => {
  const rows = [
    tx(null, "2026-02-01", -5, "SELLABLE"),
    tx("", "2026-02-01", -5, "SELLABLE"),
    tx("FC1", "2026-02-01", 0, "SELLABLE"),
    tx("FC1", "2026-02-02", +2, "SELLABLE"),
  ];
  const out = aggregateFcByFc(rows);
  assert.equal(out.length, 1, "only FC1 with the +2 leg");
  assert.equal(out[0].fc, "FC1");
  assert.equal(out[0].inQty, 2);
  assert.equal(out[0].events, 1, "zero-qty leg not counted");
});

// ============================================================================
// Sort: volume desc, tiebreak |netQty| desc, then FC asc.
// ============================================================================
test("sort: busiest (volume) first; tiebreak |netQty| desc then FC asc", () => {
  const rows = [
    // BIG: volume 20.
    tx("BIG", "2026-02-01", -10, "SELLABLE"),
    tx("BIG", "2026-02-02", +10, "SELLABLE"),
    // SAME-A: volume 8, |net| 8.
    tx("SAME-A", "2026-02-01", -8, "SELLABLE"),
    // SAME-B: volume 8, |net| 0.
    tx("SAME-B", "2026-02-01", -4, "SELLABLE"),
    tx("SAME-B", "2026-02-02", +4, "SELLABLE"),
  ];
  const out = aggregateFcByFc(rows);
  assert.deepEqual(out.map((r) => r.fc), ["BIG", "SAME-A", "SAME-B"]);
});

// ============================================================================
// DATA-INTEGRITY INVARIANT: per-FC roll-up ties to the raw ledger.
// ============================================================================
test("invariant: Σ inQty === total positive; Σ outQty === total |neg|; net === Σ signed", () => {
  const rows = [
    tx("A", "2026-02-01", -6, "SELLABLE", { msku: "m1" }),
    tx("A", "2026-02-02", +4, "CUSTOMER_DAMAGED", { msku: "m1" }),
    tx("B", "2026-02-01", +9, "SELLABLE", { msku: "m2" }),
    tx("B", "2026-02-02", -3, "DEFECTIVE", { msku: "m2" }),
    tx("C", "2026-02-01", +1, null, { msku: "m3" }),
    tx(null, "2026-02-01", -100, "SELLABLE"), // excluded (no FC)
  ];

  const agg = aggregateFcByFc(rows);
  const sumIn = agg.reduce((a, r) => a + r.inQty, 0);
  const sumOut = agg.reduce((a, r) => a + r.outQty, 0);
  const sumNet = agg.reduce((a, r) => a + r.netQty, 0);

  // Raw ledger truth over FC-attributable legs only.
  let rawPos = 0;
  let rawNeg = 0;
  let rawSigned = 0;
  for (const r of rows) {
    if (!(r.fulfillmentCenter ?? "").trim()) continue;
    const q = r.quantity;
    if (q > 0) rawPos += q;
    else if (q < 0) rawNeg += -q;
    rawSigned += q;
  }

  assert.equal(sumIn, rawPos, "Σ inQty === total positive qty");
  assert.equal(sumOut, rawNeg, "Σ outQty === total |negative| qty");
  assert.equal(sumNet, rawSigned, "Σ netQty === total signed qty");

  const stats = fcByFcStats(rows);
  assert.equal(stats.totalIn, rawPos);
  assert.equal(stats.totalOut, rawNeg);
  assert.equal(stats.totalNet, rawSigned);
  assert.equal(stats.totalNet, stats.totalIn - stats.totalOut);
  assert.equal(stats.fcCount, 3, "A, B, C (null FC excluded)");
  assert.equal(stats.busiestFc, "B", "B volume 12 > A 10 > C 1");
  assert.equal(stats.totalDamagedIn, 4, "A inUnsellable 4 (B's unsellable was OUT)");
  assert.equal(stats.unknownDispositionQty, 1, "C's blank +1");
});

// ============================================================================
// fcByFcStats throws if the two groupings disagree (guard is live).
// ============================================================================
test("stats tie-out is enforced (sanity: normal data passes)", () => {
  const rows = [tx("A", "2026-02-01", -3, "SELLABLE"), tx("A", "2026-02-02", +5, "SELLABLE")];
  assert.doesNotThrow(() => fcByFcStats(rows));
  const s = fcByFcStats(rows);
  assert.equal(s.totalIn, 5);
  assert.equal(s.totalOut, 3);
  assert.equal(s.totalNet, 2);
});

// ============================================================================
// Drill-down detail: per-MSKU flow AT THE FC + raw legs.
// ============================================================================
test("details: per-FC MSKU flow scoped to that FC + underlying legs", () => {
  const rows = [
    tx("PHX7", "2026-02-01", -6, "SELLABLE", { msku: "A" }),
    tx("PHX7", "2026-02-03", +2, "SELLABLE", { msku: "A" }),
    tx("PHX7", "2026-02-04", +5, "SELLABLE", { msku: "B" }),
  ];
  const details = fcByFcDetails(rows);
  const phx = details.get("PHX7")!;
  assert.ok(phx, "PHX7 detail exists");
  assert.equal(phx.legs.length, 3);
  const a = phx.mskus.find((m) => m.msku === "A")!;
  const b = phx.mskus.find((m) => m.msku === "B")!;
  assert.equal(a.outQty, 6);
  assert.equal(a.inQty, 2);
  assert.equal(a.netQty, -4, "A at PHX7: in 2 - out 6");
  assert.equal(a.events, 2);
  assert.equal(b.netQty, 5, "B at PHX7: in 5 - out 0");
  // sorted by |netQty| desc: B(5) before A(4).
  assert.deepEqual(phx.mskus.map((m) => m.msku), ["B", "A"]);
});
