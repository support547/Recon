import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { AdjType } from "@prisma/client";

import { Card } from "@/components/ui/card";
import { CaseStatChip } from "@/components/dashboard/ReconDashboardClient";

type AdjRow = { adjType: AdjType; qtyAdjusted: number };

function fmt(n: number) {
  return n.toLocaleString();
}

export async function AdjustmentsBand({
  adjustmentsP,
}: {
  adjustmentsP: Promise<AdjRow[]>;
}) {
  const adj = await adjustmentsP;
  const quantity = adj.filter((a) => a.adjType === AdjType.QUANTITY).length;
  const financial = adj.filter((a) => a.adjType === AdjType.FINANCIAL).length;
  const status = adj.filter((a) => a.adjType === AdjType.STATUS).length;
  const other = adj.filter((a) => a.adjType === AdjType.OTHER).length;
  const totalUnits = adj.reduce((s, a) => s + Math.abs(a.qtyAdjusted), 0);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-blue-500" aria-hidden />
          <h3 className="text-sm font-semibold">Manual Adjustments</h3>
        </div>
        <Link
          href="/cases-adjustments?tab=adjustments"
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <CaseStatChip label="Quantity" value={quantity} tone="blue" />
        <CaseStatChip label="Financial" value={financial} tone="emerald" />
        <CaseStatChip label="Status" value={status} tone="amber" />
        <CaseStatChip label="Other" value={other} tone="slate" />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">
          Total units adjusted:{" "}
          <span className="font-mono tabular-nums text-foreground">
            {fmt(totalUnits)}
          </span>
        </span>
      </div>
    </Card>
  );
}
