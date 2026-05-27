"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AsinMatchStatus } from "@/lib/returns-reconciliation/types";

const LABEL: Record<AsinMatchStatus, string> = {
  FULLY_VERIFIED: "✓ Verified",
  ASIN_MISMATCH: "⚠ ASIN Mismatch",
  MSKU_MISMATCH: "⚠ MSKU Mismatch",
  MULTI_MISMATCH: "✕ Multi Mismatch",
  NOT_IN_CATALOG: "? Not in Catalog",
  ORDER_NOT_FOUND: "✕ Order Not Found",
};

const CLS: Record<AsinMatchStatus, string> = {
  FULLY_VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ASIN_MISMATCH: "border-red-200 bg-red-50 text-red-700",
  MSKU_MISMATCH: "border-orange-200 bg-orange-50 text-orange-800",
  MULTI_MISMATCH: "border-red-300 bg-red-100 text-red-900 font-extrabold",
  NOT_IN_CATALOG: "border-purple-200 bg-purple-50 text-purple-700",
  ORDER_NOT_FOUND: "border-amber-200 bg-amber-50 text-amber-800",
};

export function AsinMatchBadge({ status }: { status: AsinMatchStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", CLS[status])}
    >
      {LABEL[status]}
    </Badge>
  );
}

export const ASIN_MATCH_STATUS_OPTIONS: { value: AsinMatchStatus; label: string }[] = [
  { value: "FULLY_VERIFIED", label: LABEL.FULLY_VERIFIED },
  { value: "ASIN_MISMATCH", label: LABEL.ASIN_MISMATCH },
  { value: "MSKU_MISMATCH", label: LABEL.MSKU_MISMATCH },
  { value: "MULTI_MISMATCH", label: LABEL.MULTI_MISMATCH },
  { value: "NOT_IN_CATALOG", label: LABEL.NOT_IN_CATALOG },
  { value: "ORDER_NOT_FOUND", label: LABEL.ORDER_NOT_FOUND },
];
