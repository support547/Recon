import { KpiCard } from "@/components/dashboard/ReconDashboardClient";
import {
  computeAllModuleStats,
  type ModulePromiseBag,
} from "@/components/dashboard/compute-module-stats";

export async function UnrecoveredKpi(b: ModulePromiseBag) {
  const m = await computeAllModuleStats(b);
  const unrecovered =
    m.shipment.pending +
    m.removal.pending +
    m.returns.pending +
    m.replacement.pending +
    m.fcTransfer.pending +
    m.gnr.pending +
    m.adjustment.pending +
    m.full.pending;
  return (
    <KpiCard
      label="Unrecovered"
      value={unrecovered}
      accent={unrecovered > 0 ? "red" : "emerald"}
      iconKey="flame"
      emphasize
    />
  );
}
