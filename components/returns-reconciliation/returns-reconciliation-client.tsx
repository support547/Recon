"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getReturnsReconData,
  type ReturnsReconciliationPayload,
} from "@/actions/returns-reconciliation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnalysisTable } from "@/components/returns-reconciliation/analysis-tab/analysis-table";
import { LogTable } from "@/components/returns-reconciliation/log-tab/log-table";
import { RaiseCaseModal } from "@/components/returns-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/returns-reconciliation/modals/adjust-modal";
import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";

const ALL = "__all__";

type CardKey = "all" | "matched" | "mismatch" | "notFound" | "reimbursed" | "case";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function ReturnsReconciliationClient({
  initialPayload,
}: {
  initialPayload: ReturnsReconciliationPayload;
}) {
  const [tab, setTab] = React.useState<"analysis" | "log">("analysis");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [disposition, setDisposition] = React.useState(ALL);
  const [fnskuStatus, setFnskuStatus] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [filterCard, setFilterCard] = React.useState<CardKey>("all");

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [logRows, setLogRows] = React.useState(initialPayload.logRows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<ReturnsReconRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [adjRow, setAdjRow] = React.useState<ReturnsReconRow | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);

  const dispositionOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of initialPayload.logRows) {
      if (r.disposition) set.add(r.disposition);
    }
    return Array.from(set).sort();
  }, [initialPayload.logRows]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReturnsReconData({
        from: from || null,
        to: to || null,
        disposition: disposition === ALL ? "" : disposition,
        fnskuStatus: fnskuStatus === ALL ? "" : cardToFnskuStatus(filterCard, fnskuStatus),
        search: debouncedSearch || undefined,
      });
      setRows(data.rows);
      setLogRows(data.logRows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [from, to, disposition, fnskuStatus, filterCard, debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const filteredRows = React.useMemo(() => {
    if (filterCard === "all") return rows;
    return rows.filter((r) => {
      switch (filterCard) {
        case "matched":
          return r.fnskuStatus === "MATCHED_FNSKU";
        case "mismatch":
          return r.fnskuStatus === "FNSKU_MISMATCH";
        case "notFound":
          return r.fnskuStatus === "ORDER_NOT_FOUND";
        case "reimbursed":
          return r.effReimbAmount > 0;
        case "case":
          return r.caseCount > 0;
        default:
          return true;
      }
    });
  }, [rows, filterCard]);

  function exportCsv() {
    const headers = [
      "Order ID", "Return FNSKU", "MSKU", "ASIN", "Title",
      "Returned Qty", "Events", "Dispositions", "Reasons",
      "Reimb Qty", "Reimb $", "Sales FNSKU", "FNSKU Status",
      "Case Status", "Case Count", "Earliest Return", "Latest Return",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          r.orderId, r.returnFnsku, r.msku, r.asin, r.title,
          r.totalReturned, r.returnEvents, r.dispositions, r.reasons,
          r.effReimbQty, r.effReimbAmount.toFixed(2), r.salesFnsku, r.fnskuStatus,
          r.caseStatusTop, r.caseCount, r.earliestReturn, r.latestReturn,
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "returns_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Returns Reconciliation</h1>
            <p className="text-xs text-muted-foreground">InvenSync › Returns Recon</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "analysis" | "log")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="analysis" className="text-xs">📊 Returns Analysis</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 Returns Log</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              disposition={disposition} setDisposition={setDisposition}
              fnskuStatus={fnskuStatus} setFnskuStatus={setFnskuStatus}
              search={search} setSearch={setSearch}
              dispositionOptions={dispositionOptions}
              onClear={() => {
                setFrom(""); setTo(""); setDisposition(ALL); setFnskuStatus(ALL);
                setSearch(""); setFilterCard("all");
              }}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Total Returns" border="blue" primary={stats.totalRows} secondary={stats.totalQty} secLabel="Units"
                active={filterCard === "all"} onClick={() => setFilterCard("all")} />
              <KpiCard label="Matched FNSKU" border="green" primary={stats.matchedSkus} secondary={stats.matchedQty} secLabel="Units"
                active={filterCard === "matched"} onClick={() => setFilterCard("matched")} />
              <KpiCard label="FNSKU Mismatch" border="red" primary={stats.mismatchSkus} secondary={stats.mismatchQty} secLabel="Units"
                active={filterCard === "mismatch"} onClick={() => setFilterCard("mismatch")} />
              <KpiCard label="Order Not Found" border="amber" primary={stats.notFoundSkus} secondary={stats.notFoundQty} secLabel="Units"
                active={filterCard === "notFound"} onClick={() => setFilterCard("notFound")} />
              <KpiCard label="Reimbursed" border="teal" primary={stats.reimbSkus} secondary={Number(stats.reimbAmount.toFixed(0))} secLabel="$"
                active={filterCard === "reimbursed"} onClick={() => setFilterCard("reimbursed")} />
              <KpiCard label="With Cases" border="slate" primary={stats.withCaseSkus} secondary={stats.sellableSkus} secLabel="Sellable"
                active={filterCard === "case"} onClick={() => setFilterCard("case")} />
            </div>

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <AnalysisTable
                rows={filteredRows}
                onRaiseCase={(r) => { setCaseRow(r); setCaseOpen(true); }}
                onAdjust={(r) => { setAdjRow(r); setAdjOpen(true); }}
              />
            )}
          </TabsContent>

          <TabsContent value="log" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              disposition={disposition} setDisposition={setDisposition}
              fnskuStatus={fnskuStatus} setFnskuStatus={setFnskuStatus}
              search={search} setSearch={setSearch}
              dispositionOptions={dispositionOptions}
              hideFnskuStatus
              onClear={() => {
                setFrom(""); setTo(""); setDisposition(ALL); setSearch("");
              }}
            />

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <LogTable rows={logRows} />
            )}
          </TabsContent>
        </Tabs>

        <RaiseCaseModal row={caseRow} open={caseOpen} onOpenChange={setCaseOpen} onSaved={() => void reload()} />
        <AdjustModal row={adjRow} open={adjOpen} onOpenChange={setAdjOpen} onSaved={() => void reload()} />
      </div>
    </TooltipProvider>
  );
}

