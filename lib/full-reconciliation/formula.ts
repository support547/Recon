import type {
  FcStatus,
  FullReconRow,
  FullReconStatus,
  GnrDetail,
  RemovalRcptDetail,
  ReimbDetail,
  ReplStatus,
  ReturnDetail,
  ShipmentDetail,
} from "./types";

export function trimStr(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
}

function n(v: number | null | undefined): number {
  return Number.isFinite(v) ? Number(v) : 0;
}

const REIMB_REASON_FILTER = [
  "lost_warehouse",
  "damaged_outbound",
  "lost_outbound",
  "damaged_warehouse",
  "reimbursement_reversal",
];

function matchesReimbFilter(reason: string | null | undefined): boolean {
  const r = (reason ?? "").toLowerCase();
  return REIMB_REASON_FILTER.some((kw) => r.includes(kw));
}

// ─────────────────────────────────────────────────────────
// Aggregator inputs
// ─────────────────────────────────────────────────────────

export type ShippedRow = {
  fnsku: string | null;
  msku: string;
  title: string | null;
  asin: string | null;
  quantity: number;
  shipmentId: string | null;
  shipDate: Date | null;
};

export type ReceiptRow = {
  fnsku: string | null;
  quantity: number;
  receiptDate: Date | null;
  shipmentId: string | null;
};

export type SaleRow = {
  fnsku: string | null;
  quantity: number;
  saleDate: Date | null;
  productAmount: { toString(): string } | null;
};

export type ReturnRow = {
  fnsku: string | null;
  quantity: number;
  status: string | null;
  disposition: string | null;
  reason: string | null;
  orderId: string | null;
};

export type ReimbRow = {
  fnsku: string | null;
  msku: string | null;
  quantity: number;
  amount: { toString(): string } | null;
  reason: string | null;
  amazonOrderId: string | null;
  caseId: string | null;
};

export type RemovalReceiptRow = {
  fnsku: string | null;
  orderId: string | null;
  receivedQty: number;
  sellableQty: number;
  unsellableQty: number;
  conditionReceived: string | null;
  status: string | null;
  receivedDate: Date | null;
};

export type GnrRow = {
  fnsku: string | null;
  usedMsku: string | null;
  usedFnsku: string | null;
  usedCondition: string | null;
  quantity: number;
  unitStatus: string | null;
};

export type CaseRow = {
  fnsku: string | null;
  status: string | null;
  unitsApproved: number;
  amountApproved: { toString(): string } | null;
};

export type AdjRow = {
  fnsku: string | null;
  qtyAdjusted: number;
};

export type ReplacementRow = {
  msku: string | null;
  quantity: number;
  replacementOrderId: string | null;
  originalOrderId: string | null;
};

export type FcTransferRow = {
  fnsku: string | null;
  quantity: number;
  transferDate: Date | null;
};

export type FbaSummaryRow = {
  fnsku: string | null;
  disposition: string | null;
  endingBalance: number;
  vendorReturns: number;
  found: number;
  lost: number;
  damaged: number;
  disposedQty: number;
  otherEvents: number;
  unknownEvents: number;
  summaryDate: Date | null;
};

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function pushUniq<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

// ─────────────────────────────────────────────────────────
// Per-FNSKU aggregators
// ─────────────────────────────────────────────────────────

type ShippedAgg = {
  msku: string;
  title: string;
  asin: string;
  shippedQty: number;
  statuses: Set<string>;
  details: ShipmentDetail[];
};

