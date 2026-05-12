"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GnrActionStatus } from "@/lib/gnr-reconciliation/types";

const LABEL: Record<GnrActionStatus, string> = {
  matched: "✓ Matched",
  "take-action": "⚠ Take Action",
  waiting: "⏳ Waiting",
  "over-accounted": "🔄 Over-Accounted",
  balanced: "✓ Balanced",
  review: "🔍 Review",
};

const CLS: Record<GnrActionStatus, string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "take-action": "border-red-200 bg-red-50 text-red-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
  "over-accounted": "border-purple-200 bg-purple-50 text-purple-700",
  balanced: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-pink-200 bg-pink-50 text-pink-700",
};

export function GnrStatusBadge({ status }: { status: GnrActionStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}>
      {LABEL[status]}
    </Badge>
  );
}

export function ConditionBadge({ value }: { value: string }) {
  if (!value || value === "—") return <span className="text-[11px] text-muted-foreground">—</span>;
  const lo = value.toLowerCase();
  const cls = lo.includes("like new")
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : lo.includes("very good")
      ? "border-teal-200 bg-teal-50 text-teal-700"
      : lo.includes("good")
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : lo.includes("acceptable")
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : lo.includes("poor") || lo.includes("unsellable")
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {value}
    </Badge>
  );
}
