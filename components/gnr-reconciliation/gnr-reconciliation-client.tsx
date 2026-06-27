"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getGnrLogData,
  saveGnrReconRemark,
} from "@/actions/gnr-reconciliation";
import type { GnrReconV2Payload } from "@/actions/gnr-reconciliation-v2";
import { HeaderActions } from "@/components/layout/header-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  LogTable,
  GNR_LOG_COLUMNS,
} from "@/components/gnr-reconciliation/log-tab/log-table";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { FbaReconTable } from "@/components/gnr-reconciliation/fba-recon-tab/fba-recon-table";
import type { GnrLogRow } from "@/lib/gnr-reconciliation/types";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function GnrReconciliationClient({
  initialRemarks = {},
  initialV2Payload,
  initialLogRows,
}: {
  initialRemarks?: Record<string, string>;
  initialV2Payload: GnrReconV2Payload;
  initialLogRows: GnrLogRow[];
}) {
  const [tab, setTab] = React.useState<"analysis" | "log">("analysis");
  // By MSKU vs By ASIN (owned here so the tab row can hide for the ASIN view).
  const [view, setView] = React.useState<"msku" | "asin">("msku");

  const [logVis, setLogVis] = useColumnVisibility(
    "gnrRecon.logCols",
    GNR_LOG_COLUMNS,
  );

  const [logRows, setLogRows] = React.useState(initialLogRows);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [loading, setLoading] = React.useState(false);

  // Only the Log tab reloads from the server (search-filtered). The GNR
  // Reconciliation tab is the self-managing FBA Recon v2 table.
  const reloadLog = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGnrLogData({ search: debouncedSearch || undefined });
      setLogRows(data.logRows);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (tab === "log") void reloadLog();
  }, [reloadLog, tab]);

  function exportLogCsv() {
    const headers = [
      "Date", "Source", "Order ID", "LPN", "Value Recovery", "MSKU", "FNSKU",
      "ASIN", "Qty", "Unit Status", "Reason", "Condition", "Used MSKU", "Used FNSKU",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of logRows) {
      lines.push(
        [
          r.reportDate, r.entrySource, r.orderId, r.lpn, r.valueRecoveryType,
          r.msku, r.fnsku, r.asin, r.quantity, r.unitStatus, r.reasonForUnitStatus,
          r.usedCondition, r.usedMsku, r.usedFnsku,
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gnr_log.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {tab === "log" ? (
          <HeaderActions>
            <ColumnsMenu
              columns={GNR_LOG_COLUMNS}
              visibility={logVis}
              onChange={setLogVis}
            />
            <Button variant="outline" size="sm" onClick={exportLogCsv}>⬇ Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void reloadLog()}>↻ Refresh</Button>
          </HeaderActions>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "analysis" | "log")} className="gap-4">
          {/* The GNR Reconciliation / GNR Log tab row is hidden in the By ASIN
              view (that view stands alone — no Log). */}
          {view === "asin" ? null : (
            <TabsList className="h-9 w-full justify-start sm:w-auto">
              <TabsTrigger value="analysis" className="text-xs">📊 GNR Reconciliation</TabsTrigger>
              <TabsTrigger value="log" className="text-xs">📋 GNR Log</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <FbaReconTable
              initialPayload={initialV2Payload}
              initialRemarks={initialRemarks}
              onSaveRemark={saveGnrReconRemark}
              view={view}
              onViewChange={setView}
            />
          </TabsContent>

          <TabsContent value="log" className="mt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Used MSKU / FNSKU / ASIN"
                className="h-8 max-w-[260px] text-xs"
              />
              <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={() => setSearch("")}>Clear</Button>
            </div>

            {loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : (
              <LogTable visibility={logVis} rows={logRows} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
