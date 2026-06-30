import { Suspense } from "react";
import { AdjType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCases, getAdjustments, type CaseTrackerRow } from "@/actions/cases";
import { getShipmentReconciliationData } from "@/actions/shipment-reconciliation";
import { getRemovalReconData } from "@/actions/removal-reconciliation";
import { getReturnsReconData } from "@/actions/returns-reconciliation";
import { getReplacementReconData } from "@/actions/replacement-reconciliation";
import { getFcTransferFullRecon } from "@/actions/fc-transfer-reconciliation";
import { getGnrReconV2Data } from "@/actions/gnr-reconciliation-v2";
import { getAdjReconData } from "@/actions/adjustment-reconciliation";
import { getFullReconDashboardSummary } from "@/actions/full-reconciliation";
import { refreshReconciliationSummary } from "@/actions/reconciliation-refresh";

import { ReconDashboardShell } from "@/components/dashboard/ReconDashboardShell";
import {
  AdjustmentsCardSkeleton,
  AlertBarSkeleton,
  CasesCardSkeleton,
  KpiBandSkeleton,
  KpiTileSkeleton,
  LastRefreshedSkeleton,
  ModuleCardSkeleton,
} from "@/components/dashboard/CardSkeletons";

import { ShipmentCard } from "@/components/dashboard/islands/ShipmentCard";
import { RemovalCard } from "@/components/dashboard/islands/RemovalCard";
import { ReturnsCard } from "@/components/dashboard/islands/ReturnsCard";
import { ReplacementCard } from "@/components/dashboard/islands/ReplacementCard";
import { FcTransferCard } from "@/components/dashboard/islands/FcTransferCard";
import { GnrCard } from "@/components/dashboard/islands/GnrCard";
import { AdjustmentCard } from "@/components/dashboard/islands/AdjustmentCard";
import { FullInventoryCard } from "@/components/dashboard/islands/FullInventoryCard";
import { KpiBand, type FlowAggT } from "@/components/dashboard/islands/KpiBand";
import { UnrecoveredKpi } from "@/components/dashboard/islands/UnrecoveredKpi";
import { AlertBand } from "@/components/dashboard/islands/AlertBand";
import { PriorityList } from "@/components/dashboard/islands/PriorityList";
import { CasesBand } from "@/components/dashboard/islands/CasesBand";
import { AdjustmentsBand } from "@/components/dashboard/islands/AdjustmentsBand";
import { LastRefreshed } from "@/components/dashboard/islands/LastRefreshed";

import { safe } from "@/components/dashboard/island-utils";

export const dynamic = "force-dynamic";

type AdjRow = { adjType: AdjType; qtyAdjusted: number };

export default function DashboardHomePage() {
  // Kick off every promise synchronously — NO top-level await. The page body
  // returns immediately so the shell + per-card skeletons stream as the first
  // HTTP chunk. Each <Suspense> island below awaits only the promise(s) it
  // actually needs, so a single slow action no longer blocks the page.
  const shipmentP = safe(
    getShipmentReconciliationData({ shipmentStatus: "all", shipmentId: "all" }),
    null,
  );
  const removalP = safe(getRemovalReconData({}), null);
  const returnsP = safe(getReturnsReconData({}), null);
  const replacementP = safe(getReplacementReconData({}), null);
  const fcP = safe(getFcTransferFullRecon({}), null);
  const gnrP = safe(getGnrReconV2Data({}), null);
  const adjP = safe(getAdjReconData({ groupBy: "msku" }), null);
  const fullP = safe(getFullReconDashboardSummary(), null);
  const casesP = safe(getCases({}), [] as CaseTrackerRow[]);
  const adjustmentsP = safe(getAdjustments({}), [] as AdjRow[]);

  const flowP = safe(
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
    ]) as Promise<FlowAggT>,
    null as FlowAggT | null,
  );

  const refreshMetaP = safe(
    prisma.reconciliationSummary
      .findFirst({
        orderBy: { lastRefreshedAt: "desc" },
        select: { lastRefreshedAt: true },
      })
      .then((r) => r?.lastRefreshedAt?.toISOString() ?? null),
    null as string | null,
  );

  const modBag = {
    shipmentP,
    removalP,
    returnsP,
    replacementP,
    fcP,
    gnrP,
    adjP,
    fullP,
    casesP,
  };

  return (
    <ReconDashboardShell
      refreshAction={refreshReconciliationSummary}
      lastRefreshedSlot={
        <Suspense fallback={<LastRefreshedSkeleton />}>
          <LastRefreshed promise={refreshMetaP} />
        </Suspense>
      }
      alertBarSlot={
        <Suspense fallback={<AlertBarSkeleton />}>
          <AlertBand {...modBag} />
        </Suspense>
      }
      kpiBandSlot={
        <Suspense fallback={<KpiBandSkeleton />}>
          <KpiBand
            flowP={flowP}
            unrecoveredSlot={
              <Suspense fallback={<KpiTileSkeleton />}>
                <UnrecoveredKpi {...modBag} />
              </Suspense>
            }
          />
        </Suspense>
      }
      moduleSlots={{
        shipment: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <ShipmentCard dataP={shipmentP} casesP={casesP} />
          </Suspense>
        ),
        removal: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <RemovalCard dataP={removalP} casesP={casesP} />
          </Suspense>
        ),
        returns: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <ReturnsCard dataP={returnsP} casesP={casesP} />
          </Suspense>
        ),
        replacement: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <ReplacementCard dataP={replacementP} casesP={casesP} />
          </Suspense>
        ),
        fcTransfer: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <FcTransferCard dataP={fcP} casesP={casesP} />
          </Suspense>
        ),
        gnr: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <GnrCard dataP={gnrP} casesP={casesP} />
          </Suspense>
        ),
        adjustment: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <AdjustmentCard dataP={adjP} casesP={casesP} />
          </Suspense>
        ),
        full: (
          <Suspense fallback={<ModuleCardSkeleton />}>
            <FullInventoryCard dataP={fullP} casesP={casesP} />
          </Suspense>
        ),
      }}
      prioritySlot={
        <Suspense fallback={<CasesCardSkeleton />}>
          <PriorityList {...modBag} />
        </Suspense>
      }
      casesSlot={
        <Suspense fallback={<CasesCardSkeleton />}>
          <CasesBand casesP={casesP} />
        </Suspense>
      }
      adjustmentsSlot={
        <Suspense fallback={<AdjustmentsCardSkeleton />}>
          <AdjustmentsBand adjustmentsP={adjustmentsP} />
        </Suspense>
      }
    />
  );
}
