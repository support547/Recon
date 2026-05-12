import * as React from "react";

import { getSalesOrders } from "@/actions/sales-orders";
import { SalesOrdersClient } from "@/components/sales-orders/sales-orders-client";

export const dynamic = "force-dynamic";

export default async function SalesOrdersPage() {
  let payload;
  try {
    payload = await getSalesOrders({});
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load sales orders
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }
  return (
    <React.Suspense fallback={null}>
      <SalesOrdersClient initialPayload={payload} />
    </React.Suspense>
  );
}
