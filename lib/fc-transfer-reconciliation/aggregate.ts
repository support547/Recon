import type {
  FcActionStatus,
  FcAdjMeta,
  FcAnalysisRow,
  FcCaseMeta,
  FcReconStats,
  FcSummaryRow,
} from "./types";

type FcTransferInput = {
  id: string;
  msku: string | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  quantity: number;
  transferDate: Date | null;
  eventType: string | null;
  fulfillmentCenter: string | null;
  disposition: string | null;
  reason: string | null;
};

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function joinSet(set: Set<string>): string {
  return Array.from(set).filter(Boolean).sort().join(", ");
}

export function aggregateFcSummary(
  rows: FcTransferInput[],
  caseMap: Map<string, FcCaseMeta>,
): FcSummaryRow[] {
  type Acc = {
    msku: string;
    fnsku: string;
    asin: string;
    title: string;
    eventCount: number;
    netQty: number;
    qtyIn: number;
    qtyOut: number;
    eventTypes: Set<string>;
    fcs: Set<string>;
    earliest: Date | null;
    latest: Date | null;
  };
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const msku = s(r.msku);
    const fnsku = s(r.fnsku);
    const asin = s(r.asin);
    if (!msku && !fnsku) continue;
    const key = `${msku}|${fnsku}|${asin}`;
    const prev = map.get(key) ?? {
      msku,
      fnsku,
      asin,
      title: s(r.title),
      eventCount: 0,
      netQty: 0,
      qtyIn: 0,
      qtyOut: 0,
      eventTypes: new Set<string>(),
      fcs: new Set<string>(),
      earliest: null,
      latest: null,
    };
    const qty = r.quantity || 0;
    prev.eventCount++;
    prev.netQty += qty;
    if (qty > 0) prev.qtyIn += qty;
    if (qty < 0) prev.qtyOut += -qty;
    if (r.eventType) prev.eventTypes.add(r.eventType);
    if (r.fulfillmentCenter) prev.fcs.add(r.fulfillmentCenter);
    if (r.transferDate) {
      if (!prev.earliest || r.transferDate < prev.earliest) prev.earliest = r.transferDate;
      if (!prev.latest || r.transferDate > prev.latest) prev.latest = r.transferDate;
    }
    if (!prev.title && r.title) prev.title = r.title;
    map.set(key, prev);
  }
  const out: FcSummaryRow[] = [];
  for (const a of map.values()) {
    const cm = caseMap.get(a.msku);
    out.push({
      msku: a.msku,
      fnsku: a.fnsku,
      asin: a.asin,
      title: a.title,
      eventCount: a.eventCount,
      netQty: a.netQty,
      qtyIn: a.qtyIn,
      qtyOut: a.qtyOut,
      eventTypes: joinSet(a.eventTypes),
      fulfillmentCenters: joinSet(a.fcs),
      earliest: fmtIso(a.earliest),
      latest: fmtIso(a.latest),
      caseCount: cm?.count ?? 0,
      caseStatusTop: cm?.topStatus ?? "No Case",
      caseApprovedQty: cm?.approvedQty ?? 0,
      caseApprovedAmount: cm?.approvedAmount ?? 0,
    });
  }
  out.sort((a, b) => b.eventCount - a.eventCount);
  return out;
}

