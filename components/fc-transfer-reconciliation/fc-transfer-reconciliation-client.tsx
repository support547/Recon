"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getFcTransferFullRecon,
  type FcFullReconPayload,
} from "@/actions/fc-transfer-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
import { MskuLogModal } from "@/components/fc-transfer-reconciliation/modals/msku-log-modal";
import { LegDrilldownModal } from "@/components/fc-transfer-reconciliation/modals/leg-drilldown-modal";
import {
  FullReconTable,
  FC_FULL_COLUMNS,
} from "@/components/fc-transfer-reconciliation/full-recon-tab/full-recon-table";
import type { Marketplace } from "@/lib/branding/marketplaces";
import type {
  FcFullReconRow,
  FcFullStats,
  FcFullStatus,
} from "@/lib/fc-transfer-reconciliation/full-recon-types";
import type { FcModalTarget } from "@/lib/fc-transfer-reconciliation/modal-target";
import { fcFullCardGroups } from "@/lib/fc-transfer-reconciliation/full-recon";

// Zeroed stats so the partition cards render before the full payload loads.
const EMPTY_FULL_STATS: FcFullStats = {
  totalGroups: 0,
  reconciledCount: 0,
  inTransitCount: 0, inTransitQty: 0,
  shortageCount: 0, shortageQty: 0,
  damagedCount: 0, damagedQty: 0,
  shortageDamagedCount: 0, shortageDamagedQty: 0,
  excessCount: 0, excessQty: 0,
  caseOpenCount: 0, caseOpenQty: 0,
  reimbursedCount: 0, reimbursedQty: 0,
  adjustedCount: 0, adjustedQty: 0,
  totalUnresolvedCount: 0, totalUnresolvedQty: 0,
  distinctMskuCount: 0,
  unknownDispositionQty: 0,
};

