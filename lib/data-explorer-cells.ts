/** Chip variant logic aligned with legacy reports.html `dc` / `sc` helpers */

export type ChipVariant =
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "teal"
  | "grey"
  | "purple"
  | "orange";

const DISP_MAP: Record<string, ChipVariant> = {
  SELLABLE: "green",
  UNSELLABLE: "red",
  DAMAGED: "red",
  CUSTOMER_DAMAGED: "red",
  EXPIRED: "yellow",
  DEFECTIVE: "yellow",
  RESEARCH: "yellow",
  WAREHOUSE_DAMAGED: "red",
};

const STATUS_MAP: Record<string, ChipVariant> = {
  Closed: "grey",
  Receiving: "blue",
  Working: "yellow",
  Shipped: "teal",
  Completed: "green",
  Cancelled: "red",
  Pending: "yellow",
  Processing: "blue",
  CANCELLED: "red",
  COMPLETED: "green",
  PENDING: "yellow",
  PROCESSING: "blue",
};

export function dispositionChipVariant(value: unknown): ChipVariant {
  const k = String(value ?? "")
    .trim()
    .toUpperCase();
  return DISP_MAP[k] ?? "grey";
}

export function statusChipVariant(value: unknown): ChipVariant {
  const raw = String(value ?? "").trim();
  return STATUS_MAP[raw] ?? STATUS_MAP[raw.toUpperCase()] ?? "grey";
}

export function unitStatusChipVariant(value: unknown): ChipVariant {
  const k = String(value ?? "")
    .trim()
    .toUpperCase();
  if (/DAMAG|DEFECT|UNSELL|LOST|REJECT/i.test(k)) return "red";
  if (/SELL|GOOD|ACCEPT|GRAD/i.test(k)) return "green";
  if (/PEND|PROCESS|WORK/i.test(k)) return "yellow";
  return "grey";
}
