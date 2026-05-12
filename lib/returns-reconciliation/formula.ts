import { orderFnskuKey, trimStr } from "./matching";
import type {
  AdjMeta,
  CaseMeta,
  FnskuStatusKey,
  ReimbMeta,
  ReturnsReconRow,
  SalesFnskuMeta,
} from "./types";

const EMPTY_REIMB: ReimbMeta = { qty: 0, amount: 0 };
const EMPTY_CASE: CaseMeta = {
  count: 0,
  claimedQty: 0,
  approvedQty: 0,
  approvedAmount: 0,
  caseIds: [],
  topStatus: "No Case",
};
const EMPTY_ADJ: AdjMeta = { qty: 0, count: 0, reasons: [] };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export type ReturnAggregate = {
  orderId: string;
  fnsku: string;
  msku: string;
  asin: string;
  title: string;
  totalReturned: number;
  returnEvents: number;
  dispositions: Set<string>;
  reasons: Set<string>;
  earliestReturn: Date | null;
  latestReturn: Date | null;
};

export function aggregateReturns(
  rows: {
    orderId: string | null;
    fnsku: string | null;
    msku: string | null;
    asin: string | null;
    title: string | null;
    quantity: number;
    disposition: string | null;
    reason: string | null;
    returnDate: Date | null;
  }[],
): ReturnAggregate[] {
  const map = new Map<string, ReturnAggregate>();
  for (const r of rows) {
    const oid = trimStr(r.orderId);
    const fn = trimStr(r.fnsku);
    if (!oid && !fn) continue;
    const key = `${oid}|${fn}`;
    const prev = map.get(key) ?? {
      orderId: oid,
      fnsku: fn,
      msku: trimStr(r.msku),
      asin: trimStr(r.asin),
      title: trimStr(r.title),
      totalReturned: 0,
      returnEvents: 0,
      dispositions: new Set<string>(),
      reasons: new Set<string>(),
      earliestReturn: null,
      latestReturn: null,
    };
    prev.totalReturned += r.quantity || 0;
    prev.returnEvents++;
    if (r.disposition) prev.dispositions.add(r.disposition);
    if (r.reason) prev.reasons.add(r.reason);
    if (r.returnDate) {
      if (!prev.earliestReturn || r.returnDate < prev.earliestReturn) prev.earliestReturn = r.returnDate;
      if (!prev.latestReturn || r.returnDate > prev.latestReturn) prev.latestReturn = r.returnDate;
    }
    if (!prev.msku && r.msku) prev.msku = trimStr(r.msku);
    if (!prev.asin && r.asin) prev.asin = trimStr(r.asin);
    if (!prev.title && r.title) prev.title = trimStr(r.title);
    map.set(key, prev);
  }
  return Array.from(map.values());
}

export function computeReturnRow(input: {
  agg: ReturnAggregate;
  salesMap: Map<string, SalesFnskuMeta>;
  reimbMap: Map<string, ReimbMeta>;
  caseMap: Map<string, CaseMeta>;
  adjMap: Map<string, AdjMeta>;
}): ReturnsReconRow {
  const { agg, salesMap, reimbMap, caseMap, adjMap } = input;
  const salesEntry = salesMap.get(agg.orderId);
  let fnskuStatus: FnskuStatusKey;
  let salesFnsku = "";
  let salesMsku = "";
  if (!salesEntry) {
    fnskuStatus = "ORDER_NOT_FOUND";
  } else {
    salesMsku = salesEntry.msku;
    if (salesEntry.fnskuSet.has(agg.fnsku)) {
      fnskuStatus = "MATCHED_FNSKU";
      salesFnsku = agg.fnsku;
    } else {
      fnskuStatus = "FNSKU_MISMATCH";
      salesFnsku = Array.from(salesEntry.fnskuSet).join(", ");
    }
  }

  const reimb = reimbMap.get(agg.msku) ?? EMPTY_REIMB;
  const caseMeta = caseMap.get(agg.msku) ?? EMPTY_CASE;
  const adj = adjMap.get(orderFnskuKey(agg.orderId, agg.fnsku)) ?? EMPTY_ADJ;

  const dbOrCaseQty = Math.max(reimb.qty, caseMeta.approvedQty);
  const effReimbQty = dbOrCaseQty + adj.qty;
  const effReimbAmount = Math.max(reimb.amount, caseMeta.approvedAmount);

  const isSellable = Array.from(agg.dispositions).some((d) => d.toUpperCase().includes("SELLABLE"));

  return {
    orderId: agg.orderId || "—",
    returnFnsku: agg.fnsku || "—",
    msku: agg.msku || "—",
    asin: agg.asin || "—",
    title: agg.title || "—",
    totalReturned: agg.totalReturned,
    returnEvents: agg.returnEvents,
    dispositions: Array.from(agg.dispositions).join(", "),
    reasons: Array.from(agg.reasons).join(", "),
    reimbQty: reimb.qty,
    reimbAmount: reimb.amount,
    caseReimbQty: caseMeta.approvedQty,
    caseReimbAmount: caseMeta.approvedAmount,
    adjQty: adj.qty,
    effReimbQty,
    effReimbAmount,
    salesFnsku,
    salesMsku,
    fnskuStatus,
    caseCount: caseMeta.count,
    caseStatusTop: caseMeta.topStatus,
    caseIds: caseMeta.caseIds.join(", "),
    earliestReturn: fmtDate(agg.earliestReturn),
    latestReturn: fmtDate(agg.latestReturn),
    isSellable,
  };
}
