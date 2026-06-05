"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getAsinVerificationData,
  getReturnsReconData,
  type ReturnsReconciliationPayload,
} from "@/actions/returns-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
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
import { ActionQueuePanel } from "@/components/returns-reconciliation/analysis-tab/action-queue-panel";
import {
  LogTable,
  RETURNS_LOG_COLUMNS,
} from "@/components/returns-reconciliation/log-tab/log-table";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { RaiseCaseModal } from "@/components/returns-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/returns-reconciliation/modals/adjust-modal";
import {
  ASIN_VERIFICATION_COLUMNS,
  AsinVerificationTable,
} from "@/components/returns-reconciliation/asin-verification-tab/asin-verification-table";
import { ASIN_MATCH_STATUS_OPTIONS } from "@/components/returns-reconciliation/asin-verification-tab/asin-match-badge";
import type {
  AsinVerificationRow,
  AsinVerificationStats,
  ReturnsReconRow,
} from "@/lib/returns-reconciliation/types";

const ALL = "__all__";

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
  const [tab, setTab] = React.useState<"analysis" | "log" | "asin">("analysis");
  const [logVis, setLogVis] = useColumnVisibility(
    "returnsRecon.logCols",
    RETURNS_LOG_COLUMNS,
  );
  const [asinVis, setAsinVis] = useColumnVisibility(
    "returnsRecon.asinCols",
    ASIN_VERIFICATION_COLUMNS,
  );
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [disposition, setDisposition] = React.useState(ALL);
  const [fnskuStatus, setFnskuStatus] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [logRows, setLogRows] = React.useState(initialPayload.logRows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<ReturnsReconRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  // Pre-filled case reason from the Action Queue. NOTE: RaiseCaseModal does not
  // yet accept a reason prop, so the value is plumbed but has no visible effect
  // until the modal exposes one. Only the setter is consumed for now (the value
  // getter is intentionally dropped to stay lint-clean without a modal edit).
  const [, setPrefillCaseReason] = React.useState("");
  const [adjRow, setAdjRow] = React.useState<ReturnsReconRow | null>(null);
  const [adjOpen, setAdjOpen] = React.useState(false);

  const handleRaiseCase = React.useCallback(
    (row: ReturnsReconRow, prefillReason?: string) => {
      setCaseRow(row);
      setPrefillCaseReason(prefillReason ?? "");
      setCaseOpen(true);
    },
    [],
  );

  const handleAdjust = React.useCallback((row: ReturnsReconRow) => {
    setAdjRow(row);
    setAdjOpen(true);
  }, []);

  // ASIN Verification state (lazy-loaded on first activation)
  const [asinRows, setAsinRows] = React.useState<AsinVerificationRow[]>([]);
  const [asinStats, setAsinStats] = React.useState<AsinVerificationStats>({
    total: 0,
    totalQty: 0,
    verifiedCount: 0,
    verifiedQty: 0,
    asinMismatchCount: 0,
    asinMismatchQty: 0,
    mskuMismatchCount: 0,
    mskuMismatchQty: 0,
    multiMismatchCount: 0,
    multiMismatchQty: 0,
    notInCatalogCount: 0,
    notInCatalogQty: 0,
    orderNotFoundCount: 0,
    orderNotFoundQty: 0,
    sellableMismatchCount: 0,
    sellableMismatchQty: 0,
  });
  const [asinLoading, setAsinLoading] = React.useState(false);
  const [asinMatchStatus, setAsinMatchStatus] = React.useState(ALL);
  const asinLoadedRef = React.useRef(false);

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
        fnskuStatus: fnskuStatus === ALL ? "" : fnskuStatus,
        search: debouncedSearch || undefined,
      });
      setRows(data.rows);
      setLogRows(data.logRows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [from, to, disposition, fnskuStatus, debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const reloadAsin = React.useCallback(async () => {
    setAsinLoading(true);
    try {
      const data = await getAsinVerificationData({
        from: from || null,
        to: to || null,
        disposition: disposition === ALL ? "" : disposition,
        search: debouncedSearch || undefined,
        matchStatus: asinMatchStatus === ALL ? "" : asinMatchStatus,
      });
      setAsinRows(data.rows);
      setAsinStats(data.stats);
      asinLoadedRef.current = true;
    } finally {
      setAsinLoading(false);
    }
  }, [from, to, disposition, debouncedSearch, asinMatchStatus]);

  // Lazy-load on first activation OR when filters change while tab is active.
  React.useEffect(() => {
    if (tab !== "asin") return;
    void reloadAsin();
  }, [tab, reloadAsin]);

  function asinToReturnsRow(r: AsinVerificationRow): ReturnsReconRow {
    // Adapter — modals only consume a subset of ReturnsReconRow fields.
    // Map ASIN-tab match status onto the new ownership/final status model.
    const ownershipStatus =
      r.matchStatus === "ORDER_NOT_FOUND" ? "ORDER_NOT_FOUND" : "CONFIRMED";
    return {
      orderId: r.orderId,
      returnFnsku: r.returnFnsku,
      lpn: "",
      msku: r.returnMsku,
      asin: r.returnAsin,
      title: r.returnTitle,
      totalReturned: r.returnedQty,
      sellableQty: r.isSellable ? r.returnedQty : 0,
      unsellableQty: r.isSellable ? 0 : r.returnedQty,
      returnEvents: r.returnEvents,
      dispositions: r.disposition,
      reasons: r.reasons,
      isSellable: r.isSellable,
      isGnrMsku: false,
      amazonStatus: "",
      ownershipStatus,
      salesMsku: r.salesMsku,
      gnrStatus: "",
      inventoryStatus: "NOT_APPLICABLE",
      fbaSummaryConfirmedQty: 0,
      fbaSummaryExpectedQty: 0,
      reimbStatus: "NOT_APPLICABLE",
      reimbQty: r.reimbQty,
      reimbCashQty: 0,
      reimbInventoryQty: 0,
      reimbAmount: r.reimbAmount,
      caseCount: r.caseCount,
      caseReimbQty: 0,
      caseReimbAmount: 0,
      caseStatusTop: r.caseStatusTop,
      caseIds: r.caseIds,
      adjQty: 0,
      effReimbQty: r.reimbQty,
      effReimbAmount: r.reimbAmount,
      earliestReturn: r.earliestReturn,
      latestReturn: r.latestReturn,
      daysSinceReturn: -1,
      isWithinWindow: false,
      finalStatus: "INVESTIGATE",
    };
  }

  function exportCsv() {
    const headers = [
      "Order ID", "Return FNSKU", "MSKU", "ASIN", "Title",
      "Returned Qty", "Events", "Dispositions", "Reasons",
      "Reimb Qty", "Reimb $", "Sales MSKU", "Ownership", "Final Status",
      "Case Status", "Case Count", "Earliest Return", "Latest Return",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.orderId, r.returnFnsku, r.msku, r.asin, r.title,
          r.totalReturned, r.returnEvents, r.dispositions, r.reasons,
          r.effReimbQty, r.effReimbAmount.toFixed(2), r.salesMsku, r.ownershipStatus, r.finalStatus,
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
        <HeaderActions>
          {tab === "analysis" ? null : tab === "log" ? (
            <ColumnsMenu
              columns={RETURNS_LOG_COLUMNS}
              visibility={logVis}
              onChange={setLogVis}
            />
          ) : (
            <ColumnsMenu
              columns={ASIN_VERIFICATION_COLUMNS}
              visibility={asinVis}
              onChange={setAsinVis}
            />
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
        </HeaderActions>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "analysis" | "log" | "asin")} className="gap-4">
          <TabsList className="h-9 w-full justify-start sm:w-auto">
            <TabsTrigger value="analysis" className="text-xs">📊 Returns Analysis</TabsTrigger>
            <TabsTrigger value="log" className="text-xs">📋 Returns Log</TabsTrigger>
            <TabsTrigger value="asin" className="text-xs">🔍 ASIN Verification</TabsTrigger>
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
                setSearch("");
              }}
            />

            {/* Compact summary bar */}
            <div className="mb-3 grid grid-cols-6 gap-2">
              {[
                {
                  label: "Total Returns",
                  value: stats.totalRows,
                  sub: `${stats.totalQty.toLocaleString()} units`,
                  color: "text-foreground",
                },
                {
                  label: "Need Action",
                  value: stats.caseNeededRows + stats.unknownGnrCaseRows,
                  sub:
                    `${stats.notInInventoryRows} not in inventory · ` +
                    `${stats.unknownGnrCaseRows} unknown GNR`,
                  color: "text-red-600",
                },
                {
                  label: "Investigate",
                  value: stats.investigateRows,
                  sub: "order not in sales / reimb unverified",
                  color: "text-amber-600",
                },
                {
                  label: "GNR Tracking",
                  value: stats.gnrTrackingRows + stats.transferredToGnrRows,
                  sub:
                    `${stats.gnrTrackingRows} by FNSKU match · ` +
                    `${stats.transferredToGnrRows} by LPN transfer`,
                  color: "text-purple-600",
                },
                {
                  label: "Pending",
                  value: stats.pendingRows,
                  sub: "within 60-day Amazon SLA",
                  color: "text-slate-500",
                },
                {
                  label: "Resolved",
                  value: stats.resolvedRows,
                  sub: `${stats.inInventoryRows} in inventory · ${stats.reimbursedRows} reimbursed`,
                  color: "text-emerald-600",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className={cn("font-mono text-xl font-semibold tabular-nums", s.color)}>
                    {s.value.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-medium text-foreground">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                </div>
              ))}
            </div>

            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ActionQueuePanel
                rows={rows}
                externalDisposition={disposition === ALL ? "" : disposition}
                externalSearch={debouncedSearch}
                externalFnskuStatus={fnskuStatus === ALL ? "" : fnskuStatus}
                onRaiseCase={(row, caseReason) => handleRaiseCase(row, caseReason)}
                onAdjust={(row) => handleAdjust(row)}
              />
            )}
          </TabsContent>

          <TabsContent value="asin" className="mt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-[11px] font-semibold text-muted-foreground">From</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <span className="text-[11px] font-semibold text-muted-foreground">To</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <span className="text-[11px] font-semibold text-muted-foreground">Disposition</span>
              <Select value={disposition} onValueChange={setDisposition}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {dispositionOptions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] font-semibold text-muted-foreground">Match Status</span>
              <Select value={asinMatchStatus} onValueChange={setAsinMatchStatus}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  {ASIN_MATCH_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 MSKU / FNSKU / ASIN / Order ID"
                className="h-8 max-w-[260px] text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setDisposition(ALL);
                  setAsinMatchStatus(ALL);
                  setSearch("");
                }}
              >
                Clear
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              <KpiCard
                label="Total"
                border="blue"
                primary={asinStats.total}
                secondary={asinStats.totalQty}
                secLabel="Units"
              />
              <KpiCard
                label="Verified"
                border="green"
                primary={asinStats.verifiedCount}
                secondary={asinStats.verifiedQty}
                secLabel="Units"
              />
              <KpiCard
                label="ASIN Mismatch"
                border="red"
                primary={asinStats.asinMismatchCount}
                secondary={asinStats.asinMismatchQty}
                secLabel="Units"
              />
              <KpiCard
                label="MSKU Mismatch"
                border="amber"
                primary={asinStats.mskuMismatchCount}
                secondary={asinStats.mskuMismatchQty}
                secLabel="Units"
              />
              <KpiCard
                label="Multi Mismatch"
                border="red"
                primary={asinStats.multiMismatchCount}
                secondary={asinStats.multiMismatchQty}
                secLabel="Units"
              />
              <KpiCard
                label="Not in Catalog"
                border="slate"
                primary={asinStats.notInCatalogCount}
                secondary={asinStats.notInCatalogQty}
                secLabel="Units"
              />
              <button
                type="button"
                onClick={() => setAsinMatchStatus(ALL)}
                className={cn(
                  "flex flex-col rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-left shadow-sm transition border-t-[3px] border-t-red-600 hover:border-red-400",
                )}
              >
                <div className="mb-1 text-center text-[8.5px] font-bold uppercase tracking-wide text-red-700">
                  ⚠ Sellable Mismatch
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-lg font-bold leading-none text-red-700">
                      {asinStats.sellableMismatchCount.toLocaleString()}
                    </span>
                    <span className="mt-0.5 text-[8px] text-red-700/80">SKUs</span>
                  </div>
                  <div className="h-5 w-px bg-red-200" />
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-sm font-bold leading-none text-red-700">
                      {asinStats.sellableMismatchQty.toLocaleString()}
                    </span>
                    <span className="mt-0.5 text-[8px] text-red-700/80">Units</span>
                  </div>
                </div>
              </button>
            </div>

            {asinLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <AsinVerificationTable
                visibility={asinVis}
                rows={asinRows}
                onRaiseCase={(r) => {
                  setCaseRow(asinToReturnsRow(r));
                  setCaseOpen(true);
                }}
                onAdjust={(r) => {
                  setAdjRow(asinToReturnsRow(r));
                  setAdjOpen(true);
                }}
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
              <LogTable visibility={logVis} rows={logRows} />
            )}
          </TabsContent>
        </Tabs>

        <RaiseCaseModal
          row={caseRow}
          open={caseOpen}
          onOpenChange={setCaseOpen}
          onSaved={() => {
            void reload();
            if (asinLoadedRef.current) void reloadAsin();
          }}
        />
        <AdjustModal
          row={adjRow}
          open={adjOpen}
          onOpenChange={setAdjOpen}
          onSaved={() => {
            void reload();
            if (asinLoadedRef.current) void reloadAsin();
          }}
        />
      </div>
    </TooltipProvider>
  );
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
              <SelectItem value="CONFIRMED">✓ Confirmed</SelectItem>
              <SelectItem value="GNR_TRACKING">↻ GNR Tracking</SelectItem>
              <SelectItem value="TRANSFERRED_TO_GNR">
                ↻ Transferred to GNR (LPN)
              </SelectItem>
              <SelectItem value="UNKNOWN_GNR">✕ Unknown GNR</SelectItem>
              <SelectItem value="ORDER_NOT_FOUND">? Order Not Found</SelectItem>
              <SelectItem value="CASE_NEEDED">⚠ Case Needed</SelectItem>
              <SelectItem value="PENDING">⏱ Pending</SelectItem>
              <SelectItem value="RESOLVED">✓ Resolved</SelectItem>
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
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal" | "purple" | "orange";
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
    border === "teal" ? "border-t-teal-500" :
    border === "purple" ? "border-t-purple-500" :
    border === "orange" ? "border-t-orange-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "amber" ? "text-amber-800" :
    border === "teal" ? "text-teal-700" :
    border === "purple" ? "text-purple-700" :
    border === "orange" ? "text-orange-700" : "text-slate-600";
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
