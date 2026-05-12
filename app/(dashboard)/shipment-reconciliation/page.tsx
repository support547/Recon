import { Suspense } from "react";

import {
  getShipmentReconciliationData,
  listShipmentCaAdjustments,
  listShipmentCaCases,
} from "@/actions/shipment-reconciliation";
import { ShipmentReconciliationClient } from "@/components/shipment-reconciliation/shipment-reconciliation-client";
import { ShipmentReconciliationSkeleton } from "@/components/shipment-reconciliation/shipment-reconciliation-skeleton";

async function ShipmentReconciliationLoader() {
  const [payload, cases, adjustments] = await Promise.all([
    getShipmentReconciliationData({
      shipmentStatus: "all",
      shipmentId: "all",
    }),
    listShipmentCaCases({}),
    listShipmentCaAdjustments({}),
  ]);

  return (
    <ShipmentReconciliationClient
      initialPayload={payload}
      initialCases={cases}
      initialAdjustments={adjustments}
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
