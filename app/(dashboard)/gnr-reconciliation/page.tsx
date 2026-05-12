import { Suspense } from "react";

import {
  getGnrReconData,
  getGnrReconRemarks,
} from "@/actions/gnr-reconciliation";
import { GnrReconciliationClient } from "@/components/gnr-reconciliation/gnr-reconciliation-client";
import { Skeleton } from "@/components/ui/skeleton";

async function GnrReconciliationLoader() {
  const [payload, remarks] = await Promise.all([
    getGnrReconData({}),
    getGnrReconRemarks().catch(() => ({}) as Record<string, string>),
  ]);
  return (
    <GnrReconciliationClient
      initialPayload={payload}
      initialRemarks={remarks}
    />
  );
}

export default function GnrReconciliationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <GnrReconciliationLoader />
    </Suspense>
  );
}
