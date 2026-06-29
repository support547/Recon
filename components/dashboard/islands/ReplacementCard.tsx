import type { CaseTrackerRow } from "@/actions/cases";
import type { ReplacementReconciliationPayload } from "@/actions/replacement-reconciliation";
import { ReplacementModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeReplacementStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "replacement")!;

export async function ReplacementCard({
  dataP,
  casesP,
}: {
  dataP: Promise<ReplacementReconciliationPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeReplacementStats(dataP, casesP);
  return <ReplacementModuleCard cfg={CFG} stats={stats} />;
}
