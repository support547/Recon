"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FnskuStatusKey } from "@/lib/returns-reconciliation/legacy-types";

const STATUS_CFG: Record<FnskuStatusKey, { label: string; className: string }> = {
  MATCHED_FNSKU:   { label: "✓ Matched",        className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  FNSKU_MISMATCH:  { label: "⚠ Mismatch",        className: "border-red-200 bg-red-50 text-red-700" },
  GNR_TRANSFERRED: { label: "↻ GNR",             className: "border-purple-200 bg-purple-50 text-purple-700" },
  WRONG_SELLER:    { label: "✕ Wrong Seller",    className: "border-red-300 bg-red-100 text-red-800 font-bold" },
  UNRELATED_ITEM:  { label: "✕ Unrelated",       className: "border-red-300 bg-red-100 text-red-800" },
  ORDER_NOT_FOUND: { label: "? Not Found",        className: "border-amber-200 bg-amber-50 text-amber-700" },
};

export function FnskuStatusBadge({ status }: { status: FnskuStatusKey }) {
  const c = STATUS_CFG[status] ?? {
    label: status,
    className: "border-border bg-muted text-muted-foreground",
  };
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", c.className)}
    >
      {c.label}
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
