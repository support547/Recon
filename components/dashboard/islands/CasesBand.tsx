import Link from "@/components/nav/ProgressLink";
import { FolderOpen, Plus } from "lucide-react";
import { CaseStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CaseStatChipLink } from "@/components/dashboard/ReconDashboardClient";
import type { CaseTrackerRow } from "@/actions/cases";

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export async function CasesBand({
  casesP,
}: {
  casesP: Promise<CaseTrackerRow[]>;
}) {
  const cases = await casesP;
  const open = cases.filter((c) => c.status === CaseStatus.OPEN).length;
  const inProgress = cases.filter(
    (c) => c.status === CaseStatus.IN_PROGRESS,
  ).length;
  const resolved = cases.filter((c) => c.status === CaseStatus.RESOLVED).length;
  const rejected = cases.filter((c) => c.status === CaseStatus.REJECTED).length;
  const closed = cases.filter((c) => c.status === CaseStatus.CLOSED).length;
  const totalClaimed = cases.reduce((s, c) => s + (c.unitsClaimed || 0), 0);
  const totalApprovedAmount = cases.reduce(
    (s, c) => s + (c.amountApproved ? Number(c.amountApproved) : 0),
    0,
  );
  const casesRaisedGlobal = cases.filter(
    (c) => c.status === CaseStatus.OPEN || c.status === CaseStatus.IN_PROGRESS,
  ).length;
  const casesWithApprovedAmount = cases.filter(
    (c) => c.amountApproved != null && Number(c.amountApproved) > 0,
  ).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-blue-500" aria-hidden />
          <h3 className="text-sm font-semibold">Open Cases</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="default" size="xs">
            <Link href="/cases-adjustments?tab=cases&action=new">
              <Plus className="size-3" aria-hidden />
              Raise New Case
            </Link>
          </Button>
          <Link
            href="/cases-adjustments?tab=cases"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            View all →
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 text-center">
        <CaseStatChipLink
          label="Open"
          value={open}
          tone="amber"
          href="/cases-adjustments?tab=cases&status=OPEN"
        />
        <CaseStatChipLink
          label="In Progress"
          value={inProgress}
          tone="blue"
          href="/cases-adjustments?tab=cases&status=IN_PROGRESS"
        />
        <CaseStatChipLink
          label="Resolved"
          value={resolved}
          tone="emerald"
          href="/cases-adjustments?tab=cases&status=RESOLVED"
        />
        <CaseStatChipLink
          label="Rejected"
          value={rejected}
          tone="red"
          href="/cases-adjustments?tab=cases&status=REJECTED"
        />
        <CaseStatChipLink
          label="Closed"
          value={closed}
          tone="slate"
          href="/cases-adjustments?tab=cases&status=CLOSED"
        />
      </div>
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
          Approved Amount
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-xl font-bold tabular-nums text-emerald-700">
            {fmtCurrency(totalApprovedAmount)}
          </span>
          <span className="text-[11px] text-emerald-700/80">
            {fmt(casesWithApprovedAmount)} cases with approved &gt; $0
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Claimed:{" "}
          <span className="font-mono tabular-nums text-foreground">
            {fmt(totalClaimed)} u
          </span>
        </span>
        <span className="text-muted-foreground">
          Cases raised:{" "}
          <span className="font-mono tabular-nums text-foreground">
            {fmt(casesRaisedGlobal)}
          </span>
        </span>
      </div>
    </Card>
  );
}
