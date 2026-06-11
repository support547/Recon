"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_TO_GROUP } from "@/lib/gnr-reconciliation/v2/formula";
import type {
  GnrV2ActionGroup,
  GnrV2Status,
} from "@/lib/gnr-reconciliation/v2/types";

const LABEL: Record<GnrV2Status, string> = {
  "mixed-sku": "⊘ Mixed SKU",
  review: "🔍 Review",
  "no-snapshot": "◌ No Snapshot",
  "claim-inbound": "📥 Claim Inbound",
  "pending-data": "⏱ Pending Data",
  matched: "✓ Matched",
  resolved: "🛠 Resolved",
  "over-accounted": "🔄 Over-Accounted",
  reimbursed: "💵 Reimbursed",
  waiting: "⏳ Waiting",
  "take-action": "⚠ Take Action",
};

const CLS: Record<GnrV2Status, string> = {
  "mixed-sku": "border-slate-300 bg-slate-100 text-slate-600",
  review: "border-pink-200 bg-pink-50 text-pink-700",
  "no-snapshot": "border-slate-200 bg-slate-50 text-slate-600",
  "claim-inbound": "border-blue-200 bg-blue-50 text-blue-700",
  "pending-data": "border-indigo-200 bg-indigo-50 text-indigo-700",
  matched: "border-emerald-200 bg-emerald-50 text-emerald-700",
  resolved: "border-sky-200 bg-sky-50 text-sky-700",
  "over-accounted": "border-purple-200 bg-purple-50 text-purple-700",
  reimbursed: "border-teal-200 bg-teal-50 text-teal-700",
  waiting: "border-amber-200 bg-amber-50 text-amber-800",
  "take-action": "border-red-200 bg-red-50 text-red-700",
};

export function GnrV2StatusBadge({
  status,
  title,
}: {
  status: GnrV2Status;
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}
    >
      {LABEL[status]}
    </Badge>
  );
}

export const GNR_V2_STATUS_OPTIONS: { value: GnrV2Status; label: string }[] = [
  { value: "claim-inbound", label: LABEL["claim-inbound"] },
  { value: "pending-data", label: LABEL["pending-data"] },
  { value: "take-action", label: LABEL["take-action"] },
  { value: "waiting", label: LABEL.waiting },
  { value: "over-accounted", label: LABEL["over-accounted"] },
  { value: "reimbursed", label: LABEL.reimbursed },
  { value: "matched", label: LABEL.matched },
  { value: "resolved", label: LABEL.resolved },
  { value: "mixed-sku", label: LABEL["mixed-sku"] },
  { value: "no-snapshot", label: LABEL["no-snapshot"] },
  { value: "review", label: LABEL.review },
];

/** Full granular status label (with emoji). */
export const GNR_V2_STATUS_LABEL = LABEL;

/** Short label for the compact card breakdown chips. */
export const GNR_V2_STATUS_SHORT: Record<GnrV2Status, string> = {
  "claim-inbound": "Claim",
  "take-action": "Action",
  "mixed-sku": "Mixed",
  "no-snapshot": "NoSnap",
  waiting: "Waiting",
  "pending-data": "Pending",
  matched: "Matched",
  resolved: "Resolved",
  reimbursed: "Reimb",
  "over-accounted": "Over-Acc",
  review: "Review",
};

/** Per-group UI metadata: label, accent, member statuses (in display order). */
export const GNR_V2_GROUP_META: Record<
  GnrV2ActionGroup,
  { label: string; accent: "red" | "green" | "purple"; members: GnrV2Status[] }
> = {
  "take-action": {
    label: "Take Action",
    accent: "red",
    members: ["claim-inbound", "take-action", "waiting", "pending-data", "mixed-sku", "no-snapshot"],
  },
  "no-action": {
    label: "No Action",
    accent: "green",
    members: ["matched", "resolved", "reimbursed"],
  },
  excess: {
    label: "Excess",
    accent: "purple",
    members: ["over-accounted", "review"],
  },
};

/** Tailwind classes for a group's left row-border + card accents. */
export const GNR_V2_GROUP_BORDER: Record<GnrV2ActionGroup, string> = {
  "take-action": "border-l-red-400",
  "no-action": "border-l-emerald-400",
  excess: "border-l-purple-400",
};

/** Sanity: every member list maps back to its group (keeps meta in sync). */
void (function assertGroupMembers() {
  for (const [g, meta] of Object.entries(GNR_V2_GROUP_META) as [
    GnrV2ActionGroup,
    (typeof GNR_V2_GROUP_META)[GnrV2ActionGroup],
  ][]) {
    for (const s of meta.members) {
      if (STATUS_TO_GROUP[s] !== g) {
        throw new Error(`GNR_V2_GROUP_META: ${s} listed under ${g} but maps to ${STATUS_TO_GROUP[s]}`);
      }
    }
  }
});
