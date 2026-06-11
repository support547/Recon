// Aggregation engine for the "Full Reconciliation" tab — the sole FC-transfer
// reconciliation engine. Building blocks: per-day running-sum + episode-reset,
// canonical msku|fnsku|asin grain, and a dated case/adjustment coverage overlay.
//
// Matching strategy: FNSKU EPISODE MODEL (not Reference-ID). The real data has
// 0% out↔in referenceId linkage (every referenceId is null), so there is no
// per-transfer pairing to recover. Episodes are derived per canonical listing via
// the running-sum zero-cross, and OUT/IN are broken down by disposition class
// within the open episode. The drill-down still groups legs by referenceId when
// present (guarded), degrading to a flat per-episode leg list with today's data.

import type {
  FcAdjMeta,
  FcCaseMeta,
} from "./types";
import type {
  FcFullReconRow,
  FcFullStats,
  FcFullStatus,
  FcTransferGroup,
  FcTransferLegDetail,
} from "./full-recon-types";

// DAMAGED_IN_TRANSIT is a confirmed loss (units came back unsellable), so it is
// actionable IMMEDIATELY with no aging window. Flip this constant to require the
// same 60-day window as SHORTAGE if business ever wants degradation to age first.
export const DAMAGED_REQUIRES_AGING = false;

// TIME TRIGGER: units that went OUT and have not come back IN age into a SHORTAGE
// once the episode is OLDER THAN this many days; within the window they are
// IN_TRANSIT (not actionable). Boundary is strict ">" — exactly 55 days is still
// IN_TRANSIT, 56+ is SHORTAGE.
const SHORTAGE_WINDOW_DAYS = 55;

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
  referenceId?: string | null;
};

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

