"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getGnrReconData,
  saveGnrReconRemark,
  type GnrReconciliationPayload,
} from "@/actions/gnr-reconciliation";
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
import { AnalysisTable } from "@/components/gnr-reconciliation/analysis-tab/analysis-table";
import { LogTable } from "@/components/gnr-reconciliation/log-tab/log-table";
import { RaiseCaseModal } from "@/components/gnr-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/gnr-reconciliation/modals/adjust-modal";
import type {
  GnrActionStatus,
  GnrReconRow,
} from "@/lib/gnr-reconciliation/types";

const ALL = "__all__";

type CardKey = "all" | "matched" | "takeAction" | "waiting" | "overAccounted";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function GnrReconciliationClient({
  initialPayload,
  initialRemarks = {},
}: {
  initialPayload: GnrReconciliationPayload;
  initialRemarks?: Record<string, string>;
}) {
  const [remarks, setRemarks] = React.useState<Record<string, string>>(
    initialRemarks,
  );
  React.useEffect(() => {
    setRemarks(initialRemarks);
  }, [initialRemarks]);

  const [tab, setTab] = React.useState<"analysis" | "log">("analysis");
  const [status, setStatus] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [filterCard, setFilterCard] = React.useState<CardKey>("all");

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [logRows, setLogRows] = React.useState(initialPayload.logRows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<GnrReconRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [adjRow, setAdjRow] = React.useState<GnrReconRow | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGnrReconData({
        search: debouncedSearch || undefined,
        actionStatus: status === ALL ? "" : cardToStatus(filterCard, status),
      });
      setRows(data.rows);
      setLogRows(data.logRows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [status, filterCard, debouncedSearch]);

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
        case "matched": return r.actionStatus === "matched" || r.actionStatus === "balanced";
        case "takeAction": return r.actionStatus === "take-action";
        case "waiting": return r.actionStatus === "waiting";
        case "overAccounted": return r.actionStatus === "over-accounted";
        default: return true;
      }
    });
  }, [rows, filterCard]);

  function exportCsv() {
    const headers = [
      "Used MSKU", "Used FNSKU", "Orig FNSKU", "ASIN", "Condition",
      "GNR Qty", "Sales", "Returns", "Removals", "Reimb Qty", "Reimb $",
      "Ending Balance", "FBA Balance", "Status",
      "Case Count", "Case Status", "Case Approved Qty", "Adj Qty",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          r.usedMsku, r.usedFnsku, r.origFnsku, r.asin, r.usedCondition,
          r.gnrQty, r.salesQty, r.returnQty, r.removalQty, r.reimbQty, r.reimbAmount.toFixed(2),
          r.endingBalance, r.fbaEnding ?? "", r.actionStatus,
          r.caseCount, r.caseTopStatus, r.caseApprovedQty, r.adjQty,
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gnr_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">GNR Reconciliation</h1>
            <p className="text-xs text-muted-foreground">InvenSync › GNR Recon (Grade &amp; Resell)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "analysis" | "log")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="analysis" className="text-xs">📊 GNR Reconciliation</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 GNR Log</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <FilterBar
              status={status} setStatus={setStatus}
              search={search} setSearch={setSearch}
              onClear={() => {
                setStatus(ALL); setSearch(""); setFilterCard("all");
              }}
            />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Total SKUs"
                border="blue"
                primary={stats.totalSkus}
                secondary={stats.totalGnrQty}
                secLabel="GNR Qty"
                active={filterCard === "all"}
                onClick={() => setFilterCard("all")}
              />
              <KpiCard
                label="Matched"
                border="green"
                primary={stats.matched}
                secondary={stats.balanced}
                secLabel="Balanced"
                active={filterCard === "matched"}
                onClick={() => setFilterCard("matched")}
              />
              <KpiCard
                label="Take Action"
                border="red"
                primary={stats.takeAction}
                secondary={0}
                secLabel=""
                active={filterCard === "takeAction"}
                onClick={() => setFilterCard("takeAction")}
                hideSecondary
              />
              <KpiCard
                label="Waiting (<60d)"
                border="amber"
                primary={stats.waiting}
                secondary={0}
                secLabel=""
                active={filterCard === "waiting"}
                onClick={() => setFilterCard("waiting")}
                hideSecondary
              />
              <KpiCard
                label="Over-Accounted"
                border="purple"
                primary={stats.overAccounted}
                secondary={0}
                secLabel=""
                active={filterCard === "overAccounted"}
                onClick={() => setFilterCard("overAccounted")}
                hideSecondary
              />
              <KpiCard
                label="Review"
                border="slate"
                primary={stats.review}
                secondary={0}
                secLabel=""
                hideSecondary
              />
            </div>

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <AnalysisTable
                rows={filteredRows}
                onRaiseCase={(r) => { setCaseRow(r); setCaseOpen(true); }}
                onAdjust={(r) => { setAdjRow(r); setAdjOpen(true); }}
                remarks={remarks}
                onSaveRemark={async (usedMsku, usedFnsku, next) => {
                  const res = await saveGnrReconRemark(usedMsku, usedFnsku, next);
                  if (res.ok) {
                    setRemarks((prev) => ({
                      ...prev,
                      [`${usedMsku}|${usedFnsku}`]: next,
                    }));
                  }
                  return res;
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="log" className="mt-0 space-y-4">
            <FilterBar
              status={status} setStatus={setStatus}
              search={search} setSearch={setSearch}
              hideStatus
              onClear={() => setSearch("")}
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

function cardToStatus(card: CardKey, current: string): string {
  if (card === "matched") return "matched";
  if (card === "takeAction") return "take-action";
  if (card === "waiting") return "waiting";
  if (card === "overAccounted") return "over-accounted";
  return current;
}

const STATUS_OPTIONS: { value: GnrActionStatus; label: string }[] = [
  { value: "matched", label: "✓ Matched" },
  { value: "take-action", label: "⚠ Take Action" },
  { value: "waiting", label: "⏳ Waiting" },
  { value: "over-accounted", label: "🔄 Over-Accounted" },
  { value: "balanced", label: "✓ Balanced" },
  { value: "review", label: "🔍 Review" },
];

function FilterBar({
  status, setStatus,
  search, setSearch,
  onClear,
  hideStatus,
}: {
  status: string; setStatus: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onClear: () => void;
  hideStatus?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {!hideStatus ? (
        <>
          <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
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
        placeholder="🔍 Used MSKU / FNSKU / ASIN"
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
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal" | "purple";
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
    border === "amber" ? "border-t-amber-500" :
    border === "teal" ? "border-t-teal-500" :
    border === "purple" ? "border-t-purple-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "amber" ? "text-amber-800" :
    border === "teal" ? "text-teal-700" :
    border === "purple" ? "text-purple-700" : "text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
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
          <span className="mt-0.5 text-[8px] text-muted-foreground">SKUs</span>
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
    </button>
  );
}
