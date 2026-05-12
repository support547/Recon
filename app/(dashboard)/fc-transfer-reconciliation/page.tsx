import { Suspense } from "react";

import { getFcTransferReconData } from "@/actions/fc-transfer-reconciliation";
import { FcTransferReconciliationClient } from "@/components/fc-transfer-reconciliation/fc-transfer-reconciliation-client";
import { Skeleton } from "@/components/ui/skeleton";

async function FcTransferReconciliationLoader() {
  const payload = await getFcTransferReconData({});
  return <FcTransferReconciliationClient initialPayload={payload} />;
}

export default function FcTransferReconciliationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <FcTransferReconciliationLoader />
    </Suspense>
  );
}
