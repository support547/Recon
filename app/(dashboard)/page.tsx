import { Suspense } from "react";

import { prisma } from "@/lib/prisma";
import { getCases, getAdjustments } from "@/actions/cases";
import { getShipmentReconciliationData } from "@/actions/shipment-reconciliation";
import { summaryStats as shipmentSummaryStats } from "@/lib/shipment-reconciliation-logic";
import { getRemovalReconData } from "@/actions/removal-reconciliation";
import { getReturnsReconData } from "@/actions/returns-reconciliation";
import { tallyReturnActionStatus } from "@/lib/returns-reconciliation/return-action-status";
import { getReplacementReconData } from "@/actions/replacement-reconciliation";
import { summaryStats as replacementSummaryStats } from "@/lib/replacement-reconciliation/aggregate";
import { getFcTransferFullRecon } from "@/actions/fc-transfer-reconciliation";
import { getGnrReconV2Data } from "@/actions/gnr-reconciliation-v2";
import { getAdjReconData } from "@/actions/adjustment-reconciliation";
import { getFullReconData } from "@/actions/full-reconciliation";
import { refreshReconciliationSummary } from "@/actions/reconciliation-refresh";
import { AdjType, CaseStatus, ReconType } from "@prisma/client";
import type { CaseTrackerRow } from "@/actions/cases";

import {
  ReconDashboardClient,
  type DashboardProps,
  type ModuleStats,
} from "@/components/dashboard/ReconDashboardClient";
import { ReconDashboardSkeleton } from "@/components/dashboard/ReconDashboardSkeleton";

export const dynamic = "force-dynamic";

const ZERO_MODULE: ModuleStats = {
  primaryLabel: "—",
  primaryValue: 0,
  secondary: [],
  takeAction: 0,
  caseNeeded: 0,
  pending: 0,
  casesRaised: 0,
  casesApproved: 0,
  casesPending: 0,
};

const RAISED_CASE_STATUSES = new Set<CaseStatus>([
  CaseStatus.OPEN,
  CaseStatus.IN_PROGRESS,
]);

type ModuleCaseCounts = {
  casesRaised: number;
  casesApproved: number;
  casesPending: number;
};

function caseCountsFor(
  cases: CaseTrackerRow[],
  reconType: ReconType,
): ModuleCaseCounts {
  let raised = 0;
  let approved = 0;
  let pendingC = 0;
  for (const c of cases) {
    if (c.reconType !== reconType) continue;
    raised++;
    if (c.status === CaseStatus.RESOLVED) approved++;
    else if (RAISED_CASE_STATUSES.has(c.status)) pendingC++;
  }
  return { casesRaised: raised, casesApproved: approved, casesPending: pendingC };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("[dashboard] action failed:", e);
    return fallback;
  }
}

function sum<T>(arr: T[], pick: (row: T) => number): number {
  let s = 0;
  for (const r of arr) s += pick(r) || 0;
  return s;
}

function count<T>(arr: T[], pred: (row: T) => boolean): number {
  let n = 0;
  for (const r of arr) if (pred(r)) n++;
  return n;
}

