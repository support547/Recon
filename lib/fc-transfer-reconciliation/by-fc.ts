// Aggregation for the "By FC" view — an FC-WISE ANALYSIS SUMMARY of the transfer
// ledger. DESCRIPTIVE ONLY: groups the same deletedAt:null, in-range transfer
// rows by fulfillment center and accumulates observable flow metrics. NO status,
// NO actionability, NO coverage, NO episodes, NO FC→FC lanes — every metric is a
// direct roll-up of the raw signed-quantity ledger at a single node (one FC).
//
// The disposition classifier is REUSED from full-recon.ts (imported, not
// re-implemented) so both views agree on SELLABLE / UNSELLABLE / UNKNOWN.

import { classifyDisposition } from "./full-recon";
import type {
  FcByFcDetail,
  FcByFcLegDetail,
  FcByFcMskuDetail,
  FcByFcRow,
  FcByFcStats,
} from "./by-fc-types";

type FcByFcInput = {
  id: string;
  msku: string | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  quantity: number;
  transferDate: Date | null;
  fulfillmentCenter: string | null;
  disposition: string | null;
};

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

type Acc = {
  fc: string;
  outQty: number;
  outSellable: number;
  outUnsellable: number;
  inQty: number;
  inSellable: number;
  inUnsellable: number;
  unknownQty: number;
  events: number;
  mskuSet: Set<string>;
  fnskuSet: Set<string>;
  firstDate: string;
  lastDate: string;
  // per-MSKU flow AT THIS FC (drill-down) + raw legs.
  mskus: Map<string, FcByFcMskuDetail>;
  legs: FcByFcLegDetail[];
};

function newAcc(fc: string): Acc {
  return {
    fc,
    outQty: 0,
    outSellable: 0,
    outUnsellable: 0,
    inQty: 0,
    inSellable: 0,
    inUnsellable: 0,
    unknownQty: 0,
    events: 0,
    mskuSet: new Set<string>(),
    fnskuSet: new Set<string>(),
    firstDate: "",
    lastDate: "",
    mskus: new Map<string, FcByFcMskuDetail>(),
    legs: [],
  };
}

/**
 * Group transfer rows by fulfillment center and accumulate per-FC flow metrics.
 * Each row contributes one signed quantity to exactly one FC: a negative qty is
 * OUT (|qty| added to outQty + the matching sellable/unsellable bucket; UNKNOWN
 * disposition lands in outQty + unknownQty only), a positive qty is IN. Rows
 * with no FC code are skipped (cannot be attributed to a node). `today` is
 * accepted for parity with the full-recon engine but is unused — this view has
 * no aging.
 *
 * Returns rows sorted DESC by volume (busiest FC first), tiebroken by |netQty|
 * desc, then FC code asc for stability.
 */
export function aggregateFcByFc(
  rows: FcByFcInput[],
  _today: Date = new Date(),
): FcByFcRow[] {
  const accs = new Map<string, Acc>();

  for (const r of rows) {
    const fc = s(r.fulfillmentCenter);
    if (!fc) continue; // no node to attribute to
    const qty = r.quantity || 0;
    if (qty === 0) continue; // no flow
    const cls = classifyDisposition(r.disposition);
    const mag = Math.abs(qty);
    const dateIso = fmtIso(r.transferDate);
    const msku = s(r.msku);
    const fnsku = s(r.fnsku);
    const asin = s(r.asin);

    const acc = accs.get(fc) ?? newAcc(fc);

    if (qty < 0) {
      acc.outQty += mag;
      if (cls === "SELLABLE") acc.outSellable += mag;
      else if (cls === "UNSELLABLE") acc.outUnsellable += mag;
      else acc.unknownQty += mag;
    } else {
      acc.inQty += mag;
      if (cls === "SELLABLE") acc.inSellable += mag;
      else if (cls === "UNSELLABLE") acc.inUnsellable += mag;
      else acc.unknownQty += mag;
    }

    acc.events += 1;
    if (msku) acc.mskuSet.add(msku);
    if (fnsku) acc.fnskuSet.add(fnsku);
    if (dateIso) {
      if (!acc.firstDate || dateIso < acc.firstDate) acc.firstDate = dateIso;
      if (!acc.lastDate || dateIso > acc.lastDate) acc.lastDate = dateIso;
    }

    // drill-down: per-MSKU flow at this FC (keyed on the canonical grain).
    const mkey = `${msku}|${fnsku}|${asin}`;
    const md =
      acc.mskus.get(mkey) ??
      ({ msku, fnsku, asin, title: s(r.title), outQty: 0, inQty: 0, netQty: 0, events: 0 } satisfies FcByFcMskuDetail);
    if (!md.title && r.title) md.title = s(r.title);
    if (qty < 0) md.outQty += mag;
    else md.inQty += mag;
    md.netQty = md.inQty - md.outQty;
    md.events += 1;
    acc.mskus.set(mkey, md);

    acc.legs.push({
      date: dateIso,
      msku,
      fnsku,
      asin,
      title: s(r.title),
      signedQty: qty,
      disposition: s(r.disposition),
      cls,
    });

    accs.set(fc, acc);
  }

  const out: FcByFcRow[] = [];
  for (const a of accs.values()) {
    const netQty = a.inQty - a.outQty;
    out.push({
      fc: a.fc,
      outQty: a.outQty,
      outSellable: a.outSellable,
      outUnsellable: a.outUnsellable,
      inQty: a.inQty,
      inSellable: a.inSellable,
      inUnsellable: a.inUnsellable,
      netQty,
      volume: a.inQty + a.outQty,
      damageIntakePct: a.inQty > 0 ? a.inUnsellable / a.inQty : 0,
      mskuCount: a.mskuSet.size,
      fnskuCount: a.fnskuSet.size,
      events: a.events,
      firstDate: a.firstDate,
      lastDate: a.lastDate,
      unknownQty: a.unknownQty,
    });
  }

  // Sort: busiest first (volume desc), tiebreak |netQty| desc, then FC asc.
  out.sort((x, y) => {
    if (y.volume !== x.volume) return y.volume - x.volume;
    const ax = Math.abs(x.netQty);
    const ay = Math.abs(y.netQty);
    if (ay !== ax) return ay - ax;
    return x.fc.localeCompare(y.fc);
  });

  return out;
}

