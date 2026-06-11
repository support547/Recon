"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getAdjReconData,
  type AdjReconPayload,
} from "@/actions/adjustment-reconciliation";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnalysisTable } from "@/components/adjustment-reconciliation/analysis-tab/analysis-table";
import { MskuDetailTable } from "@/components/adjustment-reconciliation/analysis-tab/msku-detail-table";
import { AsinCaseModal } from "@/components/adjustment-reconciliation/modals/asin-case-modal";
import { AsinViewModal } from "@/components/adjustment-reconciliation/modals/asin-view-modal";
import { AsinAdjustModal } from "@/components/adjustment-reconciliation/modals/asin-adjust-modal";
import type { AdjPivotRow } from "@/lib/adjustment-reconciliation/types";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function AdjustmentReconciliationClient({
  initialPayload,
}: {
  initialPayload: AdjReconPayload;
}) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"__all__" | "ok" | "excess" | "take-action">("__all__");
  const [search, setSearch] = React.useState("");
  const [groupBy, setGroupBy] = React.useState<"asin" | "msku">("asin");
  const debouncedSearch = useDebounced(search, 280);

  const [payload, setPayload] = React.useState(initialPayload);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<AdjPivotRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [viewRow, setViewRow] = React.useState<AdjPivotRow | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [adjustRow, setAdjustRow] = React.useState<AdjPivotRow | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdjReconData({
        from: from || null,
        to: to || null,
        search: debouncedSearch || undefined,
        groupBy,
      });
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, debouncedSearch, groupBy]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  function exportCsv() {
    let headers: string[];
    let dataRows: (string | number)[][];
    let filename: string;
    if (groupBy === "msku") {
      headers = [
        "Date", "FNSKU", "ASIN", "MSKU", "Title", "Event Type",
        "Reference ID", "Quantity", "FC", "Disposition", "Reason",
        "Reconciled", "Unreconciled", "Store",
      ];
      dataRows = payload.logRows.map((r) => [
        r.adjDate, r.fnsku, r.asin, r.msku, r.title, "Adjustment",
        r.referenceId, r.quantity, r.fulfillmentCenter, r.disposition, r.reason,
        r.reconciledQty, r.unreconciledQty, r.store,
      ]);
      filename = "adjustment_by_msku.csv";
    } else {
      const codes = payload.pivot.reasonCodes;
      const keyHeader = payload.pivot.groupBy === "msku" ? "MSKU" : "ASIN";
      headers = [keyHeader, "Title", ...codes, "Total"];
      dataRows = payload.pivot.rows.map((r) => [
        r.key,
        r.title,
        ...codes.map((c) => r.qtyByReason[c] ?? 0),
        r.totalQty,
      ]);
      filename = "adjustment_pivot.csv";
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

  const filteredPivotRows = React.useMemo(() => {
    if (statusFilter === "__all__") return payload.pivot.rows;
    return payload.pivot.rows.filter((r) => r.status === statusFilter);
  }, [payload.pivot.rows, statusFilter]);

  const filteredPivot = React.useMemo(
    () => ({ ...payload.pivot, rows: filteredPivotRows }),
    [payload.pivot, filteredPivotRows],
  );

  const derivedStats = React.useMemo(() => {
    const allKeys = new Set(filteredPivotRows.map((r) => r.key));
    const posKeys = new Set(filteredPivotRows.filter((r) => r.totalQty >= 0).map((r) => r.key));
    const negKeys = new Set(filteredPivotRows.filter((r) => r.totalQty < 0).map((r) => r.key));
    const reimbKeys = new Set(filteredPivotRows.filter((r) => r.reimbQty > 0 || r.reimbAmount > 0).map((r) => r.key));
    const groupKey = payload.pivot.groupBy;

    const uniqueAsins = new Set<string>();
    const uniqueMskus = new Set<string>();
    const posAsins = new Set<string>();
    const posMskus = new Set<string>();
    const negAsins = new Set<string>();
    const negMskus = new Set<string>();
    const reimbAsins = new Set<string>();
    const reimbMskus = new Set<string>();
    for (const r of payload.logRows) {
      const matchKey = groupKey === "asin" ? r.asin : r.msku;
      if (allKeys.has(matchKey)) {
        if (r.asin) uniqueAsins.add(r.asin);
        if (r.msku) uniqueMskus.add(r.msku);
      }
      if (posKeys.has(matchKey)) {
        if (r.asin) posAsins.add(r.asin);
        if (r.msku) posMskus.add(r.msku);
      }
      if (negKeys.has(matchKey)) {
        if (r.asin) negAsins.add(r.asin);
        if (r.msku) negMskus.add(r.msku);
      }
      if (reimbKeys.has(matchKey)) {
        if (r.asin) reimbAsins.add(r.asin);
        if (r.msku) reimbMskus.add(r.msku);
      }
    }

    let posCount = 0;
    let posUnits = 0;
    let negCount = 0;
    let negUnits = 0;
    let reimbQty = 0;
    let reimbAmount = 0;
    for (const r of filteredPivotRows) {
      if (r.totalQty >= 0) {
        posCount += 1;
        posUnits += r.totalQty;
      } else {
        negCount += 1;
        negUnits += Math.abs(r.totalQty);
      }
      reimbQty += r.reimbQty;
      reimbAmount += r.reimbAmount;
    }
    return {
      uniqueAsins: uniqueAsins.size,
      uniqueMskus: uniqueMskus.size,
      posAsins: posAsins.size,
      posMskus: posMskus.size,
      negAsins: negAsins.size,
      negMskus: negMskus.size,
      reimbAsins: reimbAsins.size,
      reimbMskus: reimbMskus.size,
      posCount,
      posUnits,
      negCount,
      negUnits,
      diffCount: posCount - negCount,
      diffUnits: posUnits - negUnits,
      reimbQty,
      reimbAmount,
    };
  }, [filteredPivotRows, payload.logRows, payload.pivot.groupBy]);

  const stats = payload.stats;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition",
                groupBy === "asin"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setGroupBy("asin")}
            >
              By ASIN
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition",
                groupBy === "msku"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setGroupBy("msku")}
            >
              By MSKU
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            ⬇ Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            ↻ Refresh
          </Button>
        </HeaderActions>

        <FilterBar
          from={from} setFrom={setFrom}
          to={to} setTo={setTo}
          status={statusFilter} setStatus={setStatusFilter}
          search={search} setSearch={setSearch}
          onClear={() => {
            setFrom(""); setTo(""); setStatusFilter("__all__"); setSearch("");
          }}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            label="Total Titles"
            border="slate"
            primary={derivedStats.uniqueAsins}
            secondary={derivedStats.uniqueMskus}
            secLabel="MSKUs"
            primaryLabel="ASINs"
          />
          <KpiCard
            label="No Action"
            border="green"
            primary={derivedStats.posAsins}
            secondary={derivedStats.posMskus}
            secLabel="MSKUs"
            primaryLabel="ASINs"
          />
          <KpiCard
            label="Take Action"
            border="red"
            primary={derivedStats.negAsins}
            secondary={derivedStats.negMskus}
            secLabel="MSKUs"
            primaryLabel="ASINs"
          />
          <KpiCard
            label="Reimbursement"
            border="amber"
            primary={derivedStats.reimbAsins}
            secondary={derivedStats.reimbMskus}
            secLabel="MSKUs"
            primaryLabel="ASINs"
          />
          <KpiCard
            label="Cases Raised"
            border="blue"
            primary={stats.casesRaisedCount}
            secondary={stats.casesRaisedQty}
            secLabel="Open"
          />
        </div>

        <div className="space-y-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : groupBy === "msku" ? (
            <MskuDetailTable rows={payload.logRows} />
          ) : (
            <AnalysisTable
              pivot={filteredPivot}
              logRows={payload.logRows}
              onCase={(r) => {
                setCaseRow(r);
                setCaseOpen(true);
              }}
              onView={(r) => {
                setViewRow(r);
                setViewOpen(true);
              }}
              onAdjust={(r) => {
                setAdjustRow(r);
                setAdjustOpen(true);
              }}
            />
          )}
        </div>

        <AsinCaseModal
          row={caseRow}
          logRows={payload.logRows}
          open={caseOpen}
          onOpenChange={setCaseOpen}
          onSaved={() => void reload()}
        />
        <AsinViewModal
          row={viewRow}
          logRows={payload.logRows}
          open={viewOpen}
          onOpenChange={setViewOpen}
        />
        <AsinAdjustModal
          row={adjustRow}
          logRows={payload.logRows}
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          onSaved={() => void reload()}
        />
      </div>
    </TooltipProvider>
  );
}