export function aggregateShipped(
  rows: ShippedRow[],
  shipStatusMap: Map<string, string>,
  shipmentLatestReceiptMap: Map<string, Date>,
): Map<string, ShippedAgg> {
  const m = new Map<string, ShippedAgg>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    let prev = m.get(fnsku);
    if (!prev) {
      prev = {
        msku: trimStr(r.msku),
        title: trimStr(r.title),
        asin: trimStr(r.asin),
        shippedQty: 0,
        statuses: new Set<string>(),
        details: [],
      };
      m.set(fnsku, prev);
    }
    prev.shippedQty += r.quantity || 0;
    if (!prev.msku && r.msku) prev.msku = trimStr(r.msku);
    if (!prev.title && r.title) prev.title = trimStr(r.title);
    if (!prev.asin && r.asin) prev.asin = trimStr(r.asin);

    const shipmentId = trimStr(r.shipmentId);
    const status = shipmentId ? shipStatusMap.get(shipmentId) ?? "Unknown" : "Unknown";
    prev.statuses.add(status);
    const rcptDate = shipmentId ? shipmentLatestReceiptMap.get(shipmentId) ?? null : null;
    prev.details.push({
      shipmentId,
      shipDate: fmtDate(r.shipDate),
      qty: r.quantity || 0,
      status,
      receiptDate: fmtDate(rcptDate),
    });
  }
  return m;
}

type FnskuQtyDate = { qty: number; latest: Date | null };

export function aggregateByFnskuWithLatest(
  rows: { fnsku: string | null; quantity: number; date: Date | null }[],
): Map<string, FnskuQtyDate> {
  const m = new Map<string, FnskuQtyDate>();
  for (const r of rows) {
    const k = trimStr(r.fnsku);
    if (!k) continue;
    const prev = m.get(k) ?? { qty: 0, latest: null as Date | null };
    prev.qty += r.quantity || 0;
    if (r.date && (!prev.latest || r.date > prev.latest)) prev.latest = r.date;
    m.set(k, prev);
  }
  return m;
}

export function aggregateSalesNonZero(
  rows: SaleRow[],
): Map<string, FnskuQtyDate> {
  // Filter: product_amount != 0
  const filtered = rows.filter((r) => {
    if (!r.productAmount) return false;
    return Number(r.productAmount.toString()) !== 0;
  });
  return aggregateByFnskuWithLatest(
    filtered.map((r) => ({ fnsku: r.fnsku, quantity: r.quantity, date: r.saleDate })),
  );
}

type ReturnAgg = { qty: number; details: ReturnDetail[] };

export function aggregateReturns(rows: ReturnRow[]): Map<string, ReturnAgg> {
  // Group by fnsku+status+disposition+reason, then collect orders
  type GroupBucket = {
    qty: number;
    status: string;
    disp: string;
    reason: string;
    orders: Set<string>;
  };
  const groups = new Map<string, Map<string, GroupBucket>>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    const status = trimStr(r.status) || "—";
    const disp = trimStr(r.disposition) || "—";
    const reason = trimStr(r.reason) || "—";
    const subKey = `${status}|${disp}|${reason}`;
    let outer = groups.get(fnsku);
    if (!outer) {
      outer = new Map<string, GroupBucket>();
      groups.set(fnsku, outer);
    }
    let bucket = outer.get(subKey);
    if (!bucket) {
      bucket = { qty: 0, status, disp, reason, orders: new Set<string>() };
      outer.set(subKey, bucket);
    }
    bucket.qty += r.quantity || 0;
    if (r.orderId) bucket.orders.add(r.orderId);
  }
  const out = new Map<string, ReturnAgg>();
  for (const [fnsku, sub] of groups) {
    const details: ReturnDetail[] = [];
    let total = 0;
    for (const b of sub.values()) {
      total += b.qty;
      details.push({
        qty: b.qty,
        status: b.status,
        disp: b.disp,
        reason: b.reason,
        orders: Array.from(b.orders).join(", "),
      });
    }
    details.sort((a, b) => b.qty - a.qty);
    out.set(fnsku, { qty: total, details });
  }
  return out;
}

type ReimbAgg = { qty: number; amount: number; details: ReimbDetail[] };

