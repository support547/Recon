"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getFullReconData,
  saveFullReconRemark,
  type FullReconciliationPayload,
} from "@/actions/full-reconciliation";
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
import {
  FullReconTable,
  FULL_RECON_COLUMNS,
  type ColKey,
} from "@/components/full-reconciliation/full-recon-table";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { ActionModal } from "@/components/full-reconciliation/modals/action-modal";
import { DetailDrawer } from "@/components/full-reconciliation/detail-drawer";
import type {
  FullReconRow,
  FullReconStatus,
} from "@/lib/full-reconciliation/types";

const ALL = "__all__";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function FullReconciliationClient({
  initialPayload,
  initialRemarks = {},
}: {
  initialPayload: FullReconciliationPayload;
  initialRemarks?: Record<string, string>;
}) {
  const [remarks, setRemarks] = React.useState<Record<string, string>>(
    initialRemarks,
  );
  React.useEffect(() => {
    setRemarks(initialRemarks);
  }, [initialRemarks]);

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [shortageFilter, setShortageFilter] = React.useState<string>(ALL);
  const [colFilters, setColFilters] = React.useState<Set<ColKey>>(new Set());
  const [colVis, setColVis] = useColumnVisibility(
    "fullRecon.cols",
    FULL_RECON_COLUMNS,
  );

  const [rows, setRows] = React.useState(initialPayload.rows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  const [detailRow, setDetailRow] = React.useState<FullReconRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [actionRow, setActionRow] = React.useState<FullReconRow | null>(null);
  const [actionOpen, setActionOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFullReconData({ search: debouncedSearch || undefined });
      setRows(data.rows);
      setStats(data.stats);
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
    void reload();
  }, [reload]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((r) => {
      if (shortageFilter === "yes" && r.shortageQty <= 0) return false;
      if (shortageFilter === "no" && r.shortageQty > 0) return false;
      if (statusFilter !== ALL && r.reconStatus !== (statusFilter as FullReconStatus)) return false;
      for (const k of colFilters) {
        if ((r[k] ?? 0) === 0) return false;
      }
      return true;
    });
  }, [rows, statusFilter, shortageFilter, colFilters]);

  function toggleCol(k: ColKey) {
    setColFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function setStatusKpi(s: FullReconStatus) {
    setStatusFilter((prev) => (prev === s ? ALL : s));
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter(ALL);
    setShortageFilter(ALL);
    setColFilters(new Set());
  }

  function exportCsv() {
    const headers = [
      "MSKU", "ASIN", "FNSKU", "Title",
      "Shipped", "Receipts", "Shortage", "Sold",
      "Returns", "Reimb Qty", "Reimb $", "Removal Rcpt",
      "Replacements", "Repl Returns", "Repl Reimb Qty", "Repl Status",
      "GNR Qty", "GNR Succeeded", "GNR Failed",
      "FC Net", "FC In", "FC Out", "FC Status",
      "Ending Balance", "FBA Balance", "FBA Snapshot Date",
      "FBA Adj Total", "Manual Adj Qty",
      "Recon Status", "Last Recv", "Last Sale", "Days",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filteredRows) {
      lines.push(
        [
          r.msku, r.asin, r.fnsku, r.title,
          r.shippedQty, r.receiptQty, r.shortageQty, r.soldQty,
          r.returnQty, r.reimbQty, r.reimbAmt.toFixed(2), r.removalRcptQty,
          r.replQty, r.replReturnQty, r.replReimbQty, r.replStatus,
          r.gnrQty, r.gnrSucceeded, r.gnrFailed,
          r.fcNetQty, r.fcInQty, r.fcOutQty, r.fcStatus,
          r.endingBalance, r.fbaEndingBalance ?? "", r.fbaSummaryDate,
          r.fbaAdjTotal, r.adjQty,
          r.reconStatus, r.latestRecvDate, r.latestSaleDate, r.daysRecvToSale ?? "",
        ].map(esc).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "full_recon.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <HeaderActions>
          <ColumnsMenu
            columns={FULL_RECON_COLUMNS}
            visibility={colVis}
            onChange={setColVis}
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
        </HeaderActions>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTotal label="Total FNSKUs" value={stats.totalFnskus} icon="🔢" border="blue" />
          <KpiTotal label="Total Shipped" value={stats.totalShipped} icon="📤" border="sky" />
          <KpiTotal label="Total Received" value={stats.totalReceived} icon="📥" border="green" />
          <KpiTotal label="Total Shortage" value={stats.totalShortage} icon="⚠" border="red" />
          <KpiTotal label="Total Sold" value={stats.totalSold} icon="🛒" border="amber" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiStatus
            label="Matched"
            value={stats.matched}
            border="green"
            active={statusFilter === "Matched"}
            onClick={() => setStatusKpi("Matched")}
          />
          <KpiStatus
            label="Over"
            value={stats.over}
            border="blue"
            active={statusFilter === "Over"}
            onClick={() => setStatusKpi("Over")}
          />
          <KpiStatus
            label="Take Action"
            value={stats.takeAction}
            border="red"
            active={statusFilter === "Take Action"}
            onClick={() => setStatusKpi("Take Action")}
          />
          <KpiStatus
            label="Reimbursed"
            value={stats.reimbursed}
            border="green"
            active={statusFilter === "Reimbursed"}
            onClick={() => setStatusKpi("Reimbursed")}
          />
          <KpiStatus
            label="No Snapshot"
            value={stats.noSnapshot}
            border="slate"
            active={statusFilter === "No Snapshot"}
            onClick={() => setStatusKpi("No Snapshot")}
          />
          <KpiStatus
            label="TA Variance"
            value={stats.takeActionVariance}
            suffix="u"
            border="amber"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search MSKU / ASIN / FNSKU / Title"
            className="h-8 max-w-[300px] flex-1 text-xs"
          />
          <span className="text-[11px] font-semibold text-muted-foreground">Shortage</span>
          <Select value={shortageFilter} onValueChange={setShortageFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="yes">Has Shortage</SelectItem>
              <SelectItem value="no">No Shortage</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="Matched">Matched</SelectItem>
              <SelectItem value="Over">Over</SelectItem>
              <SelectItem value="Take Action">Take Action</SelectItem>
              <SelectItem value="Reimbursed">Reimbursed</SelectItem>
              <SelectItem value="No Snapshot">No Snapshot</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={clearFilters}>Clear</Button>
        </div>

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">
            Click MSKU for detail · Hover for breakdowns · Click column totals to filter non-zero
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {filteredRows.length.toLocaleString()} FNSKUs
          </span>
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <FullReconTable
            visibility={colVis}
            rows={filteredRows}
            colFilters={colFilters}
            onToggleCol={toggleCol}
            onOpenDetail={(r) => { setDetailRow(r); setDetailOpen(true); }}
            onOpenAction={(r) => { setActionRow(r); setActionOpen(true); }}
            remarks={remarks}
            onSaveRemark={async (fnsku, next) => {
              const res = await saveFullReconRemark(fnsku, next);
              if (res.ok) {
                setRemarks((prev) => ({ ...prev, [fnsku]: next }));
              }
              return res;
            }}
          />
        )}

        <DetailDrawer row={detailRow} open={detailOpen} onOpenChange={setDetailOpen} />
        <ActionModal
          row={actionRow}
          open={actionOpen}
          onOpenChange={setActionOpen}
          onSaved={() => void reload()}
        />
      </div>
    </TooltipProvider>
  );
}

function KpiTotal({
  label, value, icon, border,
}: { label: string; value: number; icon: string; border: "blue"|"sky"|"green"|"red"|"amber" }) {
  const bg =
    border === "blue" ? "bg-blue-50" :
    border === "sky" ? "bg-sky-50" :
    border === "green" ? "bg-emerald-50" :
    border === "red" ? "bg-red-50" : "bg-amber-50";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className={cn("flex size-9 items-center justify-center rounded-md text-base", bg)}>
        {icon}
      </div>
      <div>
        <div className="font-mono text-lg font-bold leading-none">{value.toLocaleString()}</div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function KpiStatus({
  label, value, border, active, onClick, suffix,
}: {
  label: string;
  value: number;
  border: "blue"|"green"|"red"|"slate"|"amber";
  active?: boolean;
  onClick?: () => void;
  suffix?: string;
}) {
  const b =
    border === "blue" ? "border-l-blue-500 text-blue-600" :
    border === "green" ? "border-l-emerald-500 text-emerald-700" :
    border === "red" ? "border-l-red-500 text-red-600" :
    border === "amber" ? "border-l-amber-500 text-amber-700" : "border-l-slate-400 text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-l-[3px]",
        b,
        active ? "ring-2 ring-blue-300" : onClick ? "hover:border-slate-300" : "",
      )}
    >
      <div>
        <div className="font-mono text-lg font-bold leading-none">
          {value.toLocaleString()}{suffix ? <span className="ml-0.5 text-xs">{suffix}</span> : null}
        </div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}
