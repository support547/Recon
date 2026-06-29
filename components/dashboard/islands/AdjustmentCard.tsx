import type { CaseTrackerRow } from "@/actions/cases";
import type { AdjReconPayload } from "@/actions/adjustment-reconciliation";
import { AdjustmentModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeAdjustmentStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "adjustment")!;

export async function AdjustmentCard({
  dataP,
  casesP,
}: {
  dataP: Promise<AdjReconPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeAdjustmentStats(dataP, casesP);
  return <AdjustmentModuleCard cfg={CFG} stats={stats} />;
}
