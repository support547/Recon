"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getFcTransferReconData,
  type FcTransferReconPayload,
} from "@/actions/fc-transfer-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  SummaryTable,
  FC_SUMMARY_COLUMNS,
} from "@/components/fc-transfer-reconciliation/summary-tab/summary-table";
import {
  AnalysisTable,
  FC_ANALYSIS_COLUMNS,
} from "@/components/fc-transfer-reconciliation/analysis-tab/analysis-table";
import {
  LogTable,
  FC_LOG_COLUMNS,
} from "@/components/fc-transfer-reconciliation/log-tab/log-table";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { RaiseCaseModal } from "@/components/fc-transfer-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/fc-transfer-reconciliation/modals/adjust-modal";
import type {
  FcActionStatus,
  FcAnalysisRow,
} from "@/lib/fc-transfer-reconciliation/types";

type CardKey = "all" | "take-action" | "waiting" | "excess";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function FcTransferReconciliationClient({
  initialPayload,
}: {
  initialPayload: FcTransferReconPayload;
}) {
  const [tab, setTab] = React.useState<"summary" | "analysis" | "log">("analysis");
  const [analysisVis, setAnalysisVis] = useColumnVisibility(
    "fcTransferRecon.analysisCols",
    FC_ANALYSIS_COLUMNS,
  );
  const [summaryVis, setSummaryVis] = useColumnVisibility(
    "fcTransferRecon.summaryCols",
    FC_SUMMARY_COLUMNS,
  );
  const [logVis, setLogVis] = useColumnVisibility(
    "fcTransferRecon.logCols",
    FC_LOG_COLUMNS,
  );
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [fc, setFc] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [filterCard, setFilterCard] = React.useState<CardKey>("all");

  const [payload, setPayload] = React.useState(initialPayload);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<FcAnalysisRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [adjRow, setAdjRow] = React.useState<FcAnalysisRow | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFcTransferReconData({
        from: from || null,
        to: to || null,
        fc: fc || undefined,
        search: debouncedSearch || undefined,
      });
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, fc, debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const filteredAnalysis = React.useMemo(() => {
    if (filterCard === "all") return payload.analysis;
    const target: FcActionStatus =
      filterCard === "take-action" ? "take-action" :
      filterCard === "waiting" ? "waiting" : "excess";
    return payload.analysis.filter((r) => r.actionStatus === target);
  }, [payload.analysis, filterCard]);

  function exportCsv() {
    let headers: string[];
    let dataRows: (string | number)[][];
    let filename: string;
    if (tab === "analysis") {
      headers = [
        "MSKU", "FNSKU", "ASIN", "Title",
        "Net Qty", "Qty In", "Qty Out", "Event Days",
        "First Event", "Imbalance Since", "Days Pending", "Status",
        "Case Approved Qty", "Case Approved $",
      ];
      dataRows = filteredAnalysis.map((r) => [
        r.msku, r.fnsku, r.asin, r.title,
        r.netQty, r.qtyIn, r.qtyOut, r.eventDays,
        r.earliestDate, r.imbalanceStart, r.daysPending, r.actionStatus,
        r.caseApprovedQty, r.caseApprovedAmount.toFixed(2),
      ]);
      filename = "fc_transfer_analysis.csv";
    } else if (tab === "log") {
      headers = [
        "Date", "MSKU", "FNSKU", "ASIN", "Title",
        "Qty", "Event Type", "FC", "Disposition", "Reason",
      ];
      dataRows = payload.logRows.map((r) => [
        r.transferDate, r.msku, r.fnsku, r.asin, r.title,
        r.quantity, r.eventType, r.fulfillmentCenter, r.disposition, r.reason,
      ]);
      filename = "fc_transfer_log.csv";
    } else {
      headers = [
        "MSKU", "FNSKU", "ASIN", "Title",
        "Events", "Net Qty", "Qty In", "Qty Out",
        "Event Types", "Fulfillment Centers",
        "Earliest", "Latest",
      ];
      dataRows = payload.summary.map((r) => [
        r.msku, r.fnsku, r.asin, r.title,
        r.eventCount, r.netQty, r.qtyIn, r.qtyOut,
        r.eventTypes, r.fulfillmentCenters,
        r.earliest, r.latest,
      ]);
      filename = "fc_transfer_summary.csv";
    }
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const row of dataRows) lines.push(row.map(esc).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  const stats = payload.stats;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          {tab === "analysis" ? (
            <ColumnsMenu
              columns={FC_ANALYSIS_COLUMNS}
              visibility={analysisVis}
              onChange={setAnalysisVis}
            />
          ) : tab === "summary" ? (
            <ColumnsMenu
              columns={FC_SUMMARY_COLUMNS}
              visibility={summaryVis}
              onChange={setSummaryVis}
            />
          ) : (
            <ColumnsMenu
              columns={FC_LOG_COLUMNS}
              visibility={logVis}
              onChange={setLogVis}
            />
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
        </HeaderActions>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="analysis" className="text-xs">📈 FC Transfer Analysis</TabsTrigger>
            <TabsTrigger value="summary" className="text-xs">📊 Summary by SKU</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 Transfer Log</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              fc={fc} setFc={setFc}
              search={search} setSearch={setSearch}
              onClear={() => {
                setFrom(""); setTo(""); setFc(""); setSearch(""); setFilterCard("all");
              }}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Take Action >60 Days" border="red" primary={stats.takeActionCount} secondary={stats.takeActionQty} secLabel="Units"
                active={filterCard === "take-action"} onClick={() => setFilterCard(filterCard === "take-action" ? "all" : "take-action")} />
              <KpiCard label="Waiting <60 Days" border="amber" primary={stats.waitingCount} secondary={stats.waitingQty} secLabel="Units"
                active={filterCard === "waiting"} onClick={() => setFilterCard(filterCard === "waiting" ? "all" : "waiting")} />
              <KpiCard label="Excess Stock" border="blue" primary={stats.excessCount} secondary={stats.excessQty} secLabel="Surplus"
                active={filterCard === "excess"} onClick={() => setFilterCard(filterCard === "excess" ? "all" : "excess")} />
              <KpiCard label="Total Unresolved" border="slate" primary={stats.totalUnresolved} secondary={stats.totalUnresolvedQty} secLabel="Missing"
                active={filterCard === "all"} onClick={() => setFilterCard("all")} />
            </div>

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <AnalysisTable
                visibility={analysisVis}
                rows={filteredAnalysis}
                onRaiseCase={(r) => { setCaseRow(r); setCaseOpen(true); }}
                onAdjust={(r) => { setAdjRow(r); setAdjOpen(true); }}
              />
            )}
          </TabsContent>

          <TabsContent value="summary" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              fc={fc} setFc={setFc}
              search={search} setSearch={setSearch}
              onClear={() => {
                setFrom(""); setTo(""); setFc(""); setSearch("");
              }}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Unique SKUs" border="amber" primary={stats.totalSkus} secondary={stats.totalEvents} secLabel="Events" />
              <KpiCard label="Total Qty In" border="green" primary={stats.totalQtyIn} secondary={0} secLabel="Units" hideSecondary />
              <KpiCard label="Total Qty Out" border="red" primary={stats.totalQtyOut} secondary={0} secLabel="Units" hideSecondary />
              <KpiCard label="Total Events" border="blue" primary={stats.totalEvents} secondary={stats.totalSkus} secLabel="SKUs" />
            </div>

            {loading ? <Skeleton className="h-64 w-full" /> : <SummaryTable visibility={summaryVis} rows={payload.summary} />}
          </TabsContent>

          <TabsContent value="log" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              fc={fc} setFc={setFc}
              search={search} setSearch={setSearch}
              onClear={() => {
                setFrom(""); setTo(""); setFc(""); setSearch("");
              }}
            />
            {loading ? <Skeleton className="h-64 w-full" /> : <LogTable visibility={logVis} rows={payload.logRows} />}
          </TabsContent>
        </Tabs>

        <RaiseCaseModal row={caseRow} open={caseOpen} onOpenChange={setCaseOpen} onSaved={() => void reload()} />
        <AdjustModal row={adjRow} open={adjOpen} onOpenChange={setAdjOpen} onSaved={() => void reload()} />
      </div>
    </TooltipProvider>
  );
}

