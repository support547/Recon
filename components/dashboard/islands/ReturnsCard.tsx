import type { CaseTrackerRow } from "@/actions/cases";
import type { ReturnsReconciliationPayload } from "@/actions/returns-reconciliation";
import { ReturnsModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeReturnsStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "returns")!;

export async function ReturnsCard({
  dataP,
  casesP,
}: {
  dataP: Promise<ReturnsReconciliationPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeReturnsStats(dataP, casesP);
  return <ReturnsModuleCard cfg={CFG} stats={stats} />;
}
