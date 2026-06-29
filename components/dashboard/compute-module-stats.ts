import { cache } from "react";
import { ReconType } from "@prisma/client";

import type { CaseTrackerRow } from "@/actions/cases";
import type { ShipmentReconciliationPayload } from "@/actions/shipment-reconciliation";
import type { RemovalReconciliationPayload } from "@/actions/removal-reconciliation";
import type { ReturnsReconciliationPayload } from "@/actions/returns-reconciliation";
import type { ReplacementReconciliationPayload } from "@/actions/replacement-reconciliation";
import type { FcFullReconPayload } from "@/actions/fc-transfer-reconciliation";
import type { GnrReconV2Payload } from "@/actions/gnr-reconciliation-v2";
import type { AdjReconPayload } from "@/actions/adjustment-reconciliation";
import type { FullReconDashboardSummary } from "@/actions/full-reconciliation";

import { summaryStats as shipmentSummaryStats } from "@/lib/shipment-reconciliation-logic";
import { tallyReturnActionStatus } from "@/lib/returns-reconciliation/return-action-status";
import { summaryStats as replacementSummaryStats } from "@/lib/replacement-reconciliation/aggregate";

import type { ModuleStats } from "@/components/dashboard/ReconDashboardClient";
import {
  ZERO_MODULE,
  caseCountsFor,
  count,
  sum,
} from "@/components/dashboard/island-utils";

// Each compute is wrapped in React.cache so islands sharing the same underlying
// promises (e.g. ShipmentCard + AlertBand + PriorityList + UnrecoveredKpi)
// reuse the computed ModuleStats instead of re-running the reducer per render.

export const computeShipmentStats = cache(
  async (
    dataP: Promise<ShipmentReconciliationPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.SHIPMENT);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const rows = data.rows;
    const s = shipmentSummaryStats(rows, data.overlay);
    const shortageQty = sum(rows, (r) => (r.shortage > 0 ? r.shortage : 0));
    const receivedQ = sum(rows, (r) => r.received_qty);
    const resolvedQty = s.caseRaisedQty + s.adjQty;
    return {
      primaryLabel: "units take action",
      primaryValue: s.caseQty,
      secondary: [
        { label: "Total", value: s.totalQty },
        { label: "Received", value: receivedQ },
        { label: "Reimbursed", value: s.reimbQty },
        { label: "Resolved", value: resolvedQty },
      ],
      takeAction: s.caseQty,
      caseNeeded: s.caseNeededSkus,
      pending: shortageQty,
      ...cc,
    };
  },
);

export const computeRemovalStats = cache(
  async (
    dataP: Promise<RemovalReconciliationPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.REMOVAL);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const s = data.stats;
    const takeAction = count(
      data.rows,
      (r) =>
        (r.orderStatus || "").toLowerCase() === "completed" &&
        r.receiptStatus === "MISSING",
    );
    return {
      primaryLabel: "awaiting",
      primaryValue: s.awaitingQty,
      secondary: [
        { label: "Total", value: s.totalQty },
        { label: "Received", value: s.receivedQty },
        { label: "Partial / Missing", value: s.partialMissingQty },
        { label: "Reimbursed", value: s.reimbursedQty },
      ],
      takeAction,
      caseNeeded: takeAction,
      pending: s.partialMissingQty,
      ...cc,
    };
  },
);

export const computeReturnsStats = cache(
  async (
    dataP: Promise<ReturnsReconciliationPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.RETURN);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const rows = data.rows;
    const t = tallyReturnActionStatus(rows);
    return {
      primaryLabel: "units take action",
      primaryValue: t.takeAction.units,
      secondary: [
        { label: "Total", value: t.total.units },
        { label: "Settled", value: t.settled.units },
        { label: "Not Found", value: t.notFound.units },
        { label: "Adjustment", value: t.adjustments.units },
      ],
      takeAction: t.takeAction.rows,
      caseNeeded: count(
        rows,
        (r) => r.caseCount === 0 && r.finalStatus === "CASE_NEEDED",
      ),
      pending: t.takeAction.units,
      ...cc,
    };
  },
);

export const computeReplacementStats = cache(
  async (
    dataP: Promise<ReplacementReconciliationPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.REPLACEMENT);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const rows = data.rows;
    const s = replacementSummaryStats(rows);
    const pendingUnits = Math.max(
      s.totalQty - sum(rows, (r) => r.effectiveReimbQty + r.returnQty),
      0,
    );
    return {
      primaryLabel: "take action",
      primaryValue: s.takeActionQty,
      secondary: [
        { label: "Total", value: s.totalQty },
        { label: "Return", value: s.returnsMatchedQty },
        { label: "Waiting", value: s.waitingReturnQty },
        { label: "Resolved", value: s.reimbQty + s.adjQty },
      ],
      takeAction: s.takeActionSkus,
      caseNeeded: count(
        rows,
        (r) =>
          (r.status === "TAKE_ACTION" || r.status === "PARTIAL") &&
          r.caseCount === 0,
      ),
      pending: pendingUnits,
      ...cc,
    };
  },
);

