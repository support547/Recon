import { Suspense } from "react";

import { getSalesReconData } from "@/actions/sales-recon";
import { SalesReconClient } from "@/components/payment-reconciliation/sales-recon-client";
import { Skeleton } from "@/components/ui/skeleton";

async function SalesReconLoader() {
  const payload = await getSalesReconData({});
  return <SalesReconClient initialPayload={payload} />;
}

export default function SalesReconPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <SalesReconLoader />
    </Suspense>
  );
}
