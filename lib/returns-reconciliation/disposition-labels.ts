/**
 * Maps raw Amazon return disposition codes to short, professional labels
 * shown in the Returns Reconciliation UI (table cells + filter dropdowns).
 *
 * Amazon sometimes records the customer-damaged disposition as a bare
 * "CUSTOMER", so both that and "CUSTOMER_DAMAGED" map to the same label.
 * Unmapped codes fall back to title-case (e.g. "SOME_CODE" -> "Some Code").
 */
const DISPOSITION_LABELS: Record<string, string> = {
  SELLABLE: "Sellable",
  UNSELLABLE: "Unsellable",
  CUSTOMER: "Cust. Damage",
  CUSTOMER_DAMAGED: "Cust. Damage",
  DAMAGED: "Damaged",
  WAREHOUSE_DAMAGED: "Whse. Damage",
  CARRIER: "Carrier Damage",
  CARRIER_DAMAGED: "Carrier Damage",
  DISTRIBUTOR_DAMAGED: "Dist. Damage",
  DEFECTIVE: "Defective",
  EXPIRED: "Expired",
  RESEARCH: "Research",
};

export function dispositionLabel(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!key || key === "—") return "—";
  return (
    DISPOSITION_LABELS[key] ??
    key
      .toLowerCase()
      .split(/[_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}
