import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  FileWarning,
  TrendingDown,
} from "lucide-react";
import { CaseStatus } from "@prisma/client";

import { UrgencyPill } from "@/components/dashboard/ReconDashboardClient";
import {
  computeAllModuleStats,
  type ModulePromiseBag,
} from "@/components/dashboard/compute-module-stats";

function fmt(n: number) {
  return n.toLocaleString();
}

export async function AlertBand(b: ModulePromiseBag) {
  const [m, cases] = await Promise.all([computeAllModuleStats(b), b.casesP]);
  const mods = [
    m.shipment,
    m.removal,
    m.returns,
    m.replacement,
    m.fcTransfer,
    m.gnr,
    m.adjustment,
    m.full,
  ];
  const totals = {
    takeAction: mods.reduce((s, x) => s + x.takeAction, 0),
    caseNeeded: mods.reduce((s, x) => s + x.caseNeeded, 0),
    unrecovered: mods.reduce((s, x) => s + x.pending, 0),
  };
  const casesRaisedGlobal = cases.filter(
    (c) => c.status === CaseStatus.OPEN || c.status === CaseStatus.IN_PROGRESS,
  ).length;

  if (totals.takeAction === 0) {
    return (
      <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="size-4" aria-hidden />
        All reconciliations clear
      </span>
    );
  }
  return (
    <>
      <UrgencyPill
        tone="red"
        icon={<AlertTriangle className="size-3.5" aria-hidden />}
        label={`${fmt(totals.takeAction)} Total Take Action`}
        scrollTargetId="section-modules"
      />
      <UrgencyPill
        tone="amber"
        icon={<FileWarning className="size-3.5" aria-hidden />}
        label={`${fmt(totals.caseNeeded)} Cases to Raise`}
        scrollTargetId="section-modules"
      />
      <UrgencyPill
        tone="emerald"
        icon={<CircleDot className="size-3.5" aria-hidden />}
        label={`${fmt(casesRaisedGlobal)} Cases Raised`}
        scrollTargetId="section-cases"
      />
      <UrgencyPill
        tone="slate"
        icon={<TrendingDown className="size-3.5" aria-hidden />}
        label={`${fmt(totals.unrecovered)} Total Units Unrecovered`}
        scrollTargetId="section-flow"
      />
    </>
  );
}