/**
 * Build the per-FC drill-down detail (MSKUs at each FC + raw legs). Returned as a
 * map keyed by FC code so the action can attach it alongside the summary rows.
 * MSKUs are sorted by |netQty| desc then msku asc; legs by date asc then msku.
 */
export function fcByFcDetails(rows: FcByFcInput[]): Map<string, FcByFcDetail> {
  // Re-run the same grouping but keep the per-FC msku map + legs. Cheap: a single
  // pass over rows (mirrors aggregateFcByFc's accumulation, detail only).
  const accs = new Map<string, Acc>();
  for (const r of rows) {
    const fc = s(r.fulfillmentCenter);
    if (!fc) continue;
    const qty = r.quantity || 0;
    if (qty === 0) continue;
    const cls = classifyDisposition(r.disposition);
    const mag = Math.abs(qty);
    const msku = s(r.msku);
    const fnsku = s(r.fnsku);
    const asin = s(r.asin);
    const acc = accs.get(fc) ?? newAcc(fc);
    const mkey = `${msku}|${fnsku}|${asin}`;
    const md =
      acc.mskus.get(mkey) ??
      ({ msku, fnsku, asin, title: s(r.title), outQty: 0, inQty: 0, netQty: 0, events: 0 } satisfies FcByFcMskuDetail);
    if (!md.title && r.title) md.title = s(r.title);
    if (qty < 0) md.outQty += mag;
    else md.inQty += mag;
    md.netQty = md.inQty - md.outQty;
    md.events += 1;
    acc.mskus.set(mkey, md);
    acc.legs.push({
      date: fmtIso(r.transferDate),
      msku,
      fnsku,
      asin,
      title: s(r.title),
      signedQty: qty,
      disposition: s(r.disposition),
      cls,
    });
    accs.set(fc, acc);
  }

  const details = new Map<string, FcByFcDetail>();
  for (const a of accs.values()) {
    const mskus = Array.from(a.mskus.values()).sort((x, y) => {
      const ax = Math.abs(x.netQty);
      const ay = Math.abs(y.netQty);
      if (ay !== ax) return ay - ax;
      return x.msku.localeCompare(y.msku);
    });
    const legs = a.legs
      .slice()
      .sort((x, y) => x.date.localeCompare(y.date) || x.msku.localeCompare(y.msku));
    details.set(a.fc, { fc: a.fc, mskus, legs });
  }
  return details;
}

/**
 * Grand-total stats for the KPI cards. Enforces the DATA-INTEGRITY INVARIANT:
 * the per-FC roll-up must tie back to the raw ledger. We re-derive totalIn /
 * totalOut / totalNet straight from the raw signed quantities AND from the
 * aggregated rows; a mismatch throws loudly (the same rows grouped two ways must
 * agree). Proven by test "by-fc invariant".
 */
export function fcByFcStats(rows: FcByFcInput[]): FcByFcStats {
  const agg = aggregateFcByFc(rows);

  // Raw ledger truth (only FC-attributable, non-zero legs — same filter as the
  // aggregation, so the two groupings are over the identical row set).
  let rawIn = 0;
  let rawOut = 0;
  for (const r of rows) {
    if (!s(r.fulfillmentCenter)) continue;
    const q = r.quantity || 0;
    if (q > 0) rawIn += q;
    else if (q < 0) rawOut += -q;
  }

  let totalIn = 0;
  let totalOut = 0;
  let totalDamagedIn = 0;
  let unknownDispositionQty = 0;
  let busiestFc = "";
  let busiestVol = -1;
  for (const row of agg) {
    totalIn += row.inQty;
    totalOut += row.outQty;
    totalDamagedIn += row.inUnsellable;
    unknownDispositionQty += row.unknownQty;
    if (row.volume > busiestVol) {
      busiestVol = row.volume;
      busiestFc = row.fc;
    }
  }

  // INVARIANT: two groupings of the same rows must agree.
  if (totalIn !== rawIn || totalOut !== rawOut) {
    throw new Error(
      `fcByFcStats: ledger tie-out failed — agg in/out ${totalIn}/${totalOut} != raw ${rawIn}/${rawOut}`,
    );
  }

  return {
    fcCount: agg.length,
    totalIn,
    totalOut,
    totalNet: totalIn - totalOut,
    totalDamagedIn,
    busiestFc,
    unknownDispositionQty,
  };
}