function FilterBar({
  from, setFrom, to, setTo,
  status, setStatus,
  search, setSearch,
  onClear,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  status: "__all__" | "ok" | "excess" | "take-action";
  setStatus: (v: "__all__" | "ok" | "excess" | "take-action") => void;
  search: string; setSearch: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / FNSKU / ASIN / Reference"
        className="h-8 max-w-[260px] text-xs"
      />
      <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          <SelectItem value="ok">Matched</SelectItem>
          <SelectItem value="excess">Excess</SelectItem>
          <SelectItem value="take-action">Take Action</SelectItem>
        </SelectContent>
      </Select>
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
      <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function KpiCard({
  label, border, primary, secondary, secLabel, primaryLabel = "Count", secondaryFormat,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: number;
  secondary: number;
  secLabel: string;
  primaryLabel?: string;
  secondaryFormat?: "money";
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
    <div
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm border-t-[3px]",
        b,
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
          <span className="mt-0.5 text-[8px] text-muted-foreground">{primaryLabel}</span>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex flex-col items-center">
          <span className={cn("font-mono text-sm font-bold leading-none", c)}>
            {secondaryFormat === "money"
              ? `$${secondary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : secondary.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[8px] text-muted-foreground">{secLabel}</span>
        </div>
      </div>
    </div>
  );
}