function cardToFnskuStatus(card: CardKey, current: string): string {
  if (card === "matched") return "MATCHED_FNSKU";
  if (card === "mismatch") return "FNSKU_MISMATCH";
  if (card === "notFound") return "ORDER_NOT_FOUND";
  return current;
}

function FilterBar({
  from, setFrom, to, setTo,
  disposition, setDisposition,
  fnskuStatus, setFnskuStatus,
  search, setSearch,
  dispositionOptions,
  onClear,
  hideFnskuStatus,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  disposition: string; setDisposition: (v: string) => void;
  fnskuStatus: string; setFnskuStatus: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  dispositionOptions: string[];
  onClear: () => void;
  hideFnskuStatus?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground">From</span>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">To</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">Disposition</span>
      <Select value={disposition} onValueChange={setDisposition}>
        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="All" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {dispositionOptions.map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hideFnskuStatus ? (
        <>
          <span className="text-[11px] font-semibold text-muted-foreground">FNSKU Status</span>
          <Select value={fnskuStatus} onValueChange={setFnskuStatus}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="MATCHED_FNSKU">✓ Matched FNSKU</SelectItem>
              <SelectItem value="FNSKU_MISMATCH">⚠ FNSKU Mismatch</SelectItem>
              <SelectItem value="ORDER_NOT_FOUND">✕ Order Not Found</SelectItem>
            </SelectContent>
          </Select>
        </>
      ) : null}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / FNSKU / ASIN / Order ID"
        className="h-8 max-w-[260px] text-xs"
      />
      <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={onClear}>Clear</Button>
    </div>
  );
}

function KpiCard({
  label, border, primary, secondary, secLabel, active, onClick,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: number;
  secondary: number;
  secLabel: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const b =
    border === "blue" ? "border-t-blue-600" :
    border === "green" ? "border-t-emerald-500" :
    border === "red" ? "border-t-red-500" :
    border === "amber" ? "border-t-amber-500" :
    border === "teal" ? "border-t-teal-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "amber" ? "text-amber-800" :
    border === "teal" ? "text-teal-700" : "text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-t-[3px]",
        b,
        active ? "ring-2 ring-blue-300" : "hover:border-slate-300",
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
          <span className="mt-0.5 text-[8px] text-muted-foreground">SKUs</span>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-sm font-bold leading-none", c)}>
            {secondary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">{secLabel}</span>
        </div>
      </div>
    </button>
  );
}
