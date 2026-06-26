import { Suspense } from "react";

import { getFcTransferFullRecon } from "@/actions/fc-transfer-reconciliation";
import { FcReconShell } from "@/components/fc-transfer-reconciliation/fc-recon-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentMarketplace } from "@/lib/branding/server";

async function FcTransferReconciliationLoader({ view }: { view: "msku" | "fc" }) {
  const [fullPayload, marketplace] = await Promise.all([
    getFcTransferFullRecon({}),
    getCurrentMarketplace(),
  ]);
  return (
    <FcReconShell
      initialFullPayload={fullPayload}
      initialView={view}
      marketplace={marketplace}
    />
  );
}

export default async function FcTransferReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
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
      <FcTransferReconciliationLoader view={view === "fc" ? "fc" : "msku"} />
    </Suspense>
  );
}