export function aggregateReimbursements(rows: ReimbRow[]): Map<string, ReimbAgg> {
  // Filter to Lost/Damaged reasons; group by fnsku+reason+orderId+caseId
  type GroupBucket = {
    qty: number;
    amount: number;
    reason: string;
    orderId: string;
    caseId: string;
  };
  const groups = new Map<string, Map<string, GroupBucket>>();
  for (const r of rows) {
    if (!matchesReimbFilter(r.reason)) continue;
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    const reason = trimStr(r.reason) || "—";
    const orderId = trimStr(r.amazonOrderId) || "—";
    const caseId = trimStr(r.caseId) || "—";
    const subKey = `${reason}|${orderId}|${caseId}`;
    let outer = groups.get(fnsku);
    if (!outer) {
      outer = new Map<string, GroupBucket>();
      groups.set(fnsku, outer);
    }
    let bucket = outer.get(subKey);
    if (!bucket) {
      bucket = { qty: 0, amount: 0, reason, orderId, caseId };
      outer.set(subKey, bucket);
    }
    bucket.qty += r.quantity || 0;
    bucket.amount += r.amount ? Number(r.amount.toString()) : 0;
  }
  const out = new Map<string, ReimbAgg>();
  for (const [fnsku, sub] of groups) {
    const details: ReimbDetail[] = [];
    let totalQty = 0;
    let totalAmt = 0;
    for (const b of sub.values()) {
      totalQty += b.qty;
      totalAmt += b.amount;
      details.push(b);
    }
    details.sort((a, b) => b.qty - a.qty);
    out.set(fnsku, { qty: totalQty, amount: totalAmt, details });
  }
  return out;
}

type RemovalRcptAgg = { qty: number; details: RemovalRcptDetail[] };

export function aggregateRemovalReceipts(rows: RemovalReceiptRow[]): Map<string, RemovalRcptAgg> {
  type GroupBucket = {
    orderId: string;
    qty: number;
    sellable: number;
    unsellable: number;
    condition: string;
    status: string;
    date: Date | null;
  };
  const groups = new Map<string, Map<string, GroupBucket>>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    if ((r.receivedQty ?? 0) <= 0) continue;
    const orderId = trimStr(r.orderId) || "—";
    let outer = groups.get(fnsku);
    if (!outer) {
      outer = new Map<string, GroupBucket>();
      groups.set(fnsku, outer);
    }
    let bucket = outer.get(orderId);
    if (!bucket) {
      bucket = {
        orderId,
        qty: 0, sellable: 0, unsellable: 0,
        condition: "—", status: "—", date: null,
      };
      outer.set(orderId, bucket);
    }
    bucket.qty += r.receivedQty || 0;
    bucket.sellable += r.sellableQty || 0;
    bucket.unsellable += r.unsellableQty || 0;
    if (r.conditionReceived) bucket.condition = r.conditionReceived;
    if (r.status) bucket.status = r.status;
    if (r.receivedDate && (!bucket.date || r.receivedDate > bucket.date)) bucket.date = r.receivedDate;
  }
  const out = new Map<string, RemovalRcptAgg>();
  for (const [fnsku, sub] of groups) {
    const details: RemovalRcptDetail[] = [];
    let total = 0;
    for (const b of sub.values()) {
      total += b.qty;
      details.push({
        orderId: b.orderId,
        qty: b.qty,
        sellable: b.sellable,
        unsellable: b.unsellable,
        condition: b.condition,
        status: b.status,
        date: fmtDate(b.date),
      });
    }
    details.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    out.set(fnsku, { qty: total, details });
  }
  return out;
}

type GnrAgg = {
  qty: number;
  succeeded: number;
  failed: number;
  details: GnrDetail[];
};

