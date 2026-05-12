"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FullReconStatus } from "@/lib/full-reconciliation/types";

const LABEL: Record<FullReconStatus, string> = {
  "Matched": "✓ Matched",
  "Over": "▲ Over",
  "Take Action": "⚠ Take Action",
  "Reimbursed": "💰 Reimbursed",
  "No Snapshot": "— No Snapshot",
};

const CLS: Record<FullReconStatus, string> = {
  "Matched": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Over": "border-blue-200 bg-blue-50 text-blue-700",
  "Take Action": "border-red-200 bg-red-50 text-red-700",
  "Reimbursed": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "No Snapshot": "border-slate-200 bg-slate-50 text-slate-600",
};

export function FullStatusBadge({ status }: { status: FullReconStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px] font-bold whitespace-nowrap", CLS[status])}>
      {LABEL[status]}
    </Badge>
  );
}
