"use client";

import * as React from "react";
import { toast } from "sonner";

import {
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
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MskuReturnTable } from "@/components/returns-reconciliation/analysis-tab/msku-return-table";
import { dispositionLabel } from "@/lib/returns-reconciliation/disposition-labels";
import {
  returnActionStatus,
  RETURN_ACTION_BADGE,
  RETURN_ACTION_STATUS_ORDER,
  SETTLED_STATUSES,
  tallyReturnActionStatus,
  type StatusCardFilter,
  type ReturnActionStatus,
} from "@/lib/returns-reconciliation/return-action-status";
import { AsinSummaryTable } from "@/components/returns-reconciliation/asin-tab/asin-summary-table";
import { RaiseCaseModal } from "@/components/returns-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/returns-reconciliation/modals/adjust-modal";
import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";

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
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [disposition, setDisposition] = React.useState(ALL);
  // Status filter shared by the cards + the Status dropdown. "__all__" = no
  // filter; otherwise a card group ("SETTLED") or an individual status.
  const [fnskuStatus, setFnskuStatus] = React.useState<string>(ALL);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);

  // Normalised value handed to the table ("__all__" → "ALL").
  const statusFilter = (fnskuStatus === ALL ? "ALL" : fnskuStatus) as
    | StatusCardFilter
    | ReturnActionStatus;

  // Toggle a card group: click active card (or Total) clears back to ALL.
  const onCard = (value: StatusCardFilter) =>
    setFnskuStatus((cur) =>
      cur === value || (value === "ALL" && cur === ALL) ? ALL : value,
    );

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [byAsinRows, setByAsinRows] = React.useState(initialPayload.asinRows);
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState<"msku" | "asin">("msku");

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


  const dispositionOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of initialPayload.logRows) {
      if (r.disposition) set.add(r.disposition);
    }
    return Array.from(set).sort();
  }, [initialPayload.logRows]);

  // Global status tally for the stat cards (full date/disposition/search scope,
  // unaffected by the active status filter — only the table below reacts).
  const tally = React.useMemo(() => tallyReturnActionStatus(rows), [rows]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReturnsReconData({
        from: from || null,
        to: to || null,
        disposition: disposition === ALL ? "" : disposition,
        search: debouncedSearch || undefined,
      });
      setRows(data.rows);
      setByAsinRows(data.asinRows);
    } finally {
      setLoading(false);
    }
  }, [from, to, disposition, debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function downloadCsv(lines: string[], filename: string) {
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  function exportMskuCsv() {
    // Columns mirror the on-screen By-MSKU table, in display order.
    const headers = [
      "Order ID", "Return Date", "FNSKU", "ASIN", "Title", "MSKU",
      "LPN", "FC", "Disposition",
      "Return Qty", "Inv Qty", "Reimb Qty", "GNR Qty",
      "Case Qty", "Case Status", "Adjustment Qty", "Status",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const { status } = returnActionStatus(r);
      lines.push(
        [
          r.orderId,
          r.latestReturn || r.earliestReturn,
          r.returnFnsku,
          r.asin,
          r.title,
          r.msku,
          r.lpnAll.length ? r.lpnAll.join(" | ") : r.lpn,
          r.fc,
          r.dispositions
            .split(",")
            .map((d) => dispositionLabel(d))
            .join(" | "),
          r.totalReturned,
          r.inventoryQty,
          r.reimbOrderMskuQty,
          r.gnrLpnQty,
          r.caseCount > 0 ? r.caseClaimedQty : "",
          r.caseCount > 0 ? r.caseStatusTop : "",
          r.adjQty !== 0 ? r.adjQty : "",
          RETURN_ACTION_BADGE[status].label,
        ].map(esc).join(","),
      );
    }
    downloadCsv(lines, "returns_recon_by_msku.csv");
  }

  function exportAsinCsv() {
    const headers = [
      "ASIN", "Title", "Returned", "Inventory Qty",
      "Inventory (FBA Summary)", "Inventory (GNR)", "Inventory (Transfer GNR)",
      "Reimbursed", "Adjusted", "Pending", "Status",
    ];
    const lines = [headers.join(",")];
    for (const r of byAsinRows) {
      lines.push(
        [
          r.asin, r.title, r.returnedQty, r.inventoryQty,
          r.inventoryFbaQty, r.gnrQty, r.transferredGnrQty,
          r.reimbursedQty, r.adjustedQty, r.pendingQty, r.asinStatus,
        ].map(esc).join(","),
      );
    }
    downloadCsv(lines, "returns_recon_by_asin.csv");
  }

  function exportCsv() {
    if (view === "asin") exportAsinCsv();
    else exportMskuCsv();
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setView("msku")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === "msku"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              By MSKU
            </button>
            <button
              type="button"
              onClick={() => setView("asin")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === "asin"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              By ASIN
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
        </HeaderActions>

        <div className="space-y-4">
            {/* Filter bar is MSKU-view chrome — hidden in the By ASIN view */}
            {view !== "asin" && (
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
            )}

            {view === "asin" ? (
              loading ? (
                <TableSkeleton rows={8} cols={9} />
              ) : (
                <AsinSummaryTable
                  asinRows={byAsinRows}
                  onRaiseCase={handleRaiseCase}
                  onAdjust={handleAdjust}
                />
              )
            ) : (
            <>
            {/* Summary cards — SKUs | Units dual metric (matches Shipment Recon).
                The first four click to filter the table by status group; numbers
                stay global, only the table reacts. The trailing Cases and
                Adjustment cards are display-only cross-cuts. */}
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  {
                    value: "ALL",
                    label: "Total Returns",
                    tly: tally.total,
                    border: "blue",
                  },
                  {
                    value: "SETTLED",
                    label: "Settled",
                    tly: tally.settled,
                    border: "green",
                  },
                  {
                    value: "TAKE_ACTION",
                    label: "Take Action",
                    tly: tally.takeAction,
                    border: "red",
                  },
                  {
                    value: "NOT_FOUND",
                    label: "Not Found",
                    tly: tally.notFound,
                    border: "amber",
                  },
                ] as {
                  value: StatusCardFilter;
                  label: string;
                  tly: { rows: number; units: number };
                  border: "blue" | "green" | "red" | "amber";
                }[]
              ).map((c) => {
                const active =
                  fnskuStatus === c.value ||
                  (c.value === "ALL" && fnskuStatus === ALL) ||
                  (c.value === "SETTLED" &&
                    (SETTLED_STATUSES as string[]).includes(fnskuStatus));
                return (
                  <KpiCard
                    key={c.label}
                    label={c.label}
                    border={c.border}
                    primary={c.tly.rows}
                    secondary={c.tly.units}
                    secLabel="Units"
                    active={active}
                    onClick={() => onCard(c.value)}
                  />
                );
              })}

              {/* Adjustment & Cases — display-only cross-cuts (do not filter). */}
              <KpiCard
                label="Adjustment"
                border="teal"
                primary={tally.adjustments.rows}
                secondary={tally.adjustments.units}
                secLabel="Units"
              />
              <KpiCard
                label="Cases"
                border="purple"
                primary={tally.cases.rows}
                secondary={tally.cases.units}
                secLabel="Units"
              />
            </div>

            {loading ? (
              <TableSkeleton rows={8} cols={9} />
            ) : (
              <MskuReturnTable
                rows={rows}
                searchQuery={search}
                statusFilter={statusFilter}
                onRaiseCase={handleRaiseCase}
                onAdjust={handleAdjust}
              />
            )}
            </>
            )}
        </div>

        <RaiseCaseModal
          row={caseRow}
          open={caseOpen}
          onOpenChange={setCaseOpen}
          onSaved={() => {
            void reload();
          }}
        />
        <AdjustModal
          row={adjRow}
          open={adjOpen}
          onOpenChange={setAdjOpen}
          onSaved={() => {
            void reload();
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
            <SelectItem key={d} value={d}>{dispositionLabel(d)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hideFnskuStatus ? (
        <>
          <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
          <Select value={fnskuStatus} onValueChange={setFnskuStatus}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="SETTLED">Settled (no action)</SelectItem>
              {RETURN_ACTION_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {RETURN_ACTION_BADGE[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / FNSKU / ASIN / Order ID / LPN / FC"
        className="h-8 max-w-[280px] text-xs"
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