export const computeFcTransferStats = cache(
  async (
    dataP: Promise<FcFullReconPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.FC_TRANSFER);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const stats = data.stats;
    const rows = data.rows;
    const takeAction =
      stats.shortageCount + stats.damagedCount + stats.shortageDamagedCount;
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
      ...cc,
    };
  },
);

export const computeGnrStats = cache(
  async (
    dataP: Promise<GnrReconV2Payload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.GNR);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const stats = data.stats;
    const rows = data.rows;
    const takeActionRows = rows.filter((r) => r.actionGroup === "take-action");
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
      ...cc,
    };
  },
);

export const computeAdjustmentStats = cache(
  async (
    dataP: Promise<AdjReconPayload | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.ADJUSTMENT);
    if (!data) return { ...ZERO_MODULE, ...cc };
    const analysisRows = data.analysis;
    const totalMskus = analysisRows.length;
    const takeActionMskus = count(
      analysisRows,
      (r) => r.actionStatus === "take-action",
    );
    const reconciledMskus = count(
      analysisRows,
      (r) => r.actionStatus === "reconciled",
    );
    const gradeResellMskus = count(
      analysisRows,
      (r) => r.actionStatus === "grade-resell",
    );
    const casesRaisedMskus = count(analysisRows, (r) => r.caseCount > 0);
    return {
      primaryLabel: "MSKUs take action",
      primaryValue: takeActionMskus,
      secondary: [
        { label: "Total MSKUs", value: totalMskus },
        { label: "Reconciled", value: reconciledMskus },
        { label: "Grade & Resell", value: gradeResellMskus },
        { label: "Cases Raised", value: casesRaisedMskus },
      ],
      takeAction: takeActionMskus,
      caseNeeded: count(
        analysisRows,
        (r) => r.actionStatus === "take-action" && r.caseCount === 0,
      ),
      pending: data.stats.totalUnreconciledQty,
      ...cc,
    };
  },
);

export const computeFullInventoryStats = cache(
  async (
    dataP: Promise<FullReconDashboardSummary | null>,
    casesP: Promise<CaseTrackerRow[]>,
  ): Promise<ModuleStats> => {
    const [data, cases] = await Promise.all([dataP, casesP]);
    const cc = caseCountsFor(cases, ReconType.FBA_BALANCE);
    if (!data) return { ...ZERO_MODULE, ...cc };
    return {
      primaryLabel: "SKUs need action",
      primaryValue: data.takeAction,
      secondary: [
        { label: "Matched", value: data.matched },
        { label: "Over", value: data.over },
        { label: "Reimbursed", value: data.reimbursed },
        { label: "No Snapshot", value: data.noSnapshot },
      ],
      takeAction: data.takeAction,
      caseNeeded: data.caseNeeded,
      pending: Math.abs(data.takeActionVariance),
      ...cc,
    };
  },
);

export type ModulePromiseBag = {
  shipmentP: Promise<ShipmentReconciliationPayload | null>;
  removalP: Promise<RemovalReconciliationPayload | null>;
  returnsP: Promise<ReturnsReconciliationPayload | null>;
  replacementP: Promise<ReplacementReconciliationPayload | null>;
  fcP: Promise<FcFullReconPayload | null>;
  gnrP: Promise<GnrReconV2Payload | null>;
  adjP: Promise<AdjReconPayload | null>;
  fullP: Promise<FullReconDashboardSummary | null>;
  casesP: Promise<CaseTrackerRow[]>;
};

export async function computeAllModuleStats(b: ModulePromiseBag): Promise<{
  shipment: ModuleStats;
  removal: ModuleStats;
  returns: ModuleStats;
  replacement: ModuleStats;
  fcTransfer: ModuleStats;
  gnr: ModuleStats;
  adjustment: ModuleStats;
  full: ModuleStats;
}> {
  const [
    shipment,
    removal,
    returns,
    replacement,
    fcTransfer,
    gnr,
    adjustment,
    full,
  ] = await Promise.all([
    computeShipmentStats(b.shipmentP, b.casesP),
    computeRemovalStats(b.removalP, b.casesP),
    computeReturnsStats(b.returnsP, b.casesP),
    computeReplacementStats(b.replacementP, b.casesP),
    computeFcTransferStats(b.fcP, b.casesP),
    computeGnrStats(b.gnrP, b.casesP),
    computeAdjustmentStats(b.adjP, b.casesP),
    computeFullInventoryStats(b.fullP, b.casesP),
  ]);
  return {
    shipment,
    removal,
    returns,
    replacement,
    fcTransfer,
    gnr,
    adjustment,
    full,
  };
}
