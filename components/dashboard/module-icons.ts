import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Package,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "./module-config";

// Non-"use client" so both server islands (PriorityList) and client cards
// (CardHeader) can look up icons by ModuleKey without ferrying function refs
// as props across the RSC boundary.

export const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  shipment: Package,
  removal: Truck,
  returns: RotateCcw,
  replacement: RefreshCw,
  fcTransfer: ArrowLeftRight,
  gnr: ClipboardList,
  adjustment: SlidersHorizontal,
  full: Boxes,
};
