import type { FinalStatus } from "@/lib/returns-reconciliation/types";

/**
 * Short label + chip classes for each return `finalStatus`, used by the
 * Returns Reconciliation table Status column. Colours mirror the priority
 * tints used in the Action Queue panel (red = act now, amber = review,
 * grey/green = informational/resolved).
 */
export const FINAL_STATUS_BADGE: Record<
  FinalStatus,
  { label: string; cls: string }
> = {
  CASE_NEEDED:        { label: "Case Needed",    cls: "bg-[#F7C1C1] text-[#791F1F]" },
  UNKNOWN_GNR_CASE:   { label: "Unknown GNR",    cls: "bg-[#FAC775] text-[#633806]" },
  INVESTIGATE:        { label: "Investigate",    cls: "bg-[#FAEEDA] text-[#854F0B]" },
  GNR_TRACKING:       { label: "GNR Tracking",   cls: "bg-[#EEEDFE] text-[#534AB7]" },
  TRANSFERRED_TO_GNR: { label: "→ GNR",          cls: "bg-[#EEEDFE] text-[#534AB7]" },
  PENDING:            { label: "Pending",        cls: "bg-amber-50 text-amber-700" },
  RESOLVED:           { label: "Resolved",       cls: "bg-emerald-50 text-emerald-700" },
};

export function finalStatusBadge(status: FinalStatus) {
  return FINAL_STATUS_BADGE[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
}
