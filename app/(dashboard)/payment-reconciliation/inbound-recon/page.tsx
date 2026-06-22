import { Suspense } from "react";

import { getInboundReconData } from "@/actions/inbound-recon";
import { InboundReconClient } from "@/components/payment-reconciliation/inbound-recon-client";
import { Skeleton } from "@/components/ui/skeleton";

async function InboundReconLoader() {
  const payload = await getInboundReconData({});
  return <InboundReconClient initialPayload={payload} />;
}

export default function InboundReconPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <InboundReconLoader />
    </Suspense>
  );
}
