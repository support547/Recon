import { Suspense } from "react";

import { listWrongLabelByShipment } from "@/actions/adjustments";
import {
  getShipmentReconciliationData,
  listShipmentCaAdjustments,
  listShipmentCaCases,
} from "@/actions/shipment-reconciliation";
import { ShipmentReconciliationClient } from "@/components/shipment-reconciliation/shipment-reconciliation-client";
import { ShipmentReconciliationSkeleton } from "@/components/shipment-reconciliation/shipment-reconciliation-skeleton";
import type { WrongLabelOverlay } from "@/components/shipment-reconciliation/sku-recon-table";

function wrongLabelKey(shipmentId: string, msku: string): string {
  return `${shipmentId} ${msku}`;
}

async function ShipmentReconciliationLoader() {
  const [payload, cases, adjustments] = await Promise.all([
    getShipmentReconciliationData({
      shipmentStatus: "all",
      shipmentId: "all",
    }),
    listShipmentCaCases({}),
    listShipmentCaAdjustments({}),
  ]);

  const shipmentIds = Array.from(
    new Set(payload.rows.map((r) => r.shipment_id).filter(Boolean)),
  );
  const wrongLabelSummaries = await listWrongLabelByShipment(shipmentIds);
  const wrongLabelOverlay: WrongLabelOverlay = {};
  for (const s of wrongLabelSummaries) {
    wrongLabelOverlay[wrongLabelKey(s.shipmentId, s.msku)] = {
      totalUnits: s.totalUnits,
      openCount: s.openCount,
    };
  }

  return (
    <ShipmentReconciliationClient
      initialPayload={payload}
      initialCases={cases}
      initialAdjustments={adjustments}
      initialWrongLabelOverlay={wrongLabelOverlay}
    />
  );
}

export default function ShipmentReconciliationPage() {
  return (
    <Suspense fallback={<ShipmentReconciliationSkeleton />}>
      <ShipmentReconciliationLoader />
    </Suspense>
  );
}
