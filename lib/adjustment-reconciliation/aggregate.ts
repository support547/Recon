import {
  AUTO_REIMB_GRACE_DAYS,
  CLAIM_EXPIRY_DAYS,
  decisionString,
  getClaimTag,
  getReasonLabel,
  isAmazonTrackedLossCode,
  isLedgerDisplayCode,
  isQAsLoss,
  isSelfTrackedLossCode,
  isTransferOutCode,
  reimbReasonBucket,
} from "./formula";

import type {
  AdjAdjMeta,
  AdjAnalysisRow,
  AdjCaseMeta,
  AdjClaimType,
  AdjCoverageType,
  AdjCoveredByDetail,
  AdjDecision,
  AdjEventDecision,
  AdjEventRow,
  AdjLedgerReimbDetail,
  AdjLedgerRow,
  AdjLogRow,
  AdjPivotGroupBy,
  AdjPivotResult,
  AdjPivotRow,
  AdjPivotStatus,
  AdjReconStats,
  AdjReimbBuckets,
  AdjReimbDetail,
  AdjStatus,
} from "./types";

type AdjInput = {
  id: string;
  adjDate: Date | null;
  fnsku: string | null;
  msku: string | null;
  asin: string | null;
  title: string | null;
  quantity: number;
  reason: string | null;
  disposition: string | null;
  fulfillmentCenter: string | null;
  reconciledQty: number;
  unreconciledQty: number;
  referenceId: string | null;
  store: string | null;
};

