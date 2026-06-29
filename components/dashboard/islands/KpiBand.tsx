import * as React from "react";

import { KpiCard } from "@/components/dashboard/ReconDashboardClient";

type AggSum = { _sum: { quantity: number | null } };
export type FlowAggT = [AggSum, AggSum, AggSum, AggSum, AggSum];

export async function KpiBand({
  flowP,
  unrecoveredSlot,
}: {
  flowP: Promise<FlowAggT | null>;
  unrecoveredSlot: React.ReactNode;
}) {
  const flow = await flowP;
  const shipped = flow?.[0]._sum.quantity ?? 0;
  const received = flow?.[1]._sum.quantity ?? 0;
  const sold = flow?.[2]._sum.quantity ?? 0;
  const returnsTotal = flow?.[3]._sum.quantity ?? 0;
  const reimbursed = flow?.[4]._sum.quantity ?? 0;
  const netShortage = Math.max(shipped - received, 0);
  return (
    <>
      <KpiCard label="Shipped to FBA" value={shipped} accent="blue" iconKey="upload" />
      <KpiCard label="FBA Received" value={received} accent="violet" iconKey="package" />
      <KpiCard
        label="Net Shortage"
        value={netShortage}
        accent={netShortage > 0 ? "red" : "slate"}
        iconKey="trendingDown"
        href="/shipment-reconciliation"
        delta={
          shipped > 0
            ? `${((netShortage / shipped) * 100).toFixed(1)}%`
            : undefined
        }
      />
      <KpiCard label="Sold" value={sold} accent="emerald" iconKey="shoppingCart" />
      <KpiCard
        label="Returns"
        value={returnsTotal}
        accent="orange"
        iconKey="rotateCcw"
        href="/returns-reconciliation"
      />
      <KpiCard
        label="Reimbursed"
        value={reimbursed}
        accent="amber"
        iconKey="dollarSign"
      />
      {unrecoveredSlot}
    </>
  );
}
