import * as React from "react";

import {
  getFeesReimbursementsData,
  getFeesReimbursementsSettlementList,
} from "@/actions/fees-reimbursements";
import { FeesReimbursementsClient } from "@/components/payment-reconciliation/fees-reimbursements-client";

export const dynamic = "force-dynamic";

export default async function FeesReimbursementsPage() {
  let payload;
  let settlements;
  try {
    [payload, settlements] = await Promise.all([
      getFeesReimbursementsData({}),
      getFeesReimbursementsSettlementList({}),
    ]);
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load fees &amp; reimbursements
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
      <FeesReimbursementsClient
        initialPayload={payload}
        initialSettlements={settlements}
      />
    </React.Suspense>
  );
}
