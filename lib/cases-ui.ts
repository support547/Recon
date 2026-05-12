import type { CaseStatus, ReconType } from "@prisma/client";

export function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function caseStatusBadgeClass(status: CaseStatus): string {
  switch (status) {
    case "OPEN":
      return "border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "RESOLVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
    case "CLOSED":
      return "border-slate-200 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

const RECON_BADGE: Record<ReconType, string> = {
  SHIPMENT:
    "border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  REMOVAL:
    "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  RETURN:
    "border-green-200 bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100",
  FC_TRANSFER:
    "border-violet-200 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100",
  REIMBURSEMENT:
    "border-cyan-200 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100",
  FBA_BALANCE:
    "border-slate-200 bg-slate-50 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  GNR: "border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-100",
  REPLACEMENT:
    "border-pink-200 bg-pink-50 text-pink-900 dark:bg-pink-950/40 dark:text-pink-100",
  OTHER:
    "border-gray-200 bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-gray-100",
};

export function reconTypeBadgeClass(reconType: ReconType): string {
  return RECON_BADGE[reconType] ?? RECON_BADGE.OTHER;
}

export function formatMoney(amount: string | null): string {
  if (amount === null || amount === "") return "—";
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateCell(d: Date | string | number | null): string {
  if (d === null || d === undefined) return "—";
  const dt =
    typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function toDatetimeLocalValue(
  d: Date | string | null | undefined,
): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const day = pad(dt.getDate());
  const h = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}