// Project a Full-Reconciliation row down to the neutral FcModalTarget the shared
// raise-case / adjust modals consume. The modals key on msku|fnsku|asin, so a
// case/adjustment raised here lands on the same canonical grain. The Full tab no
// longer touches any analysis-tab type.
function fullToModalTarget(r: FcFullReconRow): FcModalTarget {
  return {
    msku: r.msku,
    fnsku: r.fnsku,
    asin: r.asin,
    title: r.title,
    netQty: r.netQty,
    daysPending: r.daysPending,
    imbalanceStart: r.imbalanceStart,
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function FcTransferReconciliationClient({
  initialFullPayload,
  viewSwitcher,
  marketplace = null,
}: {
  initialFullPayload?: FcFullReconPayload;
  // Optional By-MSKU / By-FC pill rendered into the header bar (left of the
  // Columns/Export/Refresh actions). Supplied by FcReconShell; omit for the
  // standalone client (no behavior change).
  viewSwitcher?: React.ReactNode;
  marketplace?: Marketplace | null;
}) {
  // Only two tabs remain: Full Reconciliation (new engine) + Transfer Log.
  const [tab, setTab] = React.useState<"full" | "log">("full");
  const [fullVis, setFullVis] = useColumnVisibility(
    "fcTransferRecon.fullCols",
    FC_FULL_COLUMNS,
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

  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<FcModalTarget | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [adjRow, setAdjRow] = React.useState<FcModalTarget | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);
  const [logRow, setLogRow] = React.useState<FcModalTarget | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);

  // Single source of truth: the full-recon payload (rows + stats + logRows).
  const [fullPayload, setFullPayload] = React.useState<FcFullReconPayload | null>(
    initialFullPayload ?? null,
  );
  // Granular status, "all", or a display-group token set by the TAKE ACTION /
  // RESOLVED cards (the dropdown stays granular and never emits the group tokens).
  const [fullStatusFilter, setFullStatusFilter] =
    React.useState<FcFullStatus | "all" | "GRP_ACTION" | "GRP_RESOLVED">("all");
  const [drillRow, setDrillRow] = React.useState<FcFullReconRow | null>(null);
  const [drillOpen, setDrillOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const full = await getFcTransferFullRecon({
        from: from || null,
        to: to || null,
        fc: fc || undefined,
        search: debouncedSearch || undefined,
      });
      setFullPayload(full);
    } finally {
      setLoading(false);
    }
  }, [from, to, fc, debouncedSearch]);

  // Lazy first-load if not seeded server-side.
  React.useEffect(() => {
    if (fullPayload === null) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  // Display-group tokens -> the granular statuses they roll up. The dropdown
  // stays granular; only the TAKE ACTION / RESOLVED cards emit these tokens.
  const ACTION_STATUSES: FcFullStatus[] = ["SHORTAGE", "DAMAGED_IN_TRANSIT", "SHORTAGE_AND_DAMAGED"];
  const RESOLVED_STATUSES: FcFullStatus[] = ["CASE_OPEN", "REIMBURSED", "ADJUSTED"];

  // Status filter is an EXACT match per status (SHORTAGE_AND_DAMAGED is its own
  // bucket); the two group tokens match any status in their set. Cards always
  // reflect the full set regardless of this filter.
  const filteredFull = React.useMemo(() => {
    const all = fullPayload?.rows ?? [];
    if (fullStatusFilter === "all") return all;
    if (fullStatusFilter === "GRP_ACTION") return all.filter((r) => ACTION_STATUSES.includes(r.status));
    if (fullStatusFilter === "GRP_RESOLVED") return all.filter((r) => RESOLVED_STATUSES.includes(r.status));
    return all.filter((r) => r.status === fullStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPayload, fullStatusFilter]);

  // Card stats reflect the FULL result set (never the status filter). Zeroed
  // fallback so the partition cards render before data loads.
  const fs: FcFullStats = fullPayload?.stats ?? EMPTY_FULL_STATS;
  // Display-only consolidation of the 9 buckets into the 6 KPI cards.
  const cg = fcFullCardGroups(fs);
  const logRows = fullPayload?.logRows ?? [];

  function exportCsv() {
    let headers: string[];
    let dataRows: (string | number)[][];
    let filename: string;
    if (tab === "full") {
      headers = [
        "MSKU", "FNSKU", "ASIN", "Title", "Out FC Count", "In FC Count",
        "Out Total", "Out Sellable", "Out Unsellable",
        "In Total", "In Sellable", "In Unsellable",
        "Net", "Sellable Shortfall", "Quantity Shortage", "Degradation",
        "In-Transit", "Days Pending", "Open Qty", "Status", "Actionable",
        "Reimb Qty", "Unknown Disp Qty",
      ];
      dataRows = filteredFull.map((r) => [
        r.msku, r.fnsku, r.asin, r.title, r.fromFcCount, r.toFcCount,
        r.outQty, r.outSellable, r.outUnsellable,
        r.inQty, r.inSellable, r.inUnsellable,
        r.netQty, r.sellableShortfall, r.quantityShortage, r.degradationQty,
        r.inTransitPending, r.daysPending, r.openQty, r.status, r.actionable ? "yes" : "no",
        r.effectiveReimbQty, r.unknownDispositionQty,
      ]);
      filename = "fc_transfer_full_reconciliation.csv";
    } else {
      headers = [
        "Date", "MSKU", "FNSKU", "ASIN", "Title",
        "Qty", "Event Type", "FC", "Disposition", "Reason",
      ];
      dataRows = logRows.map((r) => [
        r.transferDate, r.msku, r.fnsku, r.asin, r.title,
        r.quantity, r.eventType, r.fulfillmentCenter, r.disposition, r.reason,
      ]);
      filename = "fc_transfer_log.csv";
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

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          {viewSwitcher}
          {tab === "full" ? (
            <ColumnsMenu
              columns={FC_FULL_COLUMNS}
              visibility={fullVis}
              onChange={setFullVis}
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
            <TabsTrigger value="full" className="text-xs">🧾 Full Reconciliation</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 Transfer Log</TabsTrigger>
          </TabsList>

          <TabsContent value="full" className="mt-0 space-y-4">
            <FilterBar
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              fc={fc} setFc={setFc}
              search={search} setSearch={setSearch}
              onClear={() => {
                setFrom(""); setTo(""); setFc(""); setSearch(""); setFullStatusFilter("all");
              }}
            />

            {/* 6 KPI cards — DISPLAY-ONLY consolidation of the 9-bucket partition
                (fcFullStats is unchanged; the dropdown below stays granular).
                Display-grouping invariant: reconciled + inTransit + takeAction
                (shortage+damaged+both) + excess + resolved (case+reimbursed+adjusted)
                === Total. Cards reflect the FULL result set — the status filter only
                filters the table below, never these counts. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Total (All Rows)" border="slate" primary={cg.totalGroups} secondary={fs.distinctMskuCount} secLabel="MSKUs"
                active={fullStatusFilter === "all"} onClick={() => setFullStatusFilter("all")} />
              <KpiCard label="Reconciled" border="green" primary={cg.reconciledCount} secondary={0} secLabel="" hideSecondary
                active={fullStatusFilter === "RECONCILED"} onClick={() => setFullStatusFilter(fullStatusFilter === "RECONCILED" ? "all" : "RECONCILED")} />
              <KpiCard label="In-Transit" border="blue" primary={cg.inTransitCount} secondary={cg.inTransitQty} secLabel="Units"
                active={fullStatusFilter === "IN_TRANSIT"} onClick={() => setFullStatusFilter(fullStatusFilter === "IN_TRANSIT" ? "all" : "IN_TRANSIT")} />
              <KpiCard label="Take Action" border="red" primary={cg.takeActionCount} secondary={cg.takeActionQty} secLabel="Open Units"
                active={fullStatusFilter === "GRP_ACTION"} onClick={() => setFullStatusFilter(fullStatusFilter === "GRP_ACTION" ? "all" : "GRP_ACTION")}
                breakdown={<>Shortage {cg.shortageCount} · Damaged {cg.damagedCount} · Both {cg.shortageDamagedCount}</>} />
              <KpiCard label="Excess" border="blue" primary={cg.excessCount} secondary={cg.excessQty} secLabel="Surplus"
                active={fullStatusFilter === "EXCESS"} onClick={() => setFullStatusFilter(fullStatusFilter === "EXCESS" ? "all" : "EXCESS")} />
              <KpiCard label="Cases & Adjustments" border="teal" primary={cg.resolvedCount} secondary={cg.resolvedQty} secLabel="Units"
                active={fullStatusFilter === "GRP_RESOLVED"} onClick={() => setFullStatusFilter(fullStatusFilter === "GRP_RESOLVED" ? "all" : "GRP_RESOLVED")}
                breakdown={<>Cases {cg.caseOpenCount} <span className="text-orange-600">(open)</span> · Reimb {cg.reimbursedCount} · Adj {cg.adjustedCount}</>} />
            </div>

            {/* Status filtering is driven by the clickable KPI cards above. The
                data-quality warning stays (unrelated to filtering). */}
            {fs.unknownDispositionQty > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                  ⚠ {fs.unknownDispositionQty} units with unknown disposition
                </span>
              </div>
            ) : null}

            {loading || fullPayload === null ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <FullReconTable
                visibility={fullVis}
                rows={filteredFull}
                marketplace={marketplace}
                onRaiseCase={(r) => { setCaseRow(fullToModalTarget(r)); setCaseOpen(true); }}
                onAdjust={(r) => { setAdjRow(fullToModalTarget(r)); setAdjOpen(true); }}
                onDrill={(r) => { setDrillRow(r); setDrillOpen(true); }}
              />
            )}
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
            {loading || fullPayload === null ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <LogTable visibility={logVis} rows={logRows} />
            )}
          </TabsContent>
        </Tabs>

        <RaiseCaseModal row={caseRow} open={caseOpen} onOpenChange={setCaseOpen} onSaved={() => void reload()} />
        <AdjustModal row={adjRow} open={adjOpen} onOpenChange={setAdjOpen} onSaved={() => void reload()} />
        <MskuLogModal row={logRow} logRows={logRows} open={logOpen} onOpenChange={setLogOpen} />
        <LegDrilldownModal row={drillRow} open={drillOpen} onOpenChange={setDrillOpen} />
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
  label, border, primary, secondary, secLabel, active, onClick, hideSecondary, breakdown,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal" | "rose" | "orange" | "violet";
  primary: number;
  secondary: number;
  secLabel: string;
  active?: boolean;
  onClick?: () => void;
  hideSecondary?: boolean;
  breakdown?: React.ReactNode;
}) {
  const b =
    border === "blue" ? "border-t-blue-600" :
    border === "green" ? "border-t-emerald-500" :
    border === "red" ? "border-t-red-500" :
    border === "amber" ? "border-t-amber-500" :
    border === "teal" ? "border-t-teal-500" :
    border === "rose" ? "border-t-rose-500" :
    border === "orange" ? "border-t-orange-500" :
    border === "violet" ? "border-t-violet-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "amber" ? "text-amber-800" :
    border === "teal" ? "text-teal-700" :
    border === "rose" ? "text-rose-700" :
    border === "orange" ? "text-orange-700" :
    border === "violet" ? "text-violet-700" : "text-slate-600";
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
      {breakdown ? (
        <div className="mt-1 text-center text-[8px] leading-tight text-muted-foreground">
          {breakdown}
        </div>
      ) : null}
    </Component>
  );
}