export function aggregateGnrByFnsku(rows: GnrRow[]): Map<string, GnrAgg> {
  type GroupBucket = {
    usedMsku: string;
    usedFnsku: string;
    condition: string;
    qty: number;
    succeeded: number;
    failed: number;
  };
  const groups = new Map<string, Map<string, GroupBucket>>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    const usedMsku = trimStr(r.usedMsku) || "—";
    const usedFnsku = trimStr(r.usedFnsku) || "—";
    const condition = trimStr(r.usedCondition) || "—";
    const subKey = `${usedMsku}|${usedFnsku}|${condition}`;
    let outer = groups.get(fnsku);
    if (!outer) {
      outer = new Map<string, GroupBucket>();
      groups.set(fnsku, outer);
    }
    let bucket = outer.get(subKey);
    if (!bucket) {
      bucket = { usedMsku, usedFnsku, condition, qty: 0, succeeded: 0, failed: 0 };
      outer.set(subKey, bucket);
    }
    const q = r.quantity || 0;
    bucket.qty += q;
    const us = (r.unitStatus ?? "").toLowerCase();
    if (us === "succeeded") bucket.succeeded += q;
    else if (us === "failed") bucket.failed += q;
  }
  const out = new Map<string, GnrAgg>();
  for (const [fnsku, sub] of groups) {
    const details: GnrDetail[] = [];
    let total = 0;
    let totalSucc = 0;
    let totalFail = 0;
    for (const b of sub.values()) {
      total += b.qty;
      totalSucc += b.succeeded;
      totalFail += b.failed;
      details.push(b);
    }
    details.sort((a, b) => b.qty - a.qty);
    out.set(fnsku, { qty: total, succeeded: totalSucc, failed: totalFail, details });
  }
  return out;
}

type CaseAgg = {
  count: number;
  statuses: string[];
  reimbQty: number;
  reimbAmt: number;
};

export function aggregateCasesByFnsku(rows: CaseRow[]): Map<string, CaseAgg> {
  const m = new Map<string, CaseAgg>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    let prev = m.get(fnsku);
    if (!prev) {
      prev = { count: 0, statuses: [], reimbQty: 0, reimbAmt: 0 };
      m.set(fnsku, prev);
    }
    prev.count++;
    if (r.status) pushUniq(prev.statuses, r.status);
    prev.reimbQty += r.unitsApproved || 0;
    prev.reimbAmt += r.amountApproved ? Number(r.amountApproved.toString()) : 0;
  }
  return m;
}

type AdjAgg = { qty: number; count: number };

export function aggregateAdjByFnsku(rows: AdjRow[]): Map<string, AdjAgg> {
  const m = new Map<string, AdjAgg>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    const prev = m.get(fnsku) ?? { qty: 0, count: 0 };
    prev.qty += r.qtyAdjusted || 0;
    prev.count++;
    m.set(fnsku, prev);
  }
  return m;
}

type ReplAgg = {
  qty: number;
  returnQty: number;
  reimbQty: number;
  reimbAmt: number;
  status: ReplStatus;
};

export function aggregateReplacementsByMsku(
  rows: ReplacementRow[],
  returnsByMskuOrder: Map<string, number>,
  reimbsByMskuOrder: Map<string, { qty: number; amount: number }>,
): Map<string, ReplAgg> {
  // Per replacement row, look up returns + reimbs by msku+(replOrder OR origOrder)
  const m = new Map<string, ReplAgg>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    if (!msku) continue;
    let prev = m.get(msku);
    if (!prev) {
      prev = { qty: 0, returnQty: 0, reimbQty: 0, reimbAmt: 0, status: "Pending" };
      m.set(msku, prev);
    }
    prev.qty += r.quantity || 0;
    const replOrd = trimStr(r.replacementOrderId);
    const origOrd = trimStr(r.originalOrderId);
    const retByRepl = replOrd ? returnsByMskuOrder.get(`${msku}|${replOrd}`) ?? 0 : 0;
    const retByOrig = origOrd ? returnsByMskuOrder.get(`${msku}|${origOrd}`) ?? 0 : 0;
    prev.returnQty += retByRepl + retByOrig;
    const riByRepl = replOrd ? reimbsByMskuOrder.get(`${msku}|${replOrd}`) : undefined;
    const riByOrig = origOrd ? reimbsByMskuOrder.get(`${msku}|${origOrd}`) : undefined;
    if (riByRepl) { prev.reimbQty += riByRepl.qty; prev.reimbAmt += riByRepl.amount; }
    if (riByOrig) { prev.reimbQty += riByOrig.qty; prev.reimbAmt += riByOrig.amount; }
  }
  // Compute status per msku
  for (const v of m.values()) {
    const covered = v.reimbQty + v.returnQty;
    v.status = covered >= v.qty ? "Covered" : covered > 0 ? "Partial" : "Pending";
  }
  return m;
}

