import type { CaseTrackerRow } from "@/actions/cases";
import type { FcFullReconPayload } from "@/actions/fc-transfer-reconciliation";
import { FcTransferModuleCard } from "@/components/dashboard/ReconDashboardClient";
import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { computeFcTransferStats } from "@/components/dashboard/compute-module-stats";

const CFG = MODULE_CONFIGS.find((c) => c.key === "fcTransfer")!;

export async function FcTransferCard({
  dataP,
  casesP,
}: {
  dataP: Promise<FcFullReconPayload | null>;
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const stats = await computeFcTransferStats(dataP, casesP);
  return <FcTransferModuleCard cfg={CFG} stats={stats} />;
}
