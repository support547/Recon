import { Suspense } from "react";

import {
  getGnrLogData,
  getGnrReconRemarks,
} from "@/actions/gnr-reconciliation";
import { getGnrReconV2Data } from "@/actions/gnr-reconciliation-v2";
import { GnrReconciliationClient } from "@/components/gnr-reconciliation/gnr-reconciliation-client";
import { Skeleton } from "@/components/ui/skeleton";

async function GnrReconciliationLoader() {
  const [log, remarks, v2Payload] = await Promise.all([
    getGnrLogData({}),
    getGnrReconRemarks().catch(() => ({}) as Record<string, string>),
    getGnrReconV2Data({}),
  ]);
  return (
    <GnrReconciliationClient
      initialRemarks={remarks}
      initialV2Payload={v2Payload}
      initialLogRows={log.logRows}
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
