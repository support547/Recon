"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FcFullStatus } from "@/lib/fc-transfer-reconciliation/full-recon-types";

const LABEL: Record<FcFullStatus, string> = {
  RECONCILED: "✓ Reconciled",
  IN_TRANSIT: "🚚 In Transit",
  SHORTAGE: "⚠ Shortage",
  DAMAGED_IN_TRANSIT: "💥 Damaged in Transit",
  SHORTAGE_AND_DAMAGED: "⚠💥 Shortage + Damaged",
  EXCESS: "⇄ Excess",
  CASE_OPEN: "⚖ Case Open",
  REIMBURSED: "💰 Reimbursed",
  ADJUSTED: "🔧 Adjusted",
};

const CLS: Record<FcFullStatus, string> = {
  RECONCILED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  IN_TRANSIT: "border-sky-200 bg-sky-50 text-sky-700",
  SHORTAGE: "border-red-200 bg-red-50 text-red-700",
  DAMAGED_IN_TRANSIT: "border-rose-300 bg-rose-100 text-rose-800",
  SHORTAGE_AND_DAMAGED: "border-rose-300 bg-rose-100 text-rose-800",
  EXCESS: "border-blue-200 bg-blue-50 text-blue-700",
  CASE_OPEN: "border-orange-200 bg-orange-50 text-orange-800",
  REIMBURSED: "border-teal-200 bg-teal-50 text-teal-700",
  ADJUSTED: "border-violet-200 bg-violet-50 text-violet-700",
};

export function FullStatusBadge({ status }: { status: FcFullStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}
    >
      {LABEL[status]}
    </Badge>
  );
}

export const FC_FULL_STATUSES: FcFullStatus[] = [
  "DAMAGED_IN_TRANSIT",
  "SHORTAGE_AND_DAMAGED",
  "SHORTAGE",
  "IN_TRANSIT",
  "EXCESS",
  "CASE_OPEN",
  "REIMBURSED",
  "ADJUSTED",
  "RECONCILED",
];

export const FC_FULL_STATUS_LABEL = LABEL;
