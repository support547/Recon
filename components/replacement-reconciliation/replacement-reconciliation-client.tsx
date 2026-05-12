"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getReplacementReconData,
  type ReplacementReconciliationPayload,
} from "@/actions/replacement-reconciliation";
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
import { AnalysisTable } from "@/components/replacement-reconciliation/analysis-tab/analysis-table";
import { LogTable } from "@/components/replacement-reconciliation/log-tab/log-table";
import { RaiseCaseModal } from "@/components/replacement-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/replacement-reconciliation/modals/adjust-modal";
import type {
  ReplacementReconRow,
  ReplacementStatusKey,
} from "@/lib/replacement-reconciliation/types";

const ALL = "__all__";

type CardKey = "all" | "returns" | "reimb" | "takeAction";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function ReplacementReconciliationClient({
  initialPayload,
}: {
  initialPayload: ReplacementReconciliationPayload;
}) {
  const [tab, setTab] = React.useState<"analysis" | "log">("analysis");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [filterCard, setFilterCard] = React.useState<CardKey>("all");

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [logRows, setLogRows] = React.useState(initialPayload.logRows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<ReplacementReconRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [adjRow, setAdjRow] = React.useState<ReplacementReconRow | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReplacementReconData({
        from: from || null,
        to: to || null,
        status: status === ALL ? "" : status,
        search: debouncedSearch || undefined,
      });
      setRows(data.rows);
      setLogRows(data.logRows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [from, to, status, debouncedSearch]);

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
        case "returns":
          return r.returnQty > 0;
        case "reimb":
          return r.effectiveReimbQty > 0 || r.effectiveReimbAmount > 0;
        case "takeAction":
          return r.status === "TAKE_ACTION" || r.status === "PARTIAL";
        default:
          return true;
      }
    });
  }, [rows, filterCard]);

  function exportCsv() {
    const headers = [
      "Shipment Date", "MSKU", "ASIN", "Repl. Qty",
      "Replacement Order", "Original Order", "Reason",
      "Returned Qty", "Reimb. Qty", "Reimb. $",
      "Case Status", "Case Count", "Status",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          r.shipmentDate, r.msku, r.asin, r.quantity,
          r.replacementOrderId, r.originalOrderId, r.replacementReasonCode,
          r.returnQty, r.effectiveReimbQty, r.effectiveReimbAmount.toFixed(2),
          r.caseTopStatus, r.caseCount, r.status,
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "replacement_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Replacement Reconciliation</h1>
            <p className="text-xs text-muted-foreground">InvenSync › Replacement Recon</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "analysis" | "log")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="analysis" className="text-xs">📊 Replacement Analysis</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 Replacement Log</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              status={status} setStatus={setStatus}
              search={search} setSearch={setSearch}
              onClear={() => {
                setFrom(""); setTo(""); setStatus(ALL);
                setSearch(""); setFilterCard("all");
              }}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="All Replacements"
                border="blue"
                primary={stats.totalSkus}
                secondary={stats.totalQty}
                secLabel="Units"
                active={filterCard === "all"}
                onClick={() => setFilterCard("all")}
              />
              <KpiCard
                label="Returns Matched"
                border="green"
                primary={stats.returnsMatchedSkus}
                secondary={stats.returnsMatchedQty}
                secLabel="Units"
                active={filterCard === "returns"}
                onClick={() => setFilterCard("returns")}
              />
              <KpiCard
                label="Reimbursements"
                border="teal"
                primary={stats.reimbSkus}
                secondary={Number(stats.reimbAmount.toFixed(0))}
                secLabel="$"
                active={filterCard === "reimb"}
                onClick={() => setFilterCard("reimb")}
              />
              <KpiCard
                label="Take Action"
                border="red"
                primary={stats.takeActionSkus}
                secondary={stats.takeActionQty}
                secLabel="Pending"
                active={filterCard === "takeAction"}
                onClick={() => setFilterCard("takeAction")}
              />
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
              status={status} setStatus={setStatus}
              search={search} setSearch={setSearch}
              hideStatus
              onClear={() => {
                setFrom(""); setTo(""); setSearch("");
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

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "TAKE_ACTION", label: "⚠ Take Action" },
  { value: "PARTIAL", label: "◐ Partial" },
  { value: "RETURNED", label: "↩ Returned" },
  { value: "REIMBURSED", label: "💰 Reimbursed" },
  { value: "RESOLVED", label: "✓ Resolved" },
] satisfies { value: ReplacementStatusKey; label: string }[];

function FilterBar({
  from, setFrom, to, setTo,
  status, setStatus,
  search, setSearch,
  onClear,
  hideStatus,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  status: string; setStatus: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onClear: () => void;
  hideStatus?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground">From</span>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">To</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
      {!hideStatus ? (
        <>
          <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / ASIN / Order ID"
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
