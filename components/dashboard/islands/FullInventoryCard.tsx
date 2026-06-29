import type { CaseTrackerRow } from "@/actions/cases";
import type { FullReconDashboardSummary } from "@/actions/full-reconciliation";
import { FullModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeFullInventoryStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "full")!;

export async function FullInventoryCard({
  dataP,
  casesP,
}: {
  dataP: Promise<FullReconDashboardSummary | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeFullInventoryStats(dataP, casesP);
  return <FullModuleCard cfg={CFG} stats={stats} />;
}
