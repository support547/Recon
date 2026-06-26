import { Suspense } from "react";

import { getFullReconData, getFullReconRemarks } from "@/actions/full-reconciliation";
import { FullReconciliationClient } from "@/components/full-reconciliation/full-reconciliation-client";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentMarketplace } from "@/lib/branding/server";

async function FullReconciliationLoader() {
  const [payload, remarks, marketplace] = await Promise.all([
    getFullReconData({}),
    getFullReconRemarks().catch(() => ({}) as Record<string, string>),
    getCurrentMarketplace(),
  ]);
  return (
    <FullReconciliationClient
      initialPayload={payload}
      initialRemarks={remarks}
      marketplace={marketplace}
    />
  );
}

export default function FullReconciliationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <FullReconciliationLoader />
    </Suspense>
  );
}