type FcAgg = {
  net: number;
  in: number;
  out: number;
  eventDays: Set<string>;
  earliest: Date | null;
  latest: Date | null;
};

export function aggregateFcByFnsku(rows: FcTransferRow[]): Map<string, FcAgg> {
  const m = new Map<string, FcAgg>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    let prev = m.get(fnsku);
    if (!prev) {
      prev = { net: 0, in: 0, out: 0, eventDays: new Set<string>(), earliest: null, latest: null };
      m.set(fnsku, prev);
    }
    const q = r.quantity || 0;
    prev.net += q;
    if (q > 0) prev.in += q;
    else if (q < 0) prev.out += Math.abs(q);
    if (r.transferDate) {
      prev.eventDays.add(fmtDate(r.transferDate));
      if (!prev.earliest || r.transferDate < prev.earliest) prev.earliest = r.transferDate;
      if (!prev.latest || r.transferDate > prev.latest) prev.latest = r.transferDate;
    }
  }
  return m;
}

function fcStatus(net: number, earliest: Date | null, today: Date): FcStatus {
  if (net === 0) return "Balanced";
  if (net > 0) return "Excess";
  if (earliest) {
    const days = Math.floor((today.getTime() - earliest.getTime()) / (1000 * 86400));
    if (days > 60) return "Take Action";
  }
  return "Waiting";
}

type FbaSummaryAgg = {
  endingBalance: number | null;
  summaryDate: Date | null;
  vendorReturns: number;
  found: number;
  lost: number;
  damaged: number;
  disposed: number;
  other: number;
  unknown: number;
  adjTotal: number;
};

export function aggregateFbaSummary(rows: FbaSummaryRow[]): Map<string, FbaSummaryAgg> {
  // Latest SELLABLE ending balance per FNSKU
  // Sum adjustment events across ALL dispositions
  const m = new Map<string, FbaSummaryAgg>();
  // Step 1: collect latest sellable
  type Latest = { endingBalance: number; summaryDate: Date | null };
  const latestSellable = new Map<string, Latest>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    if ((r.disposition ?? "").toLowerCase() !== "sellable") continue;
    const prev = latestSellable.get(fnsku);
    if (!prev) {
      latestSellable.set(fnsku, { endingBalance: r.endingBalance, summaryDate: r.summaryDate });
      continue;
    }
    const a = prev.summaryDate ? prev.summaryDate.getTime() : -Infinity;
    const b = r.summaryDate ? r.summaryDate.getTime() : -Infinity;
    if (b > a) {
      prev.endingBalance = r.endingBalance;
      prev.summaryDate = r.summaryDate;
    }
  }
  // Step 2: sum all adjustment events across all dispositions
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    let prev = m.get(fnsku);
    if (!prev) {
      prev = {
        endingBalance: null,
        summaryDate: null,
        vendorReturns: 0, found: 0, lost: 0, damaged: 0,
        disposed: 0, other: 0, unknown: 0, adjTotal: 0,
      };
      m.set(fnsku, prev);
    }
    prev.vendorReturns += r.vendorReturns || 0;
    prev.found += r.found || 0;
    prev.lost += r.lost || 0;
    prev.damaged += r.damaged || 0;
    prev.disposed += r.disposedQty || 0;
    prev.other += r.otherEvents || 0;
    prev.unknown += r.unknownEvents || 0;
  }
  for (const [fnsku, agg] of m) {
    agg.adjTotal = agg.vendorReturns + agg.found + agg.lost + agg.damaged
      + agg.disposed + agg.other + agg.unknown;
    const latest = latestSellable.get(fnsku);
    if (latest) {
      agg.endingBalance = latest.endingBalance;
      agg.summaryDate = latest.summaryDate;
    }
  }
  return m;
}

