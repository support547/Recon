"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AdjActionStatus,
  AdjClaimType,
} from "@/lib/adjustment-reconciliation/types";

const STATUS_LABEL: Record<AdjActionStatus, string> = {
  "take-action": "⚠ Take Action",
  waiting: "⏳ Waiting",
  reconciled: "✓ Reconciled",
  excess: "⇄ Excess",
  expired: "✗ Expired",
};

const STATUS_CLS: Record<AdjActionStatus, string> = {
  "take-action": "border-red-200 bg-red-50 text-red-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excess: "border-blue-200 bg-blue-50 text-blue-700",
  expired: "border-slate-300 bg-slate-100 text-slate-500 line-through",
};

export function AdjStatusBadge({ status }: { status: AdjActionStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", STATUS_CLS[status])}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const CLAIM_LABEL: Record<AdjClaimType, string> = {
  Lost_Warehouse: "📦 Lost — Warehouse",
  Damaged_Warehouse: "💥 Damaged — Warehouse",
  Mixed: "🔀 Mixed",
  None: "—",
};

const CLAIM_CLS: Record<AdjClaimType, string> = {
  Lost_Warehouse: "border-orange-200 bg-orange-50 text-orange-800",
  Damaged_Warehouse: "border-purple-200 bg-purple-50 text-purple-800",
  Mixed: "border-pink-200 bg-pink-50 text-pink-800",
  None: "border-slate-200 bg-slate-50 text-slate-500",
};

export function ClaimTypeBadge({ claimType }: { claimType: AdjClaimType }) {
  if (claimType === "None") {
    return <span className="font-mono text-[11px] text-slate-300">—</span>;
  }
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", CLAIM_CLS[claimType])}
    >
      {CLAIM_LABEL[claimType]}
    </Badge>
  );
}
