"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FcActionStatus } from "@/lib/fc-transfer-reconciliation/types";

const LABEL: Record<FcActionStatus, string> = {
  "take-action": "⚠ Take Action",
  waiting: "⏳ Waiting",
  excess: "⇄ Excess Stock",
};

const CLS: Record<FcActionStatus, string> = {
  "take-action": "border-red-200 bg-red-50 text-red-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
  excess: "border-blue-200 bg-blue-50 text-blue-700",
};

export function ActionStatusBadge({ status }: { status: FcActionStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}
    >
      {LABEL[status]}
    </Badge>
  );
}

export function CaseStatusBadge({
  status,
  count,
}: {
  status: string;
  count: number;
}) {
  if (count === 0) return <span className="font-mono text-[11px] text-slate-300">—</span>;
  const cls =
    status === "Resolved" || status === "Approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Open" || status === "In Progress" || status === "Pending"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : status === "Rejected"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
        {status}
      </Badge>
      <span className="text-[9px] text-muted-foreground">
        {count} case{count > 1 ? "s" : ""}
      </span>
    </div>
  );
}
