"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReplacementStatusKey } from "@/lib/replacement-reconciliation/types";

const LABEL: Record<ReplacementStatusKey, string> = {
  TAKE_ACTION: "⚠ Take Action",
  PARTIAL: "◐ Partial",
  RETURNED: "↩ Returned",
  REIMBURSED: "💰 Reimbursed",
  RESOLVED: "✓ Resolved",
};

const CLS: Record<ReplacementStatusKey, string> = {
  TAKE_ACTION: "border-red-200 bg-red-50 text-red-700",
  PARTIAL: "border-amber-200 bg-amber-50 text-amber-800",
  RETURNED: "border-blue-200 bg-blue-50 text-blue-700",
  REIMBURSED: "border-teal-200 bg-teal-50 text-teal-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function ReplacementStatusBadge({ status }: { status: ReplacementStatusKey }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}
    >
      {LABEL[status]}
    </Badge>
  );
}

export function CaseStatusBadge({ status, count }: { status: string; count: number }) {
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
