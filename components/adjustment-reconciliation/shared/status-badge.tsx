"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AdjClaimType,
  AdjDecision,
  AdjStatus,
} from "@/lib/adjustment-reconciliation/types";

const STATUS_LABEL: Record<AdjStatus, string> = {
  "take-action": "⚠ Take Action",
  waiting: "⏳ Waiting",
  reconciled: "✓ Reconciled",
  "grade-resell": "♻ Grade & Resell",
};

const STATUS_CLS: Record<AdjStatus, string> = {
  "take-action": "border-red-200 bg-red-50 text-red-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "grade-resell": "border-teal-200 bg-teal-50 text-teal-700",
};

export function AdjStatusBadge({ status }: { status: AdjStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", STATUS_CLS[status])}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const DECISION_LABEL: Record<AdjDecision | "mixed", string> = {
  pending: "Pending",
  reimbursed: "Reimbursed",
  "partially-reimbursed": "Partially Reimbursed",
  found: "Found",
  "grade-resell": "Grade & Resell",
  "disposition-change": "Disposition Change",
  reversal: "Reversal",
  "manual-adjustment": "Manual Adj",
  "case-covered": "Case",
  removal: "Removal",
  mixed: "Mixed",
};

const DECISION_CLS: Record<AdjDecision | "mixed", string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-700",
  reimbursed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "partially-reimbursed": "border-amber-200 bg-amber-50 text-amber-800",
  found: "border-blue-200 bg-blue-50 text-blue-700",
  "grade-resell": "border-teal-200 bg-teal-50 text-teal-700",
  "disposition-change": "border-purple-200 bg-purple-50 text-purple-700",
  reversal: "border-rose-200 bg-rose-50 text-rose-700",
  "manual-adjustment": "border-indigo-200 bg-indigo-50 text-indigo-700",
  "case-covered": "border-sky-200 bg-sky-50 text-sky-700",
  removal: "border-slate-200 bg-slate-50 text-slate-500",
  mixed: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
};

export function AdjDecisionChip({
  decision,
}: {
  decision: AdjDecision | "mixed";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full font-mono text-[10px] font-bold",
        DECISION_CLS[decision],
      )}
    >
      {DECISION_LABEL[decision]}
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
