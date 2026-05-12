"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RemovalReceiptStatusKey } from "@/lib/removal-reconciliation/types";

export const RECEIPT_STATUS_LABEL: Record<RemovalReceiptStatusKey, string> = {
  AWAITING: "⏳ Awaiting",
  PARTIAL: "⚠ Partial",
  COMPLETE: "✓ Received",
  MISSING: "✕ Missing",
  DAMAGED: "🔧 Damaged",
  REIMBURSED: "💰 Reimbursed",
  NOT_APPLICABLE: "—",
};

const CLASS_MAP: Record<RemovalReceiptStatusKey, string> = {
  AWAITING: "border-slate-200 bg-slate-50 text-slate-700",
  PARTIAL: "border-amber-200 bg-amber-50 text-amber-800",
  COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MISSING: "border-red-200 bg-red-50 text-red-700",
  DAMAGED: "border-pink-200 bg-pink-50 text-pink-700",
  REIMBURSED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  NOT_APPLICABLE: "border-slate-200 bg-slate-50 text-slate-500",
};

export function RemovalStatusBadge({ status }: { status: RemovalReceiptStatusKey }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full font-mono text-[10px] font-bold",
        CLASS_MAP[status],
      )}
    >
      {RECEIPT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CaseStatusBadge({ status, count }: { status: string; count: number }) {
  if (count === 0) {
    return <span className="font-mono text-[11px] text-slate-300">—</span>;
  }
  const cls =
    status === "Resolved" || status === "Approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "Open" || status === "In Progress" || status === "Pending"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : status === "Rejected"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {status} ({count})
    </Badge>
  );
}

export function WrongItemBadge({ count }: { count: number }) {
  if (count === 0) {
    return <span className="font-mono text-[11px] text-slate-300">—</span>;
  }
  return (
    <Badge
      variant="outline"
      className="rounded-full border-orange-300 bg-orange-50 font-mono text-[10px] font-bold text-orange-700"
    >
      ⚠ WRONG
    </Badge>
  );
}
