import type { CaseTrackerRow } from "@/actions/cases";
import type { GnrReconV2Payload } from "@/actions/gnr-reconciliation-v2";
import { GnrModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeGnrStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "gnr")!;

export async function GnrCard({
  dataP,
  casesP,
}: {
  dataP: Promise<GnrReconV2Payload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeGnrStats(dataP, casesP);
  return <GnrModuleCard cfg={CFG} stats={stats} />;
}