// Mirrors the SQL CTE in server.js /api/fc-transfer-analysis:
// - day_qty per MSKU per day
// - running_sum cumulatively
// - last date where running_sum hit 0
// - imbalance_start = first date AFTER last zero-cross (or first event)
// - exclude rows where net_qty === 0
export function aggregateFcAnalysis(
  rows: FcTransferInput[],
  caseMap: Map<string, FcCaseMeta>,
  adjMap: Map<string, FcAdjMeta>,
  today: Date = new Date(),
): FcAnalysisRow[] {
  // Group day_qty per MSKU per date
  type Daily = { date: string; dayQty: number; fcs: Set<string> };
  type MskuAcc = {
    msku: string;
    fnsku: string;
    asin: string;
    title: string;
    daily: Map<string, Daily>;
    eventDays: number;
  };
  const accs = new Map<string, MskuAcc>();
  for (const r of rows) {
    const msku = s(r.msku);
    if (!msku) continue;
    const dateIso = fmtIso(r.transferDate);
    if (!dateIso) continue;
    const acc =
      accs.get(msku) ??
      ({
        msku,
        fnsku: s(r.fnsku),
        asin: s(r.asin),
        title: s(r.title),
        daily: new Map<string, Daily>(),
        eventDays: 0,
      } satisfies MskuAcc);
    if (!acc.fnsku && r.fnsku) acc.fnsku = r.fnsku;
    if (!acc.asin && r.asin) acc.asin = r.asin;
    if (!acc.title && r.title) acc.title = r.title;
    const d = acc.daily.get(dateIso) ?? { date: dateIso, dayQty: 0, fcs: new Set<string>() };
    d.dayQty += r.quantity || 0;
    if (r.fulfillmentCenter) d.fcs.add(r.fulfillmentCenter);
    acc.daily.set(dateIso, d);
    accs.set(msku, acc);
  }

  const todayMs = today.getTime();
  const out: FcAnalysisRow[] = [];
  for (const a of accs.values()) {
    const dailyArr = Array.from(a.daily.values()).sort((x, y) => x.date.localeCompare(y.date));
    if (dailyArr.length === 0) continue;

    let running = 0;
    let lastZeroDate: string | null = null;
    let netQty = 0;
    let qtyIn = 0;
    let qtyOut = 0;
    const fcSet = new Set<string>();
    for (const d of dailyArr) {
      running += d.dayQty;
      netQty += d.dayQty;
      if (d.dayQty > 0) qtyIn += d.dayQty;
      if (d.dayQty < 0) qtyOut += -d.dayQty;
      d.fcs.forEach((f) => fcSet.add(f));
      if (running === 0) lastZeroDate = d.date;
    }
    if (netQty === 0) continue;

    // imbalance_start = first event date AFTER lastZeroDate, or first event if never zero
    let imbalanceStart: string | null = null;
    for (const d of dailyArr) {
      if (lastZeroDate === null || d.date > lastZeroDate) {
        imbalanceStart = d.date;
        break;
      }
    }
    if (!imbalanceStart) continue;

    const startMs = new Date(imbalanceStart + "T00:00:00Z").getTime();
    const daysPending = Math.max(0, Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24)));

    let actionStatus: FcActionStatus;
    if (netQty > 0) actionStatus = "excess";
    else if (daysPending > 60) actionStatus = "take-action";
    else actionStatus = "waiting";

    const cm = caseMap.get(a.msku);
    const am = adjMap.get(a.msku);
    const caseApprovedQty = cm?.approvedQty ?? 0;
    const adjQty = am?.qty ?? 0;

    out.push({
      msku: a.msku,
      fnsku: a.fnsku,
      asin: a.asin,
      title: a.title,
      netQty,
      qtyIn,
      qtyOut,
      eventDays: dailyArr.length,
      earliestDate: dailyArr[0].date,
      latestDate: dailyArr[dailyArr.length - 1].date,
      imbalanceStart,
      daysPending,
      actionStatus,
      fcs: joinSet(fcSet),
      caseCount: cm?.count ?? 0,
      caseStatusTop: cm?.topStatus ?? "No Case",
      caseApprovedQty,
      caseApprovedAmount: cm?.approvedAmount ?? 0,
      adjQty,
      effectiveReimbQty: caseApprovedQty + adjQty,
    });
  }

  // Sort: take-action (negative net) first by days desc, then waiting, then excess
  out.sort((a, b) => {
    const pri = (r: FcAnalysisRow) =>
      r.netQty < 0 && r.daysPending > 60 ? 0 : r.netQty < 0 ? 1 : 2;
    const pa = pri(a);
    const pb = pri(b);
    if (pa !== pb) return pa - pb;
    if (a.daysPending !== b.daysPending) return b.daysPending - a.daysPending;
    return Math.abs(b.netQty) - Math.abs(a.netQty);
  });

  return out;
}

export function fcStats(summary: FcSummaryRow[], analysis: FcAnalysisRow[]): FcReconStats {
  let totalQtyIn = 0;
  let totalQtyOut = 0;
  let totalEvents = 0;
  for (const r of summary) {
    totalQtyIn += r.qtyIn;
    totalQtyOut += r.qtyOut;
    totalEvents += r.eventCount;
  }

  let takeActionCount = 0;
  let takeActionQty = 0;
  let waitingCount = 0;
  let waitingQty = 0;
  let excessCount = 0;
  let excessQty = 0;
  for (const a of analysis) {
    const abs = Math.abs(a.netQty);
    if (a.actionStatus === "take-action") {
      takeActionCount++;
      takeActionQty += abs;
    } else if (a.actionStatus === "waiting") {
      waitingCount++;
      waitingQty += abs;
    } else {
      excessCount++;
      excessQty += a.netQty; // positive
    }
  }

  const totalUnresolved = takeActionCount + waitingCount;
  const totalUnresolvedQty = takeActionQty + waitingQty;

  return {
    totalSkus: summary.length,
    totalEvents,
    totalQtyIn,
    totalQtyOut,
    takeActionCount,
    takeActionQty,
    waitingCount,
    waitingQty,
    excessCount,
    excessQty,
    totalUnresolved,
    totalUnresolvedQty,
  };
}
