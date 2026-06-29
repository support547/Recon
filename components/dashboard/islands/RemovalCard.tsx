import type { CaseTrackerRow } from "@/actions/cases";
import type { RemovalReconciliationPayload } from "@/actions/removal-reconciliation";
import { RemovalModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeRemovalStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "removal")!;

export async function RemovalCard({
  dataP,
  casesP,
}: {
  dataP: Promise<RemovalReconciliationPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeRemovalStats(dataP, casesP);
  return <RemovalModuleCard cfg={CFG} stats={stats} />;
}
