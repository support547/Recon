import { CaseStatus, type ReconType } from "@prisma/client";

import type { CaseTrackerRow } from "@/actions/cases";
import type { ModuleStats } from "@/components/dashboard/ReconDashboardClient";

export const ZERO_MODULE: ModuleStats = {
  primaryLabel: "—",
  primaryValue: 0,
  secondary: [],
  takeAction: 0,
  caseNeeded: 0,
  pending: 0,
  casesRaised: 0,
  casesApproved: 0,
  casesPending: 0,
};

const RAISED_CASE_STATUSES = new Set<CaseStatus>([
  CaseStatus.OPEN,
  CaseStatus.IN_PROGRESS,
]);

export type ModuleCaseCounts = {
  casesRaised: number;
  casesApproved: number;
  casesPending: number;
};

export function caseCountsFor(
  cases: CaseTrackerRow[],
  reconType: ReconType,
): ModuleCaseCounts {
  let raised = 0;
  let approved = 0;
  let pendingC = 0;
  for (const c of cases) {
    if (c.reconType !== reconType) continue;
    raised++;
    if (c.status === CaseStatus.RESOLVED) approved++;
    else if (RAISED_CASE_STATUSES.has(c.status)) pendingC++;
  }
  return { casesRaised: raised, casesApproved: approved, casesPending: pendingC };
}

export function sum<T>(arr: T[], pick: (row: T) => number): number {
  let s = 0;
  for (const r of arr) s += pick(r) || 0;
  return s;
}

export function count<T>(arr: T[], pred: (row: T) => boolean): number {
  let n = 0;
  for (const r of arr) if (pred(r)) n++;
  return n;
}

export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("[dashboard] action failed:", e);
    return fallback;
  }
}