// Canonical reconciliation grain: msku|fnsku|asin. Duplicated locally (kept in
// sync with fcCanonKey() in matching.ts) so this module has no value-import
// coupling to a sibling .ts — type-only sibling imports stay erasable under the
// node --experimental-strip-types test loader, matching aggregate.ts.
function fcCanonKey(
  msku: string | null | undefined,
  fnsku: string | null | undefined,
  asin: string | null | undefined,
): string {
  return `${s(msku)}|${s(fnsku)}|${s(asin)}`;
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function joinSet(set: Set<string>): string {
  return Array.from(set).filter(Boolean).sort().join(", ");
}

/** Disposition classifier (avoids the substring trap):
 *  - SELLABLE  iff  uppercased+trimmed === "SELLABLE"  AND does NOT contain "UNSELLABLE".
 *  - blank/null -> UNKNOWN (counts in totalNet, NOT in sellableNet; tracked via a
 *    data-quality counter).
 *  - everything else (CUSTOMER_DAMAGED, DEFECTIVE, future damage codes) -> UNSELLABLE.
 *  Real data today: SELLABLE, CUSTOMER_DAMAGED, DEFECTIVE; zero blanks. */
export function classifyDisposition(
  disposition: string | null | undefined,
): "SELLABLE" | "UNSELLABLE" | "UNKNOWN" {
  const d = s(disposition).toUpperCase();
  if (d === "") return "UNKNOWN";
  // Defensive: an exact "SELLABLE" never contains "UNSELLABLE", but guard anyway
  // so a hypothetical "SELLABLE_UNSELLABLE"-style value can't slip through.
  if (d === "SELLABLE" && !d.includes("UNSELLABLE")) return "SELLABLE";
  return "UNSELLABLE";
}

type Leg = {
  date: string;
  signedQty: number;
  fc: string;
  disposition: string;
  cls: "SELLABLE" | "UNSELLABLE" | "UNKNOWN";
  referenceId: string;
};

type GroupAcc = {
  msku: string;
  fnsku: string;
  asin: string;
  title: string;
  legs: Leg[];
};

/** Build the per-episode drill-down groups. If any leg carries a referenceId,
 *  group by it (out+in of a real transfer). Otherwise (today's data) emit a
 *  single synthetic group holding all the episode's legs in date order. */
function buildGroups(legs: Leg[]): FcTransferGroup[] {
  const haveRefs = legs.some((l) => l.referenceId !== "");
  const toDetail = (l: Leg): FcTransferLegDetail => ({
    date: l.date,
    referenceId: l.referenceId,
    fc: l.fc,
    signedQty: l.signedQty,
    disposition: l.disposition,
    cls: l.cls,
  });
  const makeGroup = (refId: string, gl: Leg[]): FcTransferGroup => {
    let outQty = 0;
    let inQty = 0;
    const fromFcs = new Set<string>();
    const toFcs = new Set<string>();
    for (const l of gl) {
      if (l.signedQty < 0) {
        outQty += -l.signedQty;
        if (l.fc) fromFcs.add(l.fc);
      } else if (l.signedQty > 0) {
        inQty += l.signedQty;
        if (l.fc) toFcs.add(l.fc);
      }
    }
    return {
      referenceId: refId,
      fromFc: joinSet(fromFcs),
      toFc: joinSet(toFcs),
      outQty,
      inQty,
      variance: inQty - outQty,
      legs: gl.slice().sort((a, b) => a.date.localeCompare(b.date)).map(toDetail),
    };
  };

  if (!haveRefs) {
    return [makeGroup("", legs)];
  }
  // Reference-ID linkage path (guarded; lights up automatically if refIds populate).
  const byRef = new Map<string, Leg[]>();
  for (const l of legs) {
    const k = l.referenceId || "(unlinked)";
    const arr = byRef.get(k) ?? [];
    arr.push(l);
    byRef.set(k, arr);
  }
  const groups: FcTransferGroup[] = [];
  for (const [refId, gl] of byRef) {
    groups.push(makeGroup(refId === "(unlinked)" ? "" : refId, gl));
  }
  // Sort groups by their earliest leg date for a stable drill-down.
  groups.sort((a, b) =>
    (a.legs[0]?.date ?? "").localeCompare(b.legs[0]?.date ?? ""),
  );
  return groups;
}

export function aggregateFcFullRecon(
  rows: FcTransferInput[],
  caseMap: Map<string, FcCaseMeta>,
  adjMap: Map<string, FcAdjMeta>,
  today: Date = new Date(),
): FcFullReconRow[] {
  // --- Collect raw legs per canonical listing (Problem-2 grain). ---
  const accs = new Map<string, GroupAcc>();
  for (const r of rows) {
    const msku = s(r.msku);
    if (!msku) continue;
    const dateIso = fmtIso(r.transferDate);
    if (!dateIso) continue;
    const key = fcCanonKey(r.msku, r.fnsku, r.asin);
    const acc =
      accs.get(key) ??
      ({
        msku,
        fnsku: s(r.fnsku),
        asin: s(r.asin),
        title: s(r.title),
        legs: [] as Leg[],
      } satisfies GroupAcc);
    if (!acc.title && r.title) acc.title = s(r.title);
    acc.legs.push({
      date: dateIso,
      signedQty: r.quantity || 0,
      fc: s(r.fulfillmentCenter),
      disposition: s(r.disposition),
      cls: classifyDisposition(r.disposition),
      referenceId: s(r.referenceId),
    });
    accs.set(key, acc);
  }

  // --- Dated coverage overlay (mirror of aggregate.ts Problem-1, keyed per
  //     canonical listing + per-MSKU fallback pool). Coverage offsets BOTH the
  //     net quantity shortage AND the sellable shortfall (degradation), oldest
  //     loss first, clamped, no double-count. ---
  type DailyCov = Map<string, number>; // dateIso -> coverage qty
  const datedCovByKey = new Map<string, DailyCov>();
  const undatedCovByKey = new Map<string, number>();
  const fallbackCovByMsku = new Map<string, number>();
  const addCoverage = (
    msku: string,
    key: string,
    hasFullKey: boolean,
    qty: number,
    date: Date | null,
  ) => {
    if (qty <= 0) return;
    const acc = hasFullKey ? accs.get(key) : undefined;
    if (!acc) {
      fallbackCovByMsku.set(msku, (fallbackCovByMsku.get(msku) ?? 0) + qty);
      return;
    }
    const iso = fmtIso(date);
    if (!iso) {
      undatedCovByKey.set(key, (undatedCovByKey.get(key) ?? 0) + qty);
      return;
    }
    const m = datedCovByKey.get(key) ?? new Map<string, number>();
    m.set(iso, (m.get(iso) ?? 0) + qty);
    datedCovByKey.set(key, m);
  };
  for (const [key, cm] of caseMap) {
    const hasFullKey = cm.fnsku !== "" && cm.asin !== "";
    for (const rec of cm.records) addCoverage(cm.msku, key, hasFullKey, rec.qty, rec.date);
  }
  for (const [key, am] of adjMap) {
    const hasFullKey = am.fnsku !== "" && am.asin !== "";
    for (const rec of am.records) addCoverage(am.msku, key, hasFullKey, rec.qty, rec.date);
  }

  const todayMs = today.getTime();

  // --- PASS 1: per listing, find the open episode via the running sum over the
  //     MERGED (transfer + dated coverage) timeline, then break OUT/IN down by
  //     disposition within the open episode. ---
  type Pending = {
    acc: GroupAcc;
    key: string;
    episodeLegs: Leg[];
    netQty: number; // raw episode transfer net (signed)
    outQty: number;
    outSellable: number;
    outUnsellable: number;
    inQty: number;
    inSellable: number;
    inUnsellable: number;
    unknownQty: number;
    imbalanceStart: string;
    daysPending: number;
    episodeTransfer: number; // signed net of episode transfers
    appliedCoverage: number;
    openShortage: number; // open net-shortage units after coverage (quantity)
    openDegradation: number; // open degradation units after coverage
  };
  const pendings: Pending[] = [];

  for (const [key, a] of accs) {
    // Daily transfer net + daily dated coverage, by date.
    const dailyTransfer = new Map<string, number>();
    for (const l of a.legs) {
      dailyTransfer.set(l.date, (dailyTransfer.get(l.date) ?? 0) + l.signedQty);
    }
    const datedCov = datedCovByKey.get(key) ?? new Map<string, number>();
    const allDates = new Set<string>([...dailyTransfer.keys(), ...datedCov.keys()]);
    const dates = Array.from(allDates).sort((x, y) => x.localeCompare(y));
    if (dates.length === 0) continue;

    // running sum over merged timeline -> last zero-cross.
    let running = 0;
    let lastZeroDate: string | null = null;
    let netQtyAll = 0;
    for (const d of dates) {
      const t = dailyTransfer.get(d) ?? 0;
      const c = datedCov.get(d) ?? 0;
      running += t + c;
      netQtyAll += t;
      if (running === 0) lastZeroDate = d;
    }
    const undatedCoverage = undatedCovByKey.get(key) ?? 0;
    const hasFallback = (fallbackCovByMsku.get(a.msku) ?? 0) > 0;

    // imbalance_start = first TRANSFER date after the last zero-cross (anchor on a
    // transfer, not coverage, so a fully-covered episode still surfaces).
    const firstTransferAfter = (cutoff: string | null): string | null => {
      for (const d of dates) {
        if ((cutoff === null || d > cutoff) && (dailyTransfer.get(d) ?? 0) !== 0) return d;
      }
      return null;
    };
    let imbalanceStart = firstTransferAfter(lastZeroDate);
    if (!imbalanceStart && lastZeroDate !== null) {
      let prevZero: string | null = null;
      let run = 0;
      for (const d of dates) {
        if (d >= lastZeroDate) break;
        run += (dailyTransfer.get(d) ?? 0) + (datedCov.get(d) ?? 0);
        if (run === 0) prevZero = d;
      }
      imbalanceStart = firstTransferAfter(prevZero);
    }
    if (!imbalanceStart) {
      // No open episode (genuine zero with no leftover coverage to report).
      if (netQtyAll === 0 && undatedCoverage === 0 && !hasFallback) continue;
      // else fall through with the whole timeline as the episode.
      imbalanceStart = dates[0];
    }

    // Episode legs = transfer legs on/after imbalanceStart.
    const episodeLegs = a.legs.filter((l) => l.date >= imbalanceStart!);

    // OUT/IN disposition breakdown within the episode.
    let outQty = 0,
      outSellable = 0,
      outUnsellable = 0,
      inQty = 0,
      inSellable = 0,
      inUnsellable = 0,
      unknownQty = 0;
    let episodeTransfer = 0;
    for (const l of episodeLegs) {
      episodeTransfer += l.signedQty;
      const mag = Math.abs(l.signedQty);
      if (l.cls === "UNKNOWN") unknownQty += mag; // data-quality; counts in net, not in sellable
      if (l.signedQty < 0) {
        outQty += mag;
        if (l.cls === "SELLABLE") outSellable += mag;
        else if (l.cls === "UNSELLABLE") outUnsellable += mag;
      } else if (l.signedQty > 0) {
        inQty += mag;
        if (l.cls === "SELLABLE") inSellable += mag;
        else if (l.cls === "UNSELLABLE") inUnsellable += mag;
      }
    }

    const netQty = inQty - outQty; // == episodeTransfer
    const quantityShortage = Math.max(0, -netQty);
    const sellableShortfall = Math.max(0, outSellable - inSellable);
    // DISPOSITION TRIGGER (economically correct): a degradation loss exists only
    // when SELLABLE units went OUT and came back IN as UNSELLABLE. It is therefore
    // bounded by inUnsellable (units that actually returned unsellable) AND by the
    // sellable shortfall (sellable that was not replaced by sellable). A blank/
    // UNKNOWN-disposition return is NOT a confirmed unsellable return, so it does
    // not count here. An unsellable-out that returns unsellable contributes 0
    // sellableShortfall, so it is correctly NOT flagged. Triggers on >= 1 unit.
    const degradationQty = Math.min(inUnsellable, sellableShortfall);

    // Episode dated coverage total (for clamping).
    let episodeDatedCoverage = 0;
    for (const [d, c] of datedCov) {
      if (d >= imbalanceStart!) episodeDatedCoverage += c;
    }

    // Total "open loss" this episode = quantity shortage + degradation. Coverage
    // settles oldest exposure; we apply it to the combined open and split back.
    const grossOpen = quantityShortage + degradationQty;
    let appliedCoverage = 0;
    let openShortage = quantityShortage;
    let openDegradation = degradationQty;
    if (grossOpen > 0) {
      const datedApplied = Math.min(grossOpen, episodeDatedCoverage);
      const afterDated = grossOpen - datedApplied;
      const undatedApplied = Math.min(afterDated, undatedCoverage);
      appliedCoverage = datedApplied + undatedApplied;
      // Apply coverage to quantity-shortage first, then degradation.
      let remaining = appliedCoverage;
      const shortApplied = Math.min(openShortage, remaining);
      openShortage -= shortApplied;
      remaining -= shortApplied;
      openDegradation -= Math.min(openDegradation, remaining);
    }

    const startMs = new Date(imbalanceStart + "T00:00:00Z").getTime();
    const daysPending = Math.max(0, Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24)));

    pendings.push({
      acc: a,
      key,
      episodeLegs,
      netQty,
      outQty,
      outSellable,
      outUnsellable,
      inQty,
      inSellable,
      inUnsellable,
      unknownQty,
      imbalanceStart,
      daysPending,
      episodeTransfer,
      appliedCoverage,
      openShortage,
      openDegradation,
    });
  }

  // --- PASS 2: distribute each MSKU's fallback coverage pool across its still-open
  //     listings, oldest imbalance first, clamped (mirrors aggregate.ts). ---
  const byMsku = new Map<string, Pending[]>();
  for (const p of pendings) {
    const list = byMsku.get(p.acc.msku) ?? [];
    list.push(p);
    byMsku.set(p.acc.msku, list);
  }
  for (const [msku, list] of byMsku) {
    let pool = fallbackCovByMsku.get(msku) ?? 0;
    if (pool <= 0) continue;
    const open = list
      .filter((p) => p.openShortage + p.openDegradation > 0)
      .sort((x, y) => x.imbalanceStart.localeCompare(y.imbalanceStart));
    for (const p of open) {
      if (pool <= 0) break;
      // shortage first, then degradation.
      const shortApplied = Math.min(p.openShortage, pool);
      p.openShortage -= shortApplied;
      pool -= shortApplied;
      p.appliedCoverage += shortApplied;
      if (pool <= 0) break;
      const degApplied = Math.min(p.openDegradation, pool);
      p.openDegradation -= degApplied;
      pool -= degApplied;
      p.appliedCoverage += degApplied;
    }
  }

  // --- FINALIZE: status + actionable + drill-down groups. ---
  const out: FcFullReconRow[] = [];
  for (const p of pendings) {
    const a = p.acc;
    const cm = caseMap.get(p.key);
    const am = adjMap.get(p.key);

    const netQty = p.netQty;
    const quantityShortage = Math.max(0, -netQty);
    const sellableShortfall = Math.max(0, p.outSellable - p.inSellable);
    // Same economically-correct degradation measure as PASS 1: sellable-out that
    // returned unsellable, bounded by inUnsellable and the sellable shortfall.
    const degradationQty = Math.min(p.inUnsellable, sellableShortfall);

    const openQty = p.openShortage + p.openDegradation;
    const reimbursedFully = (quantityShortage + degradationQty) > 0 && openQty === 0;

    const caseOpenCount = cm?.openCount ?? 0;
    const adjQty = am?.qty ?? 0;

    // in-transit: open net shortage units still inside the SHORTAGE window.
    const aged = p.daysPending > SHORTAGE_WINDOW_DAYS;
    const inTransitPending = !aged ? p.openShortage : 0;

    // ---- STATUS derivation: quantity + disposition + age + coverage. ----
    let status: FcFullStatus;
    let actionable = false;
    // A genuinely-pending case (Open / In Progress / Pending) blocks re-raising.
    // A Resolved/Closed/Rejected case is NOT pending — its coverage is already
    // modelled via the reimbursement overlay, so it must not mask a fresh loss
    // in a later episode (episode-reset semantics).
    const topPending =
      cm != null &&
      (cm.topStatus === "Open" ||
        cm.topStatus === "In Progress" ||
        cm.topStatus === "Pending");
    if (reimbursedFully) {
      // settled via coverage. Distinguish adjustment-only vs reimbursement.
      const reimbApproved = (cm?.approvedQty ?? 0) > 0;
      status = reimbApproved ? "REIMBURSED" : adjQty > 0 ? "ADJUSTED" : "REIMBURSED";
    } else if (topPending && openQty > 0) {
      status = "CASE_OPEN";
      actionable = false; // a case is already pending — watch, not raise.
    } else {
      const hasDamage = p.openDegradation > 0;
      const hasShortage = p.openShortage > 0;
      if (hasShortage && hasDamage) {
        status = "SHORTAGE_AND_DAMAGED";
        // Damaged portion is a confirmed loss -> actionable now (unless gated by
        // DAMAGED_REQUIRES_AGING). Either way, an aged shortage is also actionable.
        actionable = DAMAGED_REQUIRES_AGING ? aged : true;
      } else if (hasDamage) {
        status = "DAMAGED_IN_TRANSIT";
        actionable = DAMAGED_REQUIRES_AGING ? aged : true; // confirmed loss -> act now
      } else if (hasShortage) {
        if (aged) {
          status = "SHORTAGE";
          actionable = true;
        } else {
          status = "IN_TRANSIT";
          actionable = false;
        }
      } else if (netQty > 0) {
        status = "EXCESS";
        actionable = false;
      } else {
        status = "RECONCILED";
        actionable = false;
      }
    }

    // FC routing as COUNTS: distinct OUT FCs (legs going out) and distinct IN FCs
    // (legs coming in) for this episode. The full code list stays in the modal.
    const outFcSet = new Set<string>();
    const inFcSet = new Set<string>();
    for (const l of p.episodeLegs) {
      if (!l.fc) continue;
      if (l.signedQty < 0) outFcSet.add(l.fc);
      else if (l.signedQty > 0) inFcSet.add(l.fc);
    }

    out.push({
      msku: a.msku,
      fnsku: a.fnsku,
      asin: a.asin,
      title: a.title,
      fromFcCount: outFcSet.size,
      toFcCount: inFcSet.size,
      outQty: p.outQty,
      outSellable: p.outSellable,
      outUnsellable: p.outUnsellable,
      inQty: p.inQty,
      inSellable: p.inSellable,
      inUnsellable: p.inUnsellable,
      netQty,
      sellableShortfall,
      quantityShortage,
      degradationQty,
      inTransitPending,
      daysPending: p.daysPending,
      imbalanceStart: p.imbalanceStart,
      effectiveReimbQty: p.appliedCoverage,
      caseCount: cm?.count ?? 0,
      caseOpenCount,
      caseStatusTop: cm?.topStatus ?? "No Case",
      caseApprovedQty: cm?.approvedQty ?? 0,
      caseApprovedAmount: cm?.approvedAmount ?? 0,
      adjQty,
      openQty,
      status,
      actionable,
      unknownDispositionQty: p.unknownQty,
      groups: buildGroups(p.episodeLegs),
    });
  }

  // Sort: actionable first (damaged before aged-shortage), then by days desc.
  const statusPri = (st: FcFullStatus): number => {
    switch (st) {
      case "DAMAGED_IN_TRANSIT":
        return 0;
      case "SHORTAGE_AND_DAMAGED":
        return 1;
      case "SHORTAGE":
        return 2;
      case "CASE_OPEN":
        return 3;
      case "IN_TRANSIT":
        return 4;
      case "EXCESS":
        return 5;
      case "ADJUSTED":
        return 6;
      case "REIMBURSED":
        return 7;
      case "RECONCILED":
        return 8;
    }
  };
  out.sort((x, y) => {
    const px = statusPri(x.status);
    const py = statusPri(y.status);
    if (px !== py) return px - py;
    if (x.daysPending !== y.daysPending) return y.daysPending - x.daysPending;
    return y.openQty - x.openQty;
  });

  return out;
}

