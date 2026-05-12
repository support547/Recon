import * as React from "react";

import { getSettlementList } from "@/actions/settlement-report";
import { SettlementReportClient } from "@/components/settlement-report/settlement-report-client";

export const dynamic = "force-dynamic";

export default async function SettlementReportPage() {
  let settlements;
  try {
    settlements = await getSettlementList();
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load settlement report
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
      <SettlementReportClient settlements={settlements} />
    </React.Suspense>
  );
}