// ─────────────────────────────────────────────────────────
// Helpers for replacement matching
// ─────────────────────────────────────────────────────────

export function buildReturnsByMskuOrder(rows: ReturnRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const fnsku = trimStr(r.fnsku);
    if (!fnsku) continue;
    // We re-derive msku here via passed-in rows; this map only stores qty by msku|order
  }
  return m;
}

export function buildReturnsByMskuOrderFromRows(
  rows: { msku: string | null; orderId: string | null; quantity: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.orderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    m.set(k, (m.get(k) ?? 0) + (r.quantity || 0));
  }
  return m;
}

export function buildReimbsByMskuOrder(
  rows: {
    msku: string | null;
    amazonOrderId: string | null;
    quantity: number;
    amount: { toString(): string } | null;
  }[],
): Map<string, { qty: number; amount: number }> {
  const m = new Map<string, { qty: number; amount: number }>();
  for (const r of rows) {
    const msku = trimStr(r.msku);
    const oid = trimStr(r.amazonOrderId);
    if (!msku || !oid) continue;
    const k = `${msku}|${oid}`;
    const prev = m.get(k) ?? { qty: 0, amount: 0 };
    prev.qty += r.quantity || 0;
    prev.amount += r.amount ? Number(r.amount.toString()) : 0;
    m.set(k, prev);
  }
  return m;
}

// ─────────────────────────────────────────────────────────
// Final row composition
// ─────────────────────────────────────────────────────────

export function computeReconStatus(
  endingBalance: number,
  fbaEnding: number | null,
  reimbQty: number,
): FullReconStatus {
  if (fbaEnding === null) return "No Snapshot";
  const variance = fbaEnding - endingBalance;
  if (variance === 0) return "Matched";
  if (variance > 0) return "Over";
  // variance < 0 → FBA has fewer than calc
  if (reimbQty > 0 && reimbQty >= Math.abs(variance)) return "Reimbursed";
  return "Take Action";
}