/**
 * Build the KPI-card stats as a COMPLETE PARTITION of rows by status: every row
 * lands in exactly one of the 9 count buckets, and their sum === totalGroups ===
 * rows.length (asserted by test "partition invariant"). The switch is exhaustive
 * over FcFullStatus — an unmapped status throws loudly so adding a status later
 * forces a bucket decision instead of silently dropping rows.
 *
 * Cards reflect the FULL result set; pass the pre-status-filter rows here. The
 * status-filter dropdown only filters the table, never these stats.
 */
export function fcFullStats(rows: FcFullReconRow[]): FcFullStats {
  let reconciledCount = 0;
  let inTransitCount = 0,
    inTransitQty = 0;
  let shortageCount = 0,
    shortageQty = 0;
  let damagedCount = 0,
    damagedQty = 0;
  let shortageDamagedCount = 0,
    shortageDamagedQty = 0;
  let excessCount = 0,
    excessQty = 0;
  let caseOpenCount = 0,
    caseOpenQty = 0;
  let reimbursedCount = 0,
    reimbursedQty = 0;
  let adjustedCount = 0,
    adjustedQty = 0;
  let unknownDispositionQty = 0;
  const mskus = new Set<string>();

  for (const r of rows) {
    unknownDispositionQty += r.unknownDispositionQty;
    if (r.msku) mskus.add(r.msku);
    // EXACTLY ONE bucket per row. Exhaustive over FcFullStatus.
    switch (r.status) {
      case "RECONCILED":
        reconciledCount++;
        break;
      case "IN_TRANSIT":
        inTransitCount++;
        inTransitQty += r.inTransitPending || r.openQty;
        break;
      case "SHORTAGE":
        shortageCount++;
        shortageQty += r.openQty;
        break;
      case "DAMAGED_IN_TRANSIT":
        damagedCount++;
        damagedQty += r.degradationQty || r.openQty;
        break;
      case "SHORTAGE_AND_DAMAGED":
        // Its OWN bucket — never added to shortage or damaged.
        shortageDamagedCount++;
        shortageDamagedQty += r.openQty;
        break;
      case "EXCESS":
        excessCount++;
        excessQty += r.netQty; // positive surplus
        break;
      case "CASE_OPEN":
        caseOpenCount++;
        caseOpenQty += r.openQty; // open units under the case
        break;
      case "REIMBURSED":
        reimbursedCount++;
        reimbursedQty += r.effectiveReimbQty; // covered units
        break;
      case "ADJUSTED":
        adjustedCount++;
        adjustedQty += r.effectiveReimbQty; // covered units
        break;
      default: {
        // Exhaustiveness guard: an unmapped status is a compile-time error (never
        // type) and a loud runtime throw, so no row can fall through uncounted.
        const _exhaustive: never = r.status;
        throw new Error(`fcFullStats: unmapped FcFullStatus "${String(_exhaustive)}"`);
      }
    }
  }

  // Derived rollup — open / in-progress buckets. NOT part of the partition sum.
  const totalUnresolvedCount =
    inTransitCount + shortageCount + damagedCount + shortageDamagedCount + caseOpenCount;
  const totalUnresolvedQty =
    inTransitQty + shortageQty + damagedQty + shortageDamagedQty + caseOpenQty;

  return {
    totalGroups: rows.length,
    reconciledCount,
    inTransitCount,
    inTransitQty,
    shortageCount,
    shortageQty,
    damagedCount,
    damagedQty,
    shortageDamagedCount,
    shortageDamagedQty,
    excessCount,
    excessQty,
    caseOpenCount,
    caseOpenQty,
    reimbursedCount,
    reimbursedQty,
    adjustedCount,
    adjustedQty,
    totalUnresolvedCount,
    totalUnresolvedQty,
    distinctMskuCount: mskus.size,
    unknownDispositionQty,
  };
}