function FilterBar({
  from, setFrom, to, setTo,
  fc, setFc,
  search, setSearch,
  onClear,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  fc: string; setFc: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground">From</span>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">To</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">FC</span>
      <Input value={fc} onChange={(e) => setFc(e.target.value)} placeholder="e.g. PHX7" className="h-8 w-[110px] text-xs" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / FNSKU / ASIN"
        className="h-8 max-w-[260px] text-xs"
      />
      <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={onClear}>Clear</Button>
    </div>
  );
}

function KpiCard({
  label, border, primary, secondary, secLabel, active, onClick, hideSecondary,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate";
  primary: number;
  secondary: number;
  secLabel: string;
  active?: boolean;
  onClick?: () => void;
  hideSecondary?: boolean;
}) {
  const b =
    border === "blue" ? "border-t-blue-600" :
    border === "green" ? "border-t-emerald-500" :
    border === "red" ? "border-t-red-500" :
    border === "amber" ? "border-t-amber-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "amber" ? "text-amber-800" : "text-slate-600";
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-t-[3px]",
        b,
        active ? "ring-2 ring-blue-300" : onClick ? "hover:border-slate-300" : "",
      )}
    >
      <div className="mb-1 text-center text-[8.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-lg font-bold leading-none", c)}>
            {primary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">Count</span>
        </div>
        {!hideSecondary ? (
          <>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex flex-col items-center">
              <span className={cn("font-mono text-sm font-bold leading-none", c)}>
                {secondary.toLocaleString()}
              </span>
              <span className="mt-0.5 text-[8px] text-muted-foreground">{secLabel}</span>
            </div>
          </>
        ) : null}
      </div>
    </Component>
  );
}