export function composeFullReconRow(input: {
  fnsku: string;
  shipped: ShippedAgg;
  receipts: FnskuQtyDate | undefined;
  sales: FnskuQtyDate | undefined;
  returns: ReturnAgg | undefined;
  reimb: ReimbAgg | undefined;
  removalRcpt: RemovalRcptAgg | undefined;
  gnr: GnrAgg | undefined;
  cases: CaseAgg | undefined;
  adj: AdjAgg | undefined;
  repl: ReplAgg | undefined;
  fc: FcAgg | undefined;
  fbaSummary: FbaSummaryAgg | undefined;
  today: Date;
}): FullReconRow {
  const { fnsku, shipped } = input;
  const receiptQty = input.receipts?.qty ?? 0;
  const soldQty = input.sales?.qty ?? 0;
  const returnQty = input.returns?.qty ?? 0;
  const reimbQty = input.reimb?.qty ?? 0;
  const reimbAmt = input.reimb?.amount ?? 0;
  const removalRcptQty = input.removalRcpt?.qty ?? 0;
  const gnrQty = input.gnr?.qty ?? 0;
  const fcNet = input.fc?.net ?? 0;

  const replRet = input.repl?.returnQty ?? 0;
  const replReimb = input.repl?.reimbQty ?? 0;
  const replContrib = replRet > 0 ? replRet : replReimb > 0 ? -replReimb : 0;

  const endingBalance =
    receiptQty - soldQty + returnQty - reimbQty - removalRcptQty + replContrib - gnrQty + fcNet;

  const fbaEnding = input.fbaSummary?.endingBalance ?? null;
  const reconStatus = computeReconStatus(endingBalance, fbaEnding, reimbQty);

  const latestRecv = input.receipts?.latest ?? null;
  const latestSale = input.sales?.latest ?? null;
  const daysRecvToSale =
    latestRecv && latestSale
      ? Math.floor((latestSale.getTime() - latestRecv.getTime()) / (1000 * 86400))
      : null;

  const fcEarliest = input.fc?.earliest ?? null;
  const fcDaysPending = fcEarliest
    ? Math.floor((input.today.getTime() - fcEarliest.getTime()) / (1000 * 86400))
    : 0;

  return {
    fnsku,
    msku: shipped.msku || "",
    title: shipped.title,
    asin: shipped.asin,
    shippedQty: shipped.shippedQty,
    receiptQty,
    shortageQty: shipped.shippedQty - receiptQty,
    soldQty,
    latestRecvDate: fmtDate(latestRecv),
    latestSaleDate: fmtDate(latestSale),
    daysRecvToSale,
    shipmentStatuses: Array.from(shipped.statuses).sort().join(", "),
    shipmentDetails: shipped.details.sort((a, b) => b.shipDate.localeCompare(a.shipDate)),
    returnQty,
    returnDetails: input.returns?.details ?? [],
    reimbQty,
    reimbAmt,
    reimbDetails: input.reimb?.details ?? [],
    removalRcptQty,
    removalRcptDetails: input.removalRcpt?.details ?? [],
    gnrQty,
    gnrSucceeded: input.gnr?.succeeded ?? 0,
    gnrFailed: input.gnr?.failed ?? 0,
    gnrDetails: input.gnr?.details ?? [],
    caseCount: input.cases?.count ?? 0,
    caseStatuses: (input.cases?.statuses ?? []).join(", "),
    caseReimbQty: input.cases?.reimbQty ?? 0,
    caseReimbAmt: input.cases?.reimbAmt ?? 0,
    adjQty: input.adj?.qty ?? 0,
    adjCount: input.adj?.count ?? 0,
    replQty: input.repl?.qty ?? 0,
    replReturnQty: replRet,
    replReimbQty: replReimb,
    replReimbAmt: input.repl?.reimbAmt ?? 0,
    replStatus: input.repl?.status ?? "",
    fcNetQty: fcNet,
    fcInQty: input.fc?.in ?? 0,
    fcOutQty: input.fc?.out ?? 0,
    fcEventDays: input.fc?.eventDays.size ?? 0,
    fcEarliestDate: fmtDate(input.fc?.earliest ?? null),
    fcLatestDate: fmtDate(input.fc?.latest ?? null),
    fcDaysPending,
    fcStatus: input.fc ? fcStatus(fcNet, fcEarliest, input.today) : "",
    fbaEndingBalance: fbaEnding,
    fbaSummaryDate: fmtDate(input.fbaSummary?.summaryDate ?? null),
    fbaVendorReturns: input.fbaSummary?.vendorReturns ?? 0,
    fbaFound: input.fbaSummary?.found ?? 0,
    fbaLost: input.fbaSummary?.lost ?? 0,
    fbaDamaged: input.fbaSummary?.damaged ?? 0,
    fbaDisposed: input.fbaSummary?.disposed ?? 0,
    fbaOther: input.fbaSummary?.other ?? 0,
    fbaUnknown: input.fbaSummary?.unknown ?? 0,
    fbaAdjTotal: input.fbaSummary?.adjTotal ?? 0,
    endingBalance,
    reconStatus,
  };
}

// silence unused
void n;
