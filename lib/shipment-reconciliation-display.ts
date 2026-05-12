import type { CaseTrackerRow, ManualAdjustmentRow } from "@/actions/cases";
import { CaseStatus, type ReconType } from "@prisma/client";

/** Lowercase snake recon label for badges / CSV parity with legacy HTML */
export function reconTypeToLegacy(r: ReconType): string {
  return r.toLowerCase();
}

const FORM_RECON = [
  "shipment",
  "removal",
  "return",
  "fc_transfer",
  "fba_balance",
  "other",
] as const;

export type ShipmentReconFormType = (typeof FORM_RECON)[number];

/** Maps DB recon types onto standalone modal / CA filter options (unknown → other). */
export function reconTypeToFormValue(r: ReconType): ShipmentReconFormType {
  const s = r.toLowerCase();
  if ((FORM_RECON as readonly string[]).includes(s))
    return s as ShipmentReconFormType;
  return "other";
}

/** Legacy-like status string for Case Tracker cells / exports */
export function displayCaseStatusLabel(row: CaseTrackerRow): string {
  if (
    row.unitsApproved > 0 &&
    row.unitsClaimed > 0 &&
    row.unitsApproved < row.unitsClaimed
  ) {
    return "partial";
  }
  switch (row.status) {
    case CaseStatus.OPEN:
      return "pending";
    case CaseStatus.IN_PROGRESS:
      return "raised";
    case CaseStatus.RESOLVED:
      return "approved";
    case CaseStatus.REJECTED:
      return "rejected";
    case CaseStatus.CLOSED:
      return "closed";
    default:
      return "pending";
  }
}

export function adjustmentLegacyAdjType(row: ManualAdjustmentRow): string {
  const ref = row.referenceId?.trim();
  if (ref) return ref;
  return "found";
}

export function formatIsoDate(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().split("T")[0];
}