/**
 * DISPLAY-ONLY consolidation of the 9-bucket partition into the 6 KPI cards.
 * Pure derivation over FcFullStats — does NOT change fcFullStats or the data
 * layer. The status-filter dropdown stays granular (all 9 statuses).
 *
 * Display-grouping invariant (proven by test):
 *   reconciled + inTransit + takeActionCount + excess + resolvedCount
 *   === totalGroups   (the Total card itself is excluded from the sum)
 *
 * TAKE ACTION  = shortage + damaged + shortageDamaged   (open, must-act buckets)
 * RESOLVED     = caseOpen + reimbursed + adjusted        (caseOpen is in-progress,
 *                surfaced distinctly via caseOpenCount so the label isn't misleading)
 */
export function fcFullCardGroups(s: FcFullStats) {
  const takeActionCount = s.shortageCount + s.damagedCount + s.shortageDamagedCount;
  const takeActionQty = s.shortageQty + s.damagedQty + s.shortageDamagedQty;
  const resolvedCount = s.caseOpenCount + s.reimbursedCount + s.adjustedCount;
  const resolvedQty = s.caseOpenQty + s.reimbursedQty + s.adjustedQty;
  return {
    totalGroups: s.totalGroups,
    reconciledCount: s.reconciledCount,
    inTransitCount: s.inTransitCount,
    inTransitQty: s.inTransitQty,
    takeActionCount,
    takeActionQty,
    excessCount: s.excessCount,
    excessQty: s.excessQty,
    resolvedCount,
    resolvedQty,
    // sub-breakdowns kept for the in-card detail lines
    shortageCount: s.shortageCount,
    damagedCount: s.damagedCount,
    shortageDamagedCount: s.shortageDamagedCount,
    caseOpenCount: s.caseOpenCount,
    reimbursedCount: s.reimbursedCount,
    adjustedCount: s.adjustedCount,
  };
}