async function loadDashboard(): Promise<DashboardProps> {
  const [
    shipment,
    removal,
    returnsR,
    replacement,
    fc,
    gnr,
    adj,
    full,
    cases,
    adjustments,
    flowAggs,
    refreshMeta,
  ] = await Promise.all([
    safe(getShipmentReconciliationData({ shipmentStatus: "all", shipmentId: "all" }), null),
    safe(getRemovalReconData({}), null),
    safe(getReturnsReconData({}), null),
    safe(getReplacementReconData({}), null),
    safe(getFcTransferFullRecon({}), null),
    safe(getGnrReconV2Data({}), null),
    safe(getAdjReconData({ groupBy: "msku" }), null),
    safe(getFullReconData({}), null),
    safe(getCases({}), []),
    safe(getAdjustments({}), []),
    safe(
      Promise.all([
        prisma.shippedToFba.aggregate({
          _sum: { quantity: true },
          where: { deletedAt: null },
        }),
        prisma.fbaReceipt.aggregate({
          _sum: { quantity: true },
          where: { deletedAt: null },
        }),
        prisma.salesData.aggregate({
          _sum: { quantity: true },
          where: { deletedAt: null },
        }),
        prisma.customerReturn.aggregate({
          _sum: { quantity: true },
          where: { deletedAt: null },
        }),
        prisma.reimbursement.aggregate({
          _sum: { quantity: true },
          where: { deletedAt: null },
        }),
      ]),
      null,
    ),
    safe(
      prisma.reconciliationSummary.findFirst({
        orderBy: { lastRefreshedAt: "desc" },
        select: { lastRefreshedAt: true },
      }),
      null,
    ),
  ]);

  const caseCountsByModule = {
    shipment: caseCountsFor(cases, ReconType.SHIPMENT),
    removal: caseCountsFor(cases, ReconType.REMOVAL),
    returns: caseCountsFor(cases, ReconType.RETURN),
    replacement: caseCountsFor(cases, ReconType.REPLACEMENT),
    fcTransfer: caseCountsFor(cases, ReconType.FC_TRANSFER),
    gnr: caseCountsFor(cases, ReconType.GNR),
    adjustment: caseCountsFor(cases, ReconType.ADJUSTMENT),
    full: caseCountsFor(cases, ReconType.FBA_BALANCE),
  };

  // ── Shipment module ─────────────────────────────────────────
  const shipmentStats: ModuleStats = shipment
    ? (() => {
        const rows = shipment.rows;
        const s = shipmentSummaryStats(rows, shipment.overlay);
        const shortageQty = sum(rows, (r) => (r.shortage > 0 ? r.shortage : 0));
        const receivedQ = sum(rows, (r) => r.received_qty);
        const resolvedQty = s.caseRaisedQty + s.adjQty;
        return {
          // Header pill + Priority Actions row show take-action UNITS, matching
          // the Shipment Recon page's TAKE ACTION card (units side).
          primaryLabel: "units take action",
          primaryValue: s.caseQty,
          secondary: [
            { label: "Total",      value: s.totalQty },
            { label: "Received",   value: receivedQ },
            { label: "Reimbursed", value: s.reimbQty },
            { label: "Resolved",   value: resolvedQty },
          ],
          takeAction: s.caseQty,
          caseNeeded: s.caseNeededSkus,
          // Unrecovered-units KPI keeps shortage semantics (unchanged).
          pending: shortageQty,
          ...caseCountsByModule.shipment,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.shipment };

  // ── Removal module ──────────────────────────────────────────
  const removalStats: ModuleStats = removal
    ? (() => {
        const rows = removal.rows;
        const notReceived = count(
          rows,
          (r) =>
            r.receiptStatus === "MISSING" ||
            r.receiptStatus === "AWAITING" ||
            r.receiptStatus === "PARTIAL",
        );
        const requested = sum(rows, (r) => r.requestedQty);
        const expected = sum(rows, (r) => r.expectedShipped);
        const received = sum(rows, (r) => r.receivedQty);
        const reimbursed = sum(rows, (r) => r.reimbQty);
        const takeAction = count(
          rows,
          (r) =>
            (r.orderStatus || "").toLowerCase() === "completed" &&
            r.receiptStatus === "MISSING",
        );
        return {
          primaryLabel: "not received",
          primaryValue: notReceived,
          secondary: [
            { label: "Requested", value: requested },
            { label: "Expected", value: expected },
            { label: "Received", value: received },
            { label: "Reimbursed", value: reimbursed },
          ],
          takeAction,
          caseNeeded: takeAction,
          pending: Math.max(expected - received, 0),
          ...caseCountsByModule.removal,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.removal };

  // ── Returns module ──────────────────────────────────────────
  // Uses the same qty-based status model as the Returns Recon page so the card
  // matches the page's cards. Card shows unit metrics in a Shipment-style grid:
  // Total · Settled · Not Found (order not in sales) · Adjustment.
  const returnsStats: ModuleStats = returnsR
    ? (() => {
        const rows = returnsR.rows;
        const t = tallyReturnActionStatus(rows);
        return {
          primaryLabel: "units take action",
          // Pill shows take-action UNITS; takeAction stays a ROW count so the
          // cross-module aggregate + the red badge keep SKU-count semantics.
          primaryValue: t.takeAction.units,
          secondary: [
            { label: "Total", value: t.total.units },
            { label: "Settled", value: t.settled.units },
            { label: "Not Found", value: t.notFound.units },
            { label: "Adjustment", value: t.adjustments.units },
          ],
          takeAction: t.takeAction.rows,
          caseNeeded: count(rows, (r) => r.caseCount === 0 && r.finalStatus === "CASE_NEEDED"),
          pending: t.takeAction.units,
          ...caseCountsByModule.returns,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.returns };

  // ── Replacement module ──────────────────────────────────────
  const replacementStats: ModuleStats = replacement
    ? (() => {
        const rows = replacement.rows;
        // Units source of truth — same aggregate the replacement page uses.
        const s = replacementSummaryStats(rows);
        // Unchanged pending calc: shipped units not yet covered by reimb/return.
        const pendingUnits = Math.max(
          s.totalQty - sum(rows, (r) => r.effectiveReimbQty + r.returnQty),
          0,
        );
        return {
          primaryLabel: "take action",
          // Header pill shows TAKE ACTION card UNITS (same as the page KPI).
          primaryValue: s.takeActionQty,
          secondary: [
            { label: "Total", value: s.totalQty },
            { label: "Return", value: s.returnsMatchedQty },
            { label: "Waiting", value: s.waitingReturnQty },
            { label: "Resolved", value: s.reimbQty + s.adjQty },
          ],
          // Match the page's TAKE ACTION KPI: PARTIAL rows count too.
          takeAction: s.takeActionSkus,
          caseNeeded: count(
            rows,
            (r) =>
              (r.status === "TAKE_ACTION" || r.status === "PARTIAL") &&
              r.caseCount === 0,
          ),
          pending: pendingUnits,
          ...caseCountsByModule.replacement,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.replacement };

  // ── FC Transfer module ──────────────────────────────────────
  // Sourced from the NEW full-reconciliation engine (55-day + disposition-aware).
  // takeAction = the three must-act statuses; the other fields map from the
  // 9-bucket partition. Numbers differ from the legacy engine by design.
  const fcStats: ModuleStats = fc
    ? (() => {
        const stats = fc.stats;
        const rows = fc.rows;
        const takeAction =
          stats.shortageCount + stats.damagedCount + stats.shortageDamagedCount;
        // Card layout mirrors Replacement Recon (2×2 StatBox grid):
        //  Total MSKU | Reconcile / No Action | Cases & Adjustments.
        //  - No Action = in-transit (within window) + excess (watch-only buckets).
        //  - Cases & Adjustments = open cases + reimbursed + adjusted (settled/in-progress).
        const noAction = stats.inTransitCount + stats.excessCount;
        const casesAdj =
          stats.caseOpenCount + stats.reimbursedCount + stats.adjustedCount;
        return {
          primaryLabel: "transfers unbalanced",
          primaryValue: takeAction,
          secondary: [
            { label: "Total MSKU", value: stats.totalGroups },
            { label: "Reconcile", value: stats.reconciledCount },
            { label: "No Action", value: noAction },
            { label: "Cases & Adj", value: casesAdj },
          ],
          takeAction,
          caseNeeded: count(rows, (r) => r.actionable && r.caseCount === 0),
          pending: stats.totalUnresolvedQty,
          ...caseCountsByModule.fcTransfer,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.fcTransfer };

  // ── GNR module (FBA Recon v2) ───────────────────────────────
  const gnrStats: ModuleStats = gnr
    ? (() => {
        const stats = gnr.stats;
        const rows = gnr.rows;
        const takeActionRows = rows.filter((r) => r.actionGroup === "take-action");
        // Pending qty = Σ expectedInQty of the take-action group.
        const pendingQty = sum(takeActionRows, (r) => r.expectedInQty);
        return {
          primaryLabel: "SKUs need action",
          primaryValue: stats.byGroup["take-action"],
          secondary: [
            { label: "Total", value: stats.totalSkus },
            { label: "Match", value: stats.byStatus["matched"] },
            { label: "Resolve", value: stats.byStatus["resolved"] },
            { label: "Excess", value: stats.byGroup["excess"] },
          ],
          takeAction: stats.byGroup["take-action"],
          caseNeeded: count(takeActionRows, (r) => r.caseCount === 0),
          pending: pendingQty,
          ...caseCountsByModule.gnr,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.gnr };

  // ── Adjustment module ───────────────────────────────────────
  // Mirrors the Adjustment Recon page "By MSKU" KPI strip: counts come from
  // the analysis aggregate (one row per MSKU with rolled-up actionStatus).
  const adjStats: ModuleStats = adj
    ? (() => {
        const analysisRows = adj.analysis;
        const totalMskus = analysisRows.length;
        const takeActionMskus = count(analysisRows, (r) => r.actionStatus === "take-action");
        const reconciledMskus = count(analysisRows, (r) => r.actionStatus === "reconciled");
        const gradeResellMskus = count(analysisRows, (r) => r.actionStatus === "grade-resell");
        const casesRaisedMskus = count(analysisRows, (r) => r.caseCount > 0);
        return {
          primaryLabel: "MSKUs take action",
          primaryValue: takeActionMskus,
          secondary: [
            { label: "Total MSKUs",  value: totalMskus },
            { label: "Reconciled",   value: reconciledMskus },
            { label: "Grade & Resell", value: gradeResellMskus },
            { label: "Cases Raised", value: casesRaisedMskus },
          ],
          takeAction: takeActionMskus,
          caseNeeded: count(
            analysisRows,
            (r) => r.actionStatus === "take-action" && r.caseCount === 0,
          ),
          pending: adj.stats.totalUnreconciledQty,
          ...caseCountsByModule.adjustment,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.adjustment };

  // ── Full Inventory module ───────────────────────────────────
  const fullStats: ModuleStats = full
    ? (() => {
        const stats = full.stats;
        const rows = full.rows;
        return {
          primaryLabel: "SKUs need action",
          primaryValue: stats.takeAction,
          secondary: [
            { label: "Matched", value: stats.matched },
            { label: "Over", value: stats.over },
            { label: "Reimbursed", value: stats.reimbursed },
            { label: "No Snapshot", value: stats.noSnapshot },
          ],
          takeAction: stats.takeAction,
          caseNeeded: count(rows, (r) => r.reconStatus === "Take Action" && r.caseCount === 0),
          pending: Math.abs(stats.takeActionVariance),
          ...caseCountsByModule.full,
        };
      })()
    : { ...ZERO_MODULE, ...caseCountsByModule.full };

  // ── Cases aggregate ─────────────────────────────────────────
  const caseAgg = {
    open: count(cases, (c) => c.status === CaseStatus.OPEN),
    inProgress: count(cases, (c) => c.status === CaseStatus.IN_PROGRESS),
    resolved: count(cases, (c) => c.status === CaseStatus.RESOLVED),
    rejected: count(cases, (c) => c.status === CaseStatus.REJECTED),
    closed: count(cases, (c) => c.status === CaseStatus.CLOSED),
    totalClaimed: sum(cases, (c) => c.unitsClaimed),
    totalApprovedAmount: sum(cases, (c) =>
      c.amountApproved ? Number(c.amountApproved) : 0,
    ),
    casesRaisedGlobal: count(cases, (c) =>
      c.status === CaseStatus.OPEN || c.status === CaseStatus.IN_PROGRESS,
    ),
    casesWithApprovedAmount: count(cases, (c) =>
      c.amountApproved != null && Number(c.amountApproved) > 0,
    ),
  };

  // ── Adjustments aggregate ───────────────────────────────────
  const adjAgg = {
    quantity: count(adjustments, (a) => a.adjType === AdjType.QUANTITY),
    financial: count(adjustments, (a) => a.adjType === AdjType.FINANCIAL),
    status: count(adjustments, (a) => a.adjType === AdjType.STATUS),
    other: count(adjustments, (a) => a.adjType === AdjType.OTHER),
    totalUnits: sum(adjustments, (a) => Math.abs(a.qtyAdjusted)),
  };

  // ── Flow KPIs ───────────────────────────────────────────────
  const shipped = flowAggs?.[0]._sum.quantity ?? 0;
  const received = flowAggs?.[1]._sum.quantity ?? 0;
  const sold = flowAggs?.[2]._sum.quantity ?? 0;
  const returnsTotal = flowAggs?.[3]._sum.quantity ?? 0;
  const reimbursed = flowAggs?.[4]._sum.quantity ?? 0;

  return {
    flow: {
      shipped,
      received,
      netShortage: Math.max(shipped - received, 0),
      sold,
      returns: returnsTotal,
      reimbursed,
    },
    modules: {
      shipment: shipmentStats,
      removal: removalStats,
      returns: returnsStats,
      replacement: replacementStats,
      fcTransfer: fcStats,
      gnr: gnrStats,
      adjustment: adjStats,
      full: fullStats,
    },
    cases: caseAgg,
    adjustments: adjAgg,
    lastRefreshedAt: new Date().toISOString(),
    refreshAction: refreshReconciliationSummary,
  };
}

async function DashboardData() {
  const props = await loadDashboard();
  return <ReconDashboardClient {...props} />;
}

export default function DashboardHomePage() {
  return (
    <Suspense fallback={<ReconDashboardSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}