function s(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function up(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

function statusRank(s: AdjStatus): number {
  switch (s) {
    case "take-action":
      return 3;
    case "waiting":
      return 2;
    case "grade-resell":
      return 1;
    case "reconciled":
      return 0;
  }
}

// --- Internal pool unit representations ---

// One available unit of Found-by-FC credit (code F, reconciledQty=1).
type FoundUnit = {
  id: string;
  date: Date | null;
  dateIso: string;
  msku: string;
  fc: string;
  disposition: string;
  referenceId: string;
  consumed: boolean;
};

// One available unit of a Lost/Damaged warehouse reimbursement.
type ReimbUnit = {
  reimbId: string;
  caseId: string;
  reason: string;
  msku: string;
  approvalDate: Date | null;
  approvalIso: string;
  amountPerUnit: number;
  qtyCashShareRatio: number; // qtyCash / (qtyCash+qtyInventory); 0..1
  remaining: number;
  consumed: number;
};

// One P credit available to pair with a Q debit.
type PCredit = {
  id: string;
  dateIso: string;
  msku: string;
  fc: string;
  disposition: string;
  referenceId: string;
  consumed: boolean;
};

// 3 (transfer in) credit waiting to pair with a 4 debit.
type ThreeCredit = {
  id: string;
  msku: string;
  asin: string;
  date: string;
  fc: string;
  disposition: string;
  referenceId: string;
  qty: number;
  remaining: number;
};

function buildPools(
  rows: AdjInput[],
  reimbMap: Map<string, AdjReimbBuckets>,
): {
  foundByMskuFc: Map<string, FoundUnit[]>;
  pByKey: Map<string, PCredit[]>; // msku|date|fc
  threesByAsinDate: Map<string, ThreeCredit[]>;
  lwBySku: Map<string, ReimbUnit[]>;
  dwBySku: Map<string, ReimbUnit[]>;
} {
  const foundByMskuFc = new Map<string, FoundUnit[]>();
  const pByKey = new Map<string, PCredit[]>();
  const threesByAsinDate = new Map<string, ThreeCredit[]>();
  const lwBySku = new Map<string, ReimbUnit[]>();
  const dwBySku = new Map<string, ReimbUnit[]>();

  // F credits: one unit per reconciledQty>0.
  for (const r of rows) {
    if (up(r.reason) !== "F") continue;
    const msku = s(r.msku);
    if (!msku) continue;
    const fc = s(r.fulfillmentCenter);
    const units = Math.max(0, r.reconciledQty || 0);
    if (units <= 0) continue;
    const arr = foundByMskuFc.get(`${msku}|${fc}`) ?? [];
    const dateIso = fmtIso(r.adjDate);
    const refId = s(r.referenceId);
    const disposition = s(r.disposition);
    for (let i = 0; i < units; i++) {
      arr.push({
        id: `${r.id}#${i}`,
        date: r.adjDate,
        dateIso,
        msku,
        fc,
        disposition,
        referenceId: refId,
        consumed: false,
      });
    }
    foundByMskuFc.set(`${msku}|${fc}`, arr);
  }
  // Sort each F bucket date asc.
  for (const arr of foundByMskuFc.values()) {
    arr.sort(
      (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
    );
  }

  // P credits: one per qty unit.
  for (const r of rows) {
    if (up(r.reason) !== "P") continue;
    const msku = s(r.msku);
    if (!msku) continue;
    const fc = s(r.fulfillmentCenter);
    const dateIso = fmtIso(r.adjDate);
    const key = `${msku}|${dateIso}|${fc}`;
    const arr = pByKey.get(key) ?? [];
    const units = Math.abs(r.quantity || 0);
    const refId = s(r.referenceId);
    const disposition = s(r.disposition);
    for (let i = 0; i < units; i++) {
      arr.push({
        id: `${r.id}#${i}`,
        dateIso,
        msku,
        fc,
        disposition,
        referenceId: refId,
        consumed: false,
      });
    }
    pByKey.set(key, arr);
  }

  // 3 credits: aggregate by asin+date.
  for (const r of rows) {
    if (up(r.reason) !== "3") continue;
    const asin = s(r.asin);
    const date = fmtIso(r.adjDate);
    if (!asin || !date) continue;
    const key = `${asin}|${date}`;
    const arr = threesByAsinDate.get(key) ?? [];
    arr.push({
      id: r.id,
      msku: s(r.msku),
      asin,
      date,
      fc: s(r.fulfillmentCenter),
      disposition: s(r.disposition),
      referenceId: s(r.referenceId),
      qty: Math.abs(r.quantity || 0),
      remaining: Math.abs(r.quantity || 0),
    });
    threesByAsinDate.set(key, arr);
  }

  // LW + DW reimb pools — explode per unit so FIFO per unit matches debits.
  for (const [msku, buckets] of reimbMap) {
    const lwSrcRows: AdjReimbDetail[] = [];
    const dwSrcRows: AdjReimbDetail[] = [];
    for (const d of buckets.details) {
      if (d.isReversal) continue; // reversal pool tracked separately if needed
      const bucket = reimbReasonBucket(d.reason);
      if (bucket === "lost") lwSrcRows.push(d);
      else if (bucket === "damaged") dwSrcRows.push(d);
    }
    const toUnits = (src: AdjReimbDetail[]): ReimbUnit[] => {
      const units: ReimbUnit[] = [];
      const sorted = [...src].sort((a, b) =>
        a.approvalDate < b.approvalDate ? -1 : a.approvalDate > b.approvalDate ? 1 : 0,
      );
      for (const d of sorted) {
        const totalQty = Math.max(0, d.qtyCash + d.qtyInventory);
        if (totalQty <= 0) continue;
        const perUnit = totalQty > 0 ? d.amount / totalQty : 0;
        const cashShare = totalQty > 0 ? d.qtyCash / totalQty : 0;
        units.push({
          msku,
          qtyCashShareRatio: cashShare,
          reimbId: d.reimbId,
          caseId: d.caseId,
          reason: d.reason,
          approvalDate: d.approvalDate ? new Date(d.approvalDate) : null,
          approvalIso: d.approvalDate,
          amountPerUnit: perUnit,
          remaining: totalQty,
          consumed: 0,
        });
      }
      return units;
    };
    if (lwSrcRows.length > 0) lwBySku.set(msku, toUnits(lwSrcRows));
    if (dwSrcRows.length > 0) dwBySku.set(msku, toUnits(dwSrcRows));
  }

  return { foundByMskuFc, pByKey, threesByAsinDate, lwBySku, dwBySku };
}

// Pull one unit from F pool; mark consumed and return its id.
function consumeFound(
  foundByMskuFc: Map<string, FoundUnit[]>,
  msku: string,
  fc: string,
): FoundUnit | null {
  const arr = foundByMskuFc.get(`${msku}|${fc}`);
  if (!arr) return null;
  for (const u of arr) {
    if (!u.consumed) {
      u.consumed = true;
      return u;
    }
  }
  return null;
}

// Pull one unit from P pool.
function consumeP(
  pByKey: Map<string, PCredit[]>,
  msku: string,
  date: string,
  fc: string,
): PCredit | null {
  const arr = pByKey.get(`${msku}|${date}|${fc}`);
  if (!arr) return null;
  for (const u of arr) {
    if (!u.consumed) {
      u.consumed = true;
      return u;
    }
  }
  return null;
}

// Pull qty units from a 3 credit on the same ASIN+date. Returns the matched
// credit's full metadata so the ledger row can show what paired with it.
function consumeThree(
  threesByAsinDate: Map<string, ThreeCredit[]>,
  asin: string,
  date: string,
  needed: number,
): {
  msku: string;
  refId: string;
  fc: string;
  disposition: string;
  dateIso: string;
  took: number;
} | null {
  const arr = threesByAsinDate.get(`${asin}|${date}`);
  if (!arr) return null;
  for (const t of arr) {
    if (t.remaining <= 0) continue;
    const take = Math.min(t.remaining, needed);
    if (take <= 0) continue;
    t.remaining -= take;
    return {
      msku: t.msku,
      refId: t.id,
      fc: t.fc,
      disposition: t.disposition,
      dateIso: t.date,
      took: take,
    };
  }
  return null;
}

// Pull up to `needed` units from a reimb pool. Returns the per-unit detail
// objects so the ledger row can list which reimbs covered it.
function consumeReimb(
  pool: ReimbUnit[] | undefined,
  needed: number,
): {
  details: AdjLedgerReimbDetail[];
  takenQty: number;
  takenAmount: number;
  takenCashQty: number;
  msku: string;
} {
  const details: AdjLedgerReimbDetail[] = [];
  let remaining = needed;
  let takenAmount = 0;
  let takenQty = 0;
  let takenCashQty = 0;
  let msku = "";
  if (!pool) return { details, takenQty, takenAmount, takenCashQty, msku };
  for (const u of pool) {
    if (remaining <= 0) break;
    if (u.remaining <= 0) continue;
    const take = Math.min(u.remaining, remaining);
    u.remaining -= take;
    u.consumed += take;
    const amt = u.amountPerUnit * take;
    const cashQty = u.qtyCashShareRatio * take;
    takenAmount += amt;
    takenQty += take;
    takenCashQty += cashQty;
    remaining -= take;
    if (!msku) msku = u.msku;
    details.push({
      approvalDate: u.approvalIso,
      reimbId: u.reimbId,
      caseId: u.caseId,
      reason: u.reason,
      qty: take,
      qtyCash: cashQty,
      amount: amt,
    });
  }
  return { details, takenQty, takenAmount, takenCashQty, msku };
}

// Manual-tracked coverage pools per MSKU (case approved + manualAdj qty).
type ManualCovPools = { caseQty: number; manualQty: number };

function consumeManual(
  pools: ManualCovPools,
  needed: number,
): { caseTook: number; manualTook: number; remaining: number } {
  let remaining = needed;
  const caseTook = Math.min(pools.caseQty, remaining);
  pools.caseQty -= caseTook;
  remaining -= caseTook;
  const manualTook = Math.min(pools.manualQty, remaining);
  pools.manualQty -= manualTook;
  remaining -= manualTook;
  return { caseTook, manualTook, remaining };
}

export function buildAdjLedgerRows(
  rows: AdjInput[],
  caseMap: Map<string, AdjCaseMeta>,
  adjMap: Map<string, AdjAdjMeta>,
  reimbMap: Map<string, AdjReimbBuckets>,
  today: Date = new Date(),
): AdjLedgerRow[] {
  const pools = buildPools(rows, reimbMap);

  // Collect debit rows + sort: by reason group, then date asc (FIFO).
  const debits: AdjInput[] = [];
  for (const r of rows) {
    const code = up(r.reason);
    if (!isLedgerDisplayCode(code)) continue;
    if (!s(r.msku)) continue;
    debits.push(r);
  }
  // Group order for matching: M/E first (they hold settled status), then D/G/O,
  // then Q (WAREHOUSE_DAMAGED competes with E for damaged reimb), then 4.
  const groupOrder: Record<string, number> = {
    M: 0,
    E: 1,
    D: 2,
    G: 3,
    O: 4,
    Q: 5,
    "4": 6,
  };
  debits.sort((a, b) => {
    const ga = groupOrder[up(a.reason)] ?? 99;
    const gb = groupOrder[up(b.reason)] ?? 99;
    if (ga !== gb) return ga - gb;
    return (a.adjDate?.getTime() ?? 0) - (b.adjDate?.getTime() ?? 0);
  });

  // Manual pools per MSKU (case+manual adjustment) — pre-load once.
  const manualPoolsByMsku = new Map<string, ManualCovPools>();
  const getManualPools = (msku: string): ManualCovPools => {
    let p = manualPoolsByMsku.get(msku);
    if (!p) {
      p = {
        caseQty: Math.max(0, caseMap.get(msku)?.approvedQty ?? 0),
        manualQty: Math.max(0, adjMap.get(msku)?.qty ?? 0),
      };
      manualPoolsByMsku.set(msku, p);
    }
    return p;
  };

  const ledger: AdjLedgerRow[] = [];

  for (const r of debits) {
    const code = up(r.reason);
    const msku = s(r.msku);
    const fc = s(r.fulfillmentCenter);
    const disposition = s(r.disposition);
    const date = fmtIso(r.adjDate);
    const qtySigned = -Math.abs(r.quantity || 0); // always negative display
    const need = Math.abs(r.quantity || 0);
    const daysSince = r.adjDate ? daysBetween(today, r.adjDate) : 0;

    let coverageType: AdjCoverageType = "open";
    let coveredQty = 0;
    let coveredAmount = 0;
    let reimbDetails: AdjLedgerReimbDetail[] = [];
    let coveredByDetails: AdjCoveredByDetail[] = [];
    let reimbQty = 0;
    let pairedRefId = "";
    let pairedMsku = "";
    let actionStatus: AdjStatus = "take-action";

    // Helper: aggregate consumed F units into coveredByDetails rows.
    const pushFoundDetails = (units: FoundUnit[]): void => {
      // Collapse units sharing date|msku|fc|disposition|refId.
      const byKey = new Map<string, AdjCoveredByDetail>();
      for (const u of units) {
        const k = `${u.dateIso}|${u.msku}|${u.fc}|${u.disposition}|${u.referenceId}`;
        const prev = byKey.get(k);
        if (prev) {
          prev.qty += 1;
        } else {
          byKey.set(k, {
            code: "F",
            date: u.dateIso,
            msku: u.msku,
            qty: 1,
            fc: u.fc || "—",
            disposition: u.disposition || "—",
            referenceId: u.referenceId,
            type: "found",
          });
        }
      }
      for (const d of byKey.values()) coveredByDetails.push(d);
    };

    const pushReimbDetails = (
      details: AdjLedgerReimbDetail[],
      rmMsku: string,
      bucketCode: "LW" | "DW",
    ): void => {
      for (const d of details) {
        coveredByDetails.push({
          code: bucketCode,
          date: d.approvalDate,
          msku: rmMsku || msku,
          qty: d.qtyCash,
          fc: "—",
          disposition: "—",
          referenceId: d.reimbId,
          type: "reimb",
        });
      }
    };

    const pushPDetails = (units: PCredit[]): void => {
      const byKey = new Map<string, AdjCoveredByDetail>();
      for (const u of units) {
        const k = `${u.dateIso}|${u.msku}|${u.fc}|${u.disposition}|${u.referenceId}`;
        const prev = byKey.get(k);
        if (prev) {
          prev.qty += 1;
        } else {
          byKey.set(k, {
            code: "P",
            date: u.dateIso,
            msku: u.msku,
            qty: 1,
            fc: u.fc || "—",
            disposition: u.disposition || "—",
            referenceId: u.referenceId,
            type: "dispo",
          });
        }
      }
      for (const d of byKey.values()) coveredByDetails.push(d);
    };

    if (code === "M") {
      const foundUnits: FoundUnit[] = [];
      while (foundUnits.length < need) {
        const u = consumeFound(pools.foundByMskuFc, msku, fc);
        if (!u) break;
        foundUnits.push(u);
      }
      const foundTook = foundUnits.length;
      if (foundTook >= need) {
        coverageType = "found";
        coveredQty = foundTook;
        actionStatus = "reconciled";
        pushFoundDetails(foundUnits);
      } else if (foundTook > 0) {
        const rest = need - foundTook;
        const { details, takenQty, takenAmount, takenCashQty, msku: rmMsku } =
          consumeReimb(pools.lwBySku.get(msku), rest);
        pushFoundDetails(foundUnits);
        reimbDetails = details;
        reimbQty = takenCashQty;
        coveredAmount = takenAmount;
        if (takenQty + foundTook >= need) {
          coverageType = "reimbursed";
          coveredQty = takenQty + foundTook;
          actionStatus = "reconciled";
        } else {
          coverageType = "partial";
          coveredQty = takenQty + foundTook;
          actionStatus = "take-action";
        }
        if (details.length > 0) pushReimbDetails(details, rmMsku, "LW");
      } else {
        const { details, takenQty, takenAmount, takenCashQty, msku: rmMsku } =
          consumeReimb(pools.lwBySku.get(msku), need);
        reimbDetails = details;
        reimbQty = takenCashQty;
        coveredAmount = takenAmount;
        if (takenQty >= need) {
          coverageType = "reimbursed";
          coveredQty = takenQty;
          actionStatus = "reconciled";
          pushReimbDetails(details, rmMsku, "LW");
        } else if (takenQty > 0) {
          coverageType = "partial";
          coveredQty = takenQty;
          actionStatus = "take-action";
          pushReimbDetails(details, rmMsku, "LW");
        } else {
          coverageType = "open";
          actionStatus = daysSince <= AUTO_REIMB_GRACE_DAYS ? "waiting" : "take-action";
        }
      }
    } else if (code === "E") {
      const { details, takenQty, takenAmount, takenCashQty, msku: rmMsku } =
        consumeReimb(pools.dwBySku.get(msku), need);
      reimbDetails = details;
      reimbQty = takenCashQty;
      coveredAmount = takenAmount;
      if (takenQty >= need) {
        coverageType = "reimbursed";
        coveredQty = takenQty;
        actionStatus = "reconciled";
        pushReimbDetails(details, rmMsku, "DW");
      } else if (takenQty > 0) {
        coverageType = "partial";
        coveredQty = takenQty;
        actionStatus = "take-action";
        pushReimbDetails(details, rmMsku, "DW");
      } else {
        coverageType = "open";
        actionStatus = daysSince <= AUTO_REIMB_GRACE_DAYS ? "waiting" : "take-action";
      }
    } else if (code === "Q") {
      if (isQAsLoss(code, disposition)) {
        const { details, takenQty, takenAmount, takenCashQty, msku: rmMsku } =
          consumeReimb(pools.dwBySku.get(msku), need);
        reimbDetails = details;
        reimbQty = takenCashQty;
        coveredAmount = takenAmount;
        if (takenQty >= need) {
          coverageType = "reimbursed";
          coveredQty = takenQty;
          actionStatus = "reconciled";
          pushReimbDetails(details, rmMsku, "DW");
        } else if (takenQty > 0) {
          coverageType = "partial";
          coveredQty = takenQty;
          actionStatus = "take-action";
          pushReimbDetails(details, rmMsku, "DW");
        } else {
          coverageType = "open";
          actionStatus = "take-action";
        }
      } else {
        const pUnits: PCredit[] = [];
        while (pUnits.length < need) {
          const p = consumeP(pools.pByKey, msku, date, fc);
          if (!p) break;
          pUnits.push(p);
        }
        if (pUnits.length >= need) {
          coverageType = "disposition-change";
          coveredQty = pUnits.length;
          actionStatus = "reconciled";
          pushPDetails(pUnits);
        } else {
          coverageType = "open";
          actionStatus = "take-action";
        }
      }
    } else if (code === "4") {
      const asin = s(r.asin);
      let taken = 0;
      let firstMatch: { msku: string; refId: string } | null = null;
      const grHits: { msku: string; refId: string; fc: string; disposition: string; dateIso: string; took: number }[] = [];
      while (taken < need) {
        const m = consumeThree(pools.threesByAsinDate, asin, date, need - taken);
        if (!m) break;
        if (!firstMatch) firstMatch = { msku: m.msku, refId: m.refId };
        grHits.push(m);
        taken += m.took;
      }
      if (taken >= need && firstMatch) {
        coverageType = "grade-resell";
        coveredQty = taken;
        pairedMsku = firstMatch.msku;
        pairedRefId = firstMatch.refId;
        actionStatus = "grade-resell";
        for (const m of grHits) {
          coveredByDetails.push({
            code: "3",
            date: m.dateIso,
            msku: m.msku,
            qty: m.took,
            fc: m.fc || "—",
            disposition: m.disposition || "—",
            referenceId: m.refId,
            type: "gr",
          });
        }
      } else {
        coverageType = "open";
        actionStatus = "take-action";
      }
    } else if (
      code === "D" ||
      code === "G" ||
      code === "O"
    ) {
      const pools2 = getManualPools(msku);
      const { caseTook, manualTook, remaining } = consumeManual(pools2, need);
      const covered = caseTook + manualTook;
      if (remaining === 0 && covered > 0) {
        coverageType = caseTook >= manualTook ? "case" : "manual-adj";
        coveredQty = covered;
        actionStatus = "reconciled";
      } else if (covered > 0) {
        coverageType = "partial";
        coveredQty = covered;
        actionStatus = "take-action";
      } else {
        coverageType = "open";
        actionStatus = "take-action";
      }
      if (caseTook > 0) {
        const caseIds = caseMap.get(msku)?.caseIds ?? [];
        coveredByDetails.push({
          code: "CA",
          date: date,
          msku,
          qty: caseTook,
          fc: "—",
          disposition: "—",
          referenceId: caseIds[0] ?? "",
          type: "case",
        });
      }
      if (manualTook > 0) {
        coveredByDetails.push({
          code: "MA",
          date: date,
          msku,
          qty: manualTook,
          fc: "—",
          disposition: "—",
          referenceId: "",
          type: "manual",
        });
      }
    }

    const decision = decisionString({
      code,
      disposition,
      coverageType,
      ageDays: daysSince,
    });

    const cmRow = caseMap.get(msku);
    const amRow = adjMap.get(msku);
    ledger.push({
      id: r.id,
      adjDate: date,
      msku,
      fnsku: s(r.fnsku),
      asin: s(r.asin),
      title: s(r.title),
      referenceId: s(r.referenceId),
      fulfillmentCenter: fc,
      disposition,
      reason: code,
      reasonLabel: getReasonLabel(code),
      qty: qtySigned,
      coverageType,
      coveredQty,
      coveredAmount,
      reimbDetails,
      reimbQty,
      coveredByDetails,
      pairedRefId,
      pairedMsku,
      actionStatus,
      decision,
      daysSinceEvent: daysSince,
      caseCount: cmRow?.count ?? 0,
      caseClaimedQty: cmRow?.claimedQty ?? 0,
      caseApprovedQty: cmRow?.approvedQty ?? 0,
      caseApprovedAmount: cmRow?.approvedAmount ?? 0,
      caseTopStatus: cmRow?.topStatus ?? "",
      caseIds: (cmRow?.caseIds ?? []).join(", "),
      caseReasons: "",
      manualAdjQty: amRow?.qty ?? 0,
      manualAdjCount: amRow?.count ?? 0,
      manualAdjReasons: (amRow?.reasons ?? []).join(", "),
    });
  }

  return ledger;
}

// Roll the ledger up into per-MSKU rows that drive KPI cards.
export function buildAdjMskuRows(
  ledger: AdjLedgerRow[],
  caseMap: Map<string, AdjCaseMeta>,
  adjMap: Map<string, AdjAdjMeta>,
  reimbMap: Map<string, AdjReimbBuckets>,
  today: Date = new Date(),
): AdjAnalysisRow[] {
  const byMsku = new Map<string, AdjLedgerRow[]>();
  for (const l of ledger) {
    const arr = byMsku.get(l.msku) ?? [];
    arr.push(l);
    byMsku.set(l.msku, arr);
  }

  const out: AdjAnalysisRow[] = [];
  for (const [msku, list] of byMsku) {
    const cm = caseMap.get(msku);
    const am = adjMap.get(msku);
    const rm = reimbMap.get(msku);

    let fnsku = "";
    let asin = "";
    let title = "";
    for (const l of list) {
      if (!fnsku) fnsku = l.fnsku;
      if (!asin) asin = l.asin;
      if (!title) title = l.title;
    }

    let lossQty = 0;
    let misplacedQty = 0;
    let damagedQty = 0;
    let inboundLostQty = 0;
    let reconciledQty = 0;
    let unreconciledQty = 0;
    let foundQty = 0;
    let foundMatchedQty = 0;
    const foundFreeQty = 0;
    const reversalQty = 0;
    let oldestLoss: Date | null = null;
    let latestLoss: Date | null = null;
    let oldestUnreconciled: Date | null = null;
    let sawLost = false;
    let sawDamaged = false;
    let netClaimableQty = 0;
    let openLost = 0;
    let openDamaged = 0;

    for (const l of list) {
      const absQty = Math.abs(l.qty);
      if (l.reason === "M") {
        misplacedQty += absQty;
        lossQty += absQty;
        sawLost = true;
        if (l.coverageType === "reimbursed" || l.coverageType === "found") {
          reconciledQty += absQty;
          if (l.coverageType === "found") foundQty += absQty;
          if (l.coverageType === "found") foundMatchedQty += absQty;
        } else {
          unreconciledQty += l.actionStatus === "reconciled" ? 0 : absQty - l.coveredQty;
          openLost += absQty - l.coveredQty;
          netClaimableQty += absQty - l.coveredQty;
        }
      } else if (l.reason === "E") {
        damagedQty += absQty;
        lossQty += absQty;
        sawDamaged = true;
        if (l.coverageType === "reimbursed") {
          reconciledQty += absQty;
        } else {
          unreconciledQty += absQty - l.coveredQty;
          openDamaged += absQty - l.coveredQty;
          netClaimableQty += absQty - l.coveredQty;
        }
      } else if (l.reason === "D" || l.reason === "G" || l.reason === "O") {
        lossQty += absQty;
      } else if (l.reason === "Q" && l.coverageType === "open") {
        // unpaired Q or open WH-DAMAGED — counts as open issue
        netClaimableQty += absQty - l.coveredQty;
      }
      const ld = l.adjDate ? new Date(l.adjDate) : null;
      if (ld && !Number.isNaN(ld.getTime())) {
        if (!oldestLoss || ld < oldestLoss) oldestLoss = ld;
        if (!latestLoss || ld > latestLoss) latestLoss = ld;
        if (l.actionStatus !== "reconciled" && (!oldestUnreconciled || ld < oldestUnreconciled)) {
          oldestUnreconciled = ld;
        }
      }
    }

    let worst: AdjStatus = "reconciled";
    for (const l of list) {
      if (statusRank(l.actionStatus) > statusRank(worst)) worst = l.actionStatus;
    }
    const allGr = list.every((l) => l.reason === "4");
    if (allGr && list.length > 0) worst = "grade-resell";

    // Decision rollup as eventDecisions for the legacy hover.
    const eventDecisions: AdjEventDecision[] = list.map((l) => ({
      code: l.reason,
      date: l.adjDate,
      qty: l.qty,
      decision: coverageToDecision(l.coverageType),
      status: l.actionStatus,
      coveredBy: l.decision,
    }));

    const lostReimbQty = rm?.lostQty ?? 0;
    const damagedReimbQty = rm?.damagedQty ?? 0;
    const reimbQty = rm?.qty ?? 0;
    const reimbAmount = rm?.amount ?? 0;
    const preLostReimbQty = Math.max(0, rm?.preLostQty ?? 0);
    const preDamagedReimbQty = Math.max(0, rm?.preDamagedQty ?? 0);
    const postLostReimbQty = Math.max(0, rm?.postLostQty ?? 0);
    const postDamagedReimbQty = Math.max(0, rm?.postDamagedQty ?? 0);
    const caseApprovedQty = cm?.approvedQty ?? 0;
    const adjQty = am?.qty ?? 0;
    const effectiveReimbQty = caseApprovedQty + adjQty + reimbQty;

    const daysPending = oldestUnreconciled ? daysBetween(today, oldestUnreconciled) : 0;

    let claimType: AdjClaimType = "None";
    if (sawLost && sawDamaged) claimType = "Mixed";
    else if (sawLost) claimType = "Lost_Warehouse";
    else if (sawDamaged) claimType = "Damaged_Warehouse";

    let deadlineAnchor: Date | null = null;
    for (const l of list) {
      if (l.actionStatus === "reconciled" || l.actionStatus === "grade-resell") continue;
      const ld = l.adjDate ? new Date(l.adjDate) : null;
      if (!ld || Number.isNaN(ld.getTime())) continue;
      if (!deadlineAnchor || ld < deadlineAnchor) deadlineAnchor = ld;
    }
    let claimDeadline = "";
    let daysToDeadline = 0;
    if (deadlineAnchor) {
      const dl = new Date(deadlineAnchor);
      dl.setDate(dl.getDate() + CLAIM_EXPIRY_DAYS);
      claimDeadline = fmtIso(dl);
      daysToDeadline = Math.floor(
        (dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    out.push({
      msku,
      fnsku,
      asin,
      title,
      lossQty,
      misplacedQty,
      damagedQty,
      reconciledQty,
      unreconciledQty,
      claimType,
      foundQty,
      reversalQty,
      oldestLossDate: fmtIso(oldestLoss),
      latestLossDate: fmtIso(latestLoss),
      oldestUnreconciledDate: fmtIso(oldestUnreconciled),
      daysPending,
      reimbQty,
      reimbAmount,
      caseCount: cm?.count ?? 0,
      caseOpenCount: cm?.openCount ?? 0,
      caseStatusTop: cm?.topStatus ?? "No Case",
      caseApprovedQty,
      caseApprovedAmount: cm?.approvedAmount ?? 0,
      adjQty,
      effectiveReimbQty,
      netClaimableQty,
      actionStatus: worst,
      decision: rollupDecision(list),
      eventDecisions,
      inboundLostQty,
      openLost,
      openDamaged,
      lostReimbQty,
      damagedReimbQty,
      preLostReimbQty,
      preDamagedReimbQty,
      postLostReimbQty,
      postDamagedReimbQty,
      settledByAmazon: reconciledQty,
      foundMatchedQty,
      foundFreeQty,
      claimDeadline,
      daysToDeadline,
      reimbDetails: rm?.details ?? [],
    });
  }

  const priority = (r: AdjAnalysisRow): number => {
    switch (r.actionStatus) {
      case "take-action":
        return 0;
      case "waiting":
        return 1;
      case "grade-resell":
        return 2;
      case "reconciled":
        return 3;
    }
  };
  out.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return b.lossQty - a.lossQty;
  });

  return out;
}

function coverageToDecision(c: AdjCoverageType): AdjDecision {
  switch (c) {
    case "reimbursed":
      return "reimbursed";
    case "found":
      return "found";
    case "grade-resell":
      return "grade-resell";
    case "disposition-change":
      return "disposition-change";
    case "case":
      return "case-covered";
    case "manual-adj":
      return "manual-adjustment";
    case "partial":
      return "partially-reimbursed";
    case "open":
      return "pending";
  }
}

function rollupDecision(list: AdjLedgerRow[]): AdjDecision | "mixed" {
  const open = new Set<AdjDecision>();
  for (const l of list) {
    if (l.actionStatus !== "reconciled") open.add(coverageToDecision(l.coverageType));
  }
  if (open.size === 0) {
    // pick most common decision
    const counts = new Map<AdjDecision, number>();
    for (const l of list) {
      const d = coverageToDecision(l.coverageType);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    let best: AdjDecision = "pending";
    let bestN = 0;
    for (const [k, v] of counts) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    return best;
  }
  if (open.size === 1) return open.values().next().value as AdjDecision;
  return "mixed";
}

// Thin shim: pre-existing callers still use aggregateAdjAnalysis.
export function aggregateAdjAnalysis(
  rows: AdjInput[],
  caseMap: Map<string, AdjCaseMeta>,
  adjMap: Map<string, AdjAdjMeta>,
  reimbMap: Map<string, AdjReimbBuckets>,
  today: Date = new Date(),
): AdjAnalysisRow[] {
  const ledger = buildAdjLedgerRows(rows, caseMap, adjMap, reimbMap, today);
  return buildAdjMskuRows(ledger, caseMap, adjMap, reimbMap, today);
}

// Legacy event-row builder — kept so existing imports still type-check.
// Implementation maps each ledger row to an AdjEventRow.
export function buildAdjEventRows(
  ledger: AdjLedgerRow[],
  _reimbMap: Map<string, AdjReimbBuckets>,
  today: Date = new Date(),
): AdjEventRow[] {
  void _reimbMap;
  return ledger.map((l) => {
    let claimDeadline = "";
    let daysToDeadline = 0;
    if (l.adjDate && (l.reason === "M" || l.reason === "E" || isQAsLoss(l.reason, l.disposition))) {
      const dl = new Date(l.adjDate);
      dl.setDate(dl.getDate() + CLAIM_EXPIRY_DAYS);
      claimDeadline = fmtIso(dl);
      daysToDeadline = Math.floor(
        (dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    return {
      id: l.id,
      adjDate: l.adjDate,
      msku: l.msku,
      fnsku: l.fnsku,
      asin: l.asin,
      title: l.title,
      referenceId: l.referenceId,
      fulfillmentCenter: l.fulfillmentCenter,
      disposition: l.disposition,
      reason: l.reason,
      reasonLabel: l.reasonLabel,
      qty: l.qty,
      reconciledQty: l.coverageType === "reimbursed" || l.coverageType === "found"
        ? l.coveredQty
        : 0,
      unreconciledQty: Math.max(0, Math.abs(l.qty) - l.coveredQty),
      reimbQtyAllocated: l.reimbDetails.reduce((s, d) => s + d.qty, 0),
      reimbAmountAllocated: l.reimbDetails.reduce((s, d) => s + d.amount, 0),
      claimDeadline,
      daysToDeadline,
      decision: coverageToDecision(l.coverageType),
      status: l.actionStatus,
      coveredBy: l.decision,
      pairedRefId: l.pairedRefId,
    };
  });
}

// Legacy annotate shim — kept for callers; now routes via ledger.
export function annotateAdjEvents(
  rows: AdjInput[],
  caseMap: Map<string, AdjCaseMeta>,
  adjMap: Map<string, AdjAdjMeta>,
  reimbMap: Map<string, AdjReimbBuckets>,
  today: Date = new Date(),
): AdjLedgerRow[] {
  return buildAdjLedgerRows(rows, caseMap, adjMap, reimbMap, today);
}

export function aggregateAdjPivot(
  rows: AdjInput[],
  groupBy: AdjPivotGroupBy = "asin",
  caseMap?: Map<string, AdjCaseMeta>,
  reimbMap?: Map<string, AdjReimbBuckets>,
  adjMap?: Map<string, AdjAdjMeta>,
): AdjPivotResult {
  type Acc = {
    key: string;
    title: string;
    qtyByReason: Record<string, number>;
    totalQty: number;
  };
  const accs = new Map<string, Acc>();
  const reasonSet = new Set<string>();

  for (const r of rows) {
    const key = groupBy === "msku" ? s(r.msku) : s(r.asin);
    if (!key) continue;
    const code = (r.reason ?? "").trim().toUpperCase();
    if (!code) continue;
    reasonSet.add(code);

    const acc =
      accs.get(key) ??
      ({
        key,
        title: s(r.title),
        qtyByReason: {},
        totalQty: 0,
      } satisfies Acc);

    if (!acc.title && r.title) acc.title = r.title;

    const q = r.quantity || 0;
    acc.qtyByReason[code] = (acc.qtyByReason[code] ?? 0) + q;
    acc.totalQty += q;

    accs.set(key, acc);
  }

  const reasonCodes = Array.from(reasonSet).sort((a, b) => {
    const aIsNum = /^\d+$/.test(a);
    const bIsNum = /^\d+$/.test(b);
    if (aIsNum && !bIsNum) return 1;
    if (!aIsNum && bIsNum) return -1;
    return a.localeCompare(b);
  });

  const pivotRows: AdjPivotRow[] = Array.from(accs.values())
    .map((a) => {
      const cm = caseMap?.get(a.key);
      const rm = reimbMap?.get(a.key);
      const am = adjMap?.get(a.key);
      const reimbQty = rm?.qty ?? 0;
      const caseApproved = cm?.approvedQty ?? 0;
      const openQty = Math.max(0, -a.totalQty - reimbQty - caseApproved);

      let status: AdjPivotStatus;
      if (a.totalQty > 0) {
        status = "excess";
      } else if (a.totalQty === 0) {
        status = "ok";
      } else if (openQty === 0) {
        status = "reimbursed";
      } else if (reimbQty > 0 || caseApproved > 0) {
        status = "partial";
      } else {
        status = "take-action";
      }

      return {
        key: a.key,
        title: a.title,
        qtyByReason: a.qtyByReason,
        totalQty: a.totalQty,
        status,
        reimbQty,
        reimbAmount: rm?.amount ?? 0,
        openQty,
        caseApprovedQty: caseApproved,
        reimbDetails: rm?.details ?? [],
        caseCount: cm?.count ?? 0,
        caseOpenCount: cm?.openCount ?? 0,
        caseStatusTop: cm?.topStatus ?? "No Case",
        caseClaimedQty: cm?.claimedQty ?? 0,
        caseApprovedAmount: cm?.approvedAmount ?? 0,
        caseIds: (cm?.caseIds ?? []).join(", "),
        manualAdjQty: am?.qty ?? 0,
        manualAdjCount: am?.count ?? 0,
        manualAdjReasons: (am?.reasons ?? []).join(", "),
      };
    })
    .sort((a, b) => {
      const rank = (s: AdjPivotStatus) =>
        s === "take-action" ? 0 : s === "partial" ? 1 :
        s === "excess" ? 2 : s === "ok" ? 3 : 4;
      const dr = rank(a.status) - rank(b.status);
      if (dr !== 0) return dr;
      return a.key.localeCompare(b.key);
    });

  return { groupBy, rows: pivotRows, reasonCodes };
}

export function buildAdjLogRows(rows: AdjInput[]): AdjLogRow[] {
  return rows.map((r) => ({
    id: r.id,
    adjDate: fmtIso(r.adjDate),
    fnsku: r.fnsku ?? "",
    msku: r.msku ?? "",
    asin: r.asin ?? "",
    title: r.title ?? "",
    quantity: r.quantity,
    reason: (r.reason ?? "").trim().toUpperCase(),
    reasonLabel: getReasonLabel(r.reason),
    claimTag: getClaimTag(r.reason),
    disposition: r.disposition ?? "",
    fulfillmentCenter: r.fulfillmentCenter ?? "",
    reconciledQty: r.reconciledQty ?? 0,
    unreconciledQty: r.unreconciledQty ?? 0,
    referenceId: r.referenceId ?? "",
    store: r.store ?? "",
  }));
}

export function adjStats(analysis: AdjAnalysisRow[]): AdjReconStats {
  let totalLossEvents = 0;
  let totalLossQty = 0;
  let totalFoundQty = 0;
  let totalReconciledQty = 0;
  let totalUnreconciledQty = 0;
  let takeActionCount = 0;
  let takeActionQty = 0;
  let waitingCount = 0;
  let waitingQty = 0;
  let reconciledCount = 0;
  let reconciledQtyBucket = 0;
  const excessCount = 0;
  const excessQty = 0;
  let reimbMatchedCount = 0;
  let reimbMatchedQty = 0;
  let casesRaisedCount = 0;
  let casesRaisedQty = 0;

  for (const r of analysis) {
    totalLossQty += r.lossQty;
    totalFoundQty += r.foundQty;
    totalReconciledQty += r.reconciledQty;
    totalUnreconciledQty += r.unreconciledQty;
    if (r.lossQty > 0) totalLossEvents += 1;

    if (r.actionStatus === "take-action") {
      takeActionCount += 1;
      takeActionQty += r.netClaimableQty;
    } else if (r.actionStatus === "waiting") {
      waitingCount += 1;
      waitingQty += r.unreconciledQty;
    } else if (r.actionStatus === "reconciled") {
      reconciledCount += 1;
      reconciledQtyBucket += r.reconciledQty;
    }

    if (r.effectiveReimbQty >= r.unreconciledQty && r.unreconciledQty > 0) {
      reimbMatchedCount += 1;
      reimbMatchedQty += r.effectiveReimbQty;
    }
    if (r.caseOpenCount > 0) {
      casesRaisedCount += 1;
      casesRaisedQty += r.caseOpenCount;
    }
  }

  return {
    totalSkus: analysis.length,
    totalLossEvents,
    totalLossQty,
    totalFoundQty,
    totalReconciledQty,
    totalUnreconciledQty,
    takeActionCount,
    takeActionQty,
    waitingCount,
    waitingQty,
    reconciledCount,
    reconciledQtyBucket,
    excessCount,
    excessQty,
    reimbMatchedCount,
    reimbMatchedQty,
    casesRaisedCount,
    casesRaisedQty,
  };
}
