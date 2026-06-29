import type { CaseTrackerRow } from "@/actions/cases";
import type { ShipmentReconciliationPayload } from "@/actions/shipment-reconciliation";
import { ShipmentModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeShipmentStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "shipment")!;

export async function ShipmentCard({
  dataP,
  casesP,
}: {
  dataP: Promise<ShipmentReconciliationPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeShipmentStats(dataP, casesP);
  return <ShipmentModuleCard cfg={CFG} stats={stats} />;
}
