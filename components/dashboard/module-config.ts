// Server-safe module config. Lives outside the "use client" boundary so that
// server components (Suspense islands) can read MODULE_CONFIGS as a real array
// rather than the opaque client reference that "use client" exports become.
//
// Icons are NOT stored here because LucideIcon refs would need to cross the
// server -> client boundary as function props (not serializable). Icons are
// looked up per-key from MODULE_ICONS at the point of render.

export type ModuleKey =
  | "shipment"
  | "removal"
  | "returns"
  | "replacement"
  | "fcTransfer"
  | "gnr"
  | "adjustment"
  | "full";

export type ModuleCardConfig = {
  key: ModuleKey;
  name: string;
  href: string;
  caseModuleParam: string;
};

export const MODULE_CONFIGS: ModuleCardConfig[] = [
  { key: "shipment",    name: "Shipment Recon",       href: "/shipment-reconciliation",    caseModuleParam: "shipment" },
  { key: "removal",     name: "Removal Recon",        href: "/removal-reconciliation",     caseModuleParam: "removal" },
  { key: "returns",     name: "Returns Recon",        href: "/returns-reconciliation",     caseModuleParam: "returns" },
  { key: "replacement", name: "Replacement Recon",    href: "/replacement-reconciliation", caseModuleParam: "replacement" },
  { key: "fcTransfer",  name: "FC Transfer Recon",    href: "/fc-transfer-reconciliation", caseModuleParam: "fc-transfer" },
  { key: "gnr",         name: "GNR Recon",            href: "/gnr-reconciliation",         caseModuleParam: "gnr" },
  { key: "adjustment",  name: "Adjustment Recon",     href: "/adjustment-reconciliation",  caseModuleParam: "adjustment" },
  { key: "full",        name: "Full Inventory Recon", href: "/full-reconciliation",        caseModuleParam: "full" },
];
