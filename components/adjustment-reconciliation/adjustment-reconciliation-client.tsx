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
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnalysisTable } from "@/components/adjustment-reconciliation/analysis-tab/analysis-table";
import { MskuCoverageTable } from "@/components/adjustment-reconciliation/analysis-tab/msku-coverage-table";
import { AsinCaseModal } from "@/components/adjustment-reconciliation/modals/asin-case-modal";
import { AsinViewModal } from "@/components/adjustment-reconciliation/modals/asin-view-modal";
import { AsinAdjustModal } from "@/components/adjustment-reconciliation/modals/asin-adjust-modal";
import { RaiseCaseModal } from "@/components/adjustment-reconciliation/modals/raise-case-modal";
import { AdjustModal } from "@/components/adjustment-reconciliation/modals/adjust-modal";
import type {
  AdjAnalysisRow,
  AdjLedgerRow,
  AdjPivotRow,
  AdjPivotStatus,
} from "@/lib/adjustment-reconciliation/types";

const LEDGER_REASON_CODES = ["M", "E", "D", "G", "O", "Q", "4"] as const;
type LedgerReason = (typeof LEDGER_REASON_CODES)[number];

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
  const [statusFilter, setStatusFilter] = React.useState<"__all__" | AdjPivotStatus>("__all__");
  const [mskuCardFilter, setMskuCardFilter] = React.useState<
    | "all"
    | "reconciled"
    | "waiting"
    | "take-action"
    | "grade-resell"
    | "reimb"
    | "cases"
  >("all");
  const [search, setSearch] = React.useState("");
  const [groupBy, setGroupBy] = React.useState<"asin" | "msku">("msku");
  const [reasonFilter, setReasonFilter] = React.useState<Set<LedgerReason>>(
    new Set(LEDGER_REASON_CODES),
  );
  const [collapseAllSignal, setCollapseAllSignal] = React.useState(0);
  const [expandOpenSignal, setExpandOpenSignal] = React.useState(0);
  const debouncedSearch = useDebounced(search, 280);

  const [payload, setPayload] = React.useState(initialPayload);
  const [loading, setLoading] = React.useState(false);

  const [caseRow, setCaseRow] = React.useState<AdjPivotRow | null>(null);
  const [caseOpen, setCaseOpen] = React.useState(false);
  const [viewRow, setViewRow] = React.useState<AdjPivotRow | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [adjustRow, setAdjustRow] = React.useState<AdjPivotRow | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);

  // MSKU-coverage modals consume AdjAnalysisRow directly.
  const [mskuCaseRow, setMskuCaseRow] = React.useState<AdjAnalysisRow | null>(null);
  const [mskuCaseOpen, setMskuCaseOpen] = React.useState(false);
  const [mskuAdjustRow, setMskuAdjustRow] = React.useState<AdjAnalysisRow | null>(null);
  const [mskuAdjustOpen, setMskuAdjustOpen] = React.useState(false);

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
        "Date", "MSKU", "FNSKU", "ASIN", "Title",
        "Reference ID", "FC", "Disposition", "Reason", "Reason Label",
        "Qty",
        "Coverage Type", "Covered Qty", "Covered Amount", "Reimb Qty",
        "Manual Adj Qty", "Manual Adj Count", "Manual Adj Reasons",
        "Case Count", "Case Claimed Qty", "Case Approved Qty",
        "Case Approved $", "Case Top Status", "Case IDs",
        "Decision", "Status",
      ];
      // Group rows by reason for the CSV (matches table layout) with a
      // blank line between sections.
      const byReason = new Map<string, AdjLedgerRow[]>();
      for (const e of filteredLedgerRows) {
        const arr = byReason.get(e.reason) ?? [];
        arr.push(e);
        byReason.set(e.reason, arr);
      }
      dataRows = [];
      let first = true;
      for (const code of LEDGER_REASON_CODES) {
        const arr = byReason.get(code);
        if (!arr || arr.length === 0) continue;
        if (!first) dataRows.push([]);
        first = false;
        for (const e of arr) {
          dataRows.push([
            e.adjDate, e.msku, e.fnsku, e.asin, e.title,
            e.referenceId, e.fulfillmentCenter, e.disposition, e.reason, e.reasonLabel,
            e.qty,
            e.coverageType, e.coveredQty, e.coveredAmount.toFixed(2),
            Math.round(e.reimbQty),
            e.manualAdjQty, e.manualAdjCount, e.manualAdjReasons,
            e.caseCount, e.caseClaimedQty, e.caseApprovedQty,
            e.caseApprovedAmount.toFixed(2), e.caseTopStatus, e.caseIds,
            e.decision, e.actionStatus,
          ]);
        }
      }
      filename = "adjustment_msku_ledger.csv";
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
    if (statusFilter === "take-action") {
      return payload.pivot.rows.filter(
        (r) => r.status === "take-action" || r.status === "partial",
      );
    }
    if (statusFilter === "ok") {
      return payload.pivot.rows.filter(
        (r) => r.status === "ok" || r.status === "excess",
      );
    }
    return payload.pivot.rows.filter((r) => r.status === statusFilter);
  }, [payload.pivot.rows, statusFilter]);

  const filteredPivot = React.useMemo(
    () => ({ ...payload.pivot, rows: filteredPivotRows }),
    [payload.pivot, filteredPivotRows],
  );

  // MSKU rows, filtered by the active KPI card (drives CSV in MSKU mode and
  // the modal lookup map).
  const filteredMskuRows = React.useMemo(() => {
    const all = payload.analysis;
    switch (mskuCardFilter) {
      case "all":
        return all;
      case "reconciled":
        return all.filter((r) => r.actionStatus === "reconciled");
      case "waiting":
        return all.filter((r) => r.actionStatus === "waiting");
      case "take-action":
        return all.filter((r) => r.actionStatus === "take-action");
      case "grade-resell":
        return all.filter((r) => r.actionStatus === "grade-resell");
      case "reimb":
        return all.filter((r) => r.reimbQty > 0 || r.lostReimbQty > 0 || r.damagedReimbQty > 0);
      case "cases":
        return all.filter((r) => r.caseCount > 0);
    }
  }, [payload.analysis, mskuCardFilter]);

  // Ledger rows filtered by KPI card (status) + reason multiselect.
  const filteredLedgerRows = React.useMemo<AdjLedgerRow[]>(() => {
    let all = payload.ledgerRows;
    if (reasonFilter.size < LEDGER_REASON_CODES.length) {
      all = all.filter((e) => reasonFilter.has(e.reason as LedgerReason));
    }
    switch (mskuCardFilter) {
      case "all":
        return all;
      case "reconciled":
        return all.filter((e) => e.actionStatus === "reconciled");
      case "waiting":
        return all.filter((e) => e.actionStatus === "waiting");
      case "take-action":
        return all.filter((e) => e.actionStatus === "take-action");
      case "grade-resell":
        return all.filter((e) => e.actionStatus === "grade-resell");
      case "reimb":
        return all.filter((e) => e.coverageType === "reimbursed" || e.coverageType === "partial");
      case "cases": {
        const caseMskus = new Set(
          payload.analysis.filter((r) => r.caseCount > 0).map((r) => r.msku),
        );
        return all.filter((e) => caseMskus.has(e.msku));
      }
    }
  }, [payload.ledgerRows, payload.analysis, mskuCardFilter, reasonFilter]);

  // MSKU-native KPI totals. Always computed off the unfiltered analysis so
  // card counts stay stable as filters are clicked.
  const mskuStats = React.useMemo(() => {
    let totalMskus = 0;
    let totalLossEvents = 0; // sum of lossQty as proxy event count
    let reconciledCount = 0;
    let reconciledUnits = 0;
    let waitingCount = 0;
    let waitingUnits = 0;
    let takeActionCount = 0;
    let takeActionUnits = 0;
    let gradeResellCount = 0;
    let gradeResellUnits = 0;
    let reimbCount = 0;
    let reimbQty = 0;
    let casesCount = 0;
    let casesOpen = 0;
    for (const r of payload.analysis) {
      totalMskus += 1;
      totalLossEvents += r.lossQty;
      if (r.actionStatus === "reconciled") {
        reconciledCount += 1;
        reconciledUnits += r.lossQty;
      } else if (r.actionStatus === "waiting") {
        waitingCount += 1;
        waitingUnits += r.netClaimableQty;
      } else if (r.actionStatus === "take-action") {
        takeActionCount += 1;
        takeActionUnits += r.netClaimableQty;
      } else if (r.actionStatus === "grade-resell") {
        gradeResellCount += 1;
        // Sum |qty| of code-4 events on this MSKU as the units moved.
        for (const ev of r.eventDecisions) {
          if (ev.code === "4") gradeResellUnits += Math.abs(ev.qty);
        }
      }
      const reimbTotal = r.reimbQty + r.lostReimbQty + r.damagedReimbQty;
      if (reimbTotal > 0) {
        reimbCount += 1;
        reimbQty += r.reimbQty;
      }
      if (r.caseCount > 0) {
        casesCount += 1;
        casesOpen += r.caseOpenCount;
      }
    }
    return {
      totalMskus,
      totalLossEvents,
      reconciledCount,
      reconciledUnits,
      waitingCount,
      waitingUnits,
      takeActionCount,
      takeActionUnits,
      gradeResellCount,
      gradeResellUnits,
      reimbCount,
      reimbQty,
      casesCount,
      casesOpen,
    };
  }, [payload.analysis]);

  const derivedStats = React.useMemo(() => {
    const allKeys = new Set(filteredPivotRows.map((r) => r.key));
    const noActionKeys = new Set(
      filteredPivotRows
        .filter((r) => r.status === "ok" || r.status === "excess")
        .map((r) => r.key),
    );
    const reimbursedKeys = new Set(filteredPivotRows.filter((r) => r.status === "reimbursed").map((r) => r.key));
    const takeActionKeys = new Set(
      filteredPivotRows
        .filter((r) => r.status === "take-action" || r.status === "partial")
        .map((r) => r.key),
    );
    const groupKey = payload.pivot.groupBy;

    const uniqueAsins = new Set<string>();
    const uniqueMskus = new Set<string>();
    const noActionAsins = new Set<string>();
    const noActionMskus = new Set<string>();
    const reimbursedAsins = new Set<string>();
    const reimbursedMskus = new Set<string>();
    const takeActionAsins = new Set<string>();
    const takeActionMskus = new Set<string>();
    for (const r of payload.logRows) {
      const matchKey = groupKey === "asin" ? r.asin : r.msku;
      if (allKeys.has(matchKey)) {
        if (r.asin) uniqueAsins.add(r.asin);
        if (r.msku) uniqueMskus.add(r.msku);
      }
      if (noActionKeys.has(matchKey)) {
        if (r.asin) noActionAsins.add(r.asin);
        if (r.msku) noActionMskus.add(r.msku);
      }
      if (reimbursedKeys.has(matchKey)) {
        if (r.asin) reimbursedAsins.add(r.asin);
        if (r.msku) reimbursedMskus.add(r.msku);
      }
      if (takeActionKeys.has(matchKey)) {
        if (r.asin) takeActionAsins.add(r.asin);
        if (r.msku) takeActionMskus.add(r.msku);
      }
    }

    const openUnits = filteredPivotRows.reduce((s, r) => s + r.openQty, 0);

    return {
      uniqueAsins: uniqueAsins.size,
      uniqueMskus: uniqueMskus.size,
      noActionAsins: noActionAsins.size,
      noActionMskus: noActionMskus.size,
      reimbursedAsins: reimbursedAsins.size,
      reimbursedMskus: reimbursedMskus.size,
      takeActionAsins: takeActionAsins.size,
      takeActionMskus: takeActionMskus.size,
      openUnits,
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
                groupBy === "msku"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setGroupBy("msku")}
            >
              By MSKU
            </button>
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
          showStatus={groupBy === "asin"}
          search={search} setSearch={setSearch}
          onClear={() => {
            setFrom("");
            setTo("");
            setStatusFilter("__all__");
            setMskuCardFilter("all");
            setSearch("");
          }}
        />

        {groupBy === "asin" ? (
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
              primary={derivedStats.noActionAsins}
              secondary={derivedStats.noActionMskus}
              secLabel="MSKUs"
              primaryLabel="ASINs"
              active={statusFilter === "ok"}
              onClick={() =>
                setStatusFilter(statusFilter === "ok" ? "__all__" : "ok")
              }
            />
            <KpiCard
              label="✓ Reimbursed"
              border="green"
              primary={derivedStats.reimbursedAsins}
              secondary={derivedStats.reimbursedMskus}
              secLabel="MSKUs"
              primaryLabel="ASINs"
              active={statusFilter === "reimbursed"}
              onClick={() =>
                setStatusFilter(
                  statusFilter === "reimbursed" ? "__all__" : "reimbursed",
                )
              }
            />
            <KpiCard
              label="⚠ Take Action"
              border="red"
              primary={derivedStats.takeActionAsins}
              secondary={derivedStats.openUnits}
              secLabel="Open Units"
              primaryLabel="ASINs"
              active={statusFilter === "take-action"}
              onClick={() =>
                setStatusFilter(
                  statusFilter === "take-action" ? "__all__" : "take-action",
                )
              }
            />
            <KpiCard
              label="Cases Raised"
              border="blue"
              primary={stats.casesRaisedCount}
              secondary={stats.casesRaisedQty}
              secLabel="Open"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
            <KpiCard
              label="Total MSKUs"
              border="slate"
              primary={mskuStats.totalMskus}
              secondary={mskuStats.totalLossEvents}
              secLabel="Loss Qty"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "all"}
              onClick={() => setMskuCardFilter("all")}
            />
            <KpiCard
              label="Reconciled"
              border="green"
              primary={mskuStats.reconciledCount}
              secondary={mskuStats.reconciledUnits}
              secLabel="Units"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "reconciled"}
              onClick={() => {
                const next = mskuCardFilter === "reconciled" ? "all" : "reconciled";
                setMskuCardFilter(next);
                if (next === "reconciled") setCollapseAllSignal((n) => n + 1);
              }}
            />
            <KpiCard
              label="Waiting"
              border="amber"
              primary={mskuStats.waitingCount}
              secondary={mskuStats.waitingUnits}
              secLabel="Net Open"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "waiting"}
              onClick={() => {
                const next = mskuCardFilter === "waiting" ? "all" : "waiting";
                setMskuCardFilter(next);
                if (next === "waiting") setCollapseAllSignal((n) => n + 1);
              }}
            />
            <KpiCard
              label="Take Action"
              border="red"
              primary={mskuStats.takeActionCount}
              secondary={mskuStats.takeActionUnits}
              secLabel="Net Open"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "take-action"}
              onClick={() => {
                const next = mskuCardFilter === "take-action" ? "all" : "take-action";
                setMskuCardFilter(next);
                if (next === "take-action") setExpandOpenSignal((n) => n + 1);
              }}
            />
            <KpiCard
              label="Grade & Resell"
              border="teal"
              primary={mskuStats.gradeResellCount}
              secondary={mskuStats.gradeResellUnits}
              secLabel="Units"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "grade-resell"}
              onClick={() =>
                setMskuCardFilter(
                  mskuCardFilter === "grade-resell" ? "all" : "grade-resell",
                )
              }
            />
            <KpiCard
              label="Amazon Reimb"
              border="teal"
              primary={mskuStats.reimbCount}
              secondary={mskuStats.reimbQty}
              secLabel="Qty"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "reimb"}
              onClick={() =>
                setMskuCardFilter(mskuCardFilter === "reimb" ? "all" : "reimb")
              }
            />
            <KpiCard
              label="Cases Raised"
              border="blue"
              primary={mskuStats.casesCount}
              secondary={mskuStats.casesOpen}
              secLabel="Open"
              primaryLabel="MSKUs"
              active={mskuCardFilter === "cases"}
              onClick={() =>
                setMskuCardFilter(mskuCardFilter === "cases" ? "all" : "cases")
              }
            />
          </div>
        )}

        {groupBy === "msku" ? (
          <ReasonPillFilter
            value={reasonFilter}
            onChange={setReasonFilter}
          />
        ) : null}

        <div className="space-y-4">
          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : groupBy === "msku" ? (
            <MskuCoverageTable
              rows={filteredLedgerRows}
              mskuRows={payload.analysis}
              collapseAllSignal={collapseAllSignal}
              expandOpenSignal={expandOpenSignal}
              onCase={(r) => {
                setMskuCaseRow(r);
                setMskuCaseOpen(true);
              }}
              onAdjust={(r) => {
                setMskuAdjustRow(r);
                setMskuAdjustOpen(true);
              }}
            />
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

        <RaiseCaseModal
          row={mskuCaseRow}
          open={mskuCaseOpen}
          onOpenChange={setMskuCaseOpen}
          onSaved={() => void reload()}
        />
        <AdjustModal
          row={mskuAdjustRow}
          open={mskuAdjustOpen}
          onOpenChange={setMskuAdjustOpen}
          onSaved={() => void reload()}
        />
      </div>
    </TooltipProvider>
  );
}

function FilterBar({
  from, setFrom, to, setTo,
  status, setStatus,
  showStatus,
  search, setSearch,
  onClear,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  status: "__all__" | AdjPivotStatus;
  setStatus: (v: "__all__" | AdjPivotStatus) => void;
  showStatus: boolean;
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
      {showStatus ? (
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="ok">✓ No Action</SelectItem>
            <SelectItem value="excess">⇄ Excess</SelectItem>
            <SelectItem value="reimbursed">✓ Reimbursed</SelectItem>
            <SelectItem value="partial">~ Partial</SelectItem>
            <SelectItem value="take-action">⚠ Take Action</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
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

function ReasonPillFilter({
  value,
  onChange,
}: {
  value: Set<LedgerReason>;
  onChange: (next: Set<LedgerReason>) => void;
}) {
  const toggle = (code: LedgerReason) => {
    const next = new Set(value);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(next);
  };
  const allOn = value.size === LEDGER_REASON_CODES.length;
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Reason
      </span>
      {LEDGER_REASON_CODES.map((code) => {
        const on = value.has(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold transition",
              on
                ? "border-blue-300 bg-blue-100 text-blue-800"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
            )}
          >
            {code}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange(allOn ? new Set() : new Set(LEDGER_REASON_CODES))
        }
        className="ml-auto rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        {allOn ? "None" : "All"}
      </button>
    </div>
  );
}

function KpiCard({
  label, border, primary, secondary, secLabel, primaryLabel = "Count", secondaryFormat,
  onClick, active,
}: {
  label: string;
  border: "blue" | "green" | "red" | "amber" | "slate" | "teal";
  primary: number;
  secondary: number;
  secLabel: string;
  primaryLabel?: string;
  secondaryFormat?: "money";
  onClick?: () => void;
  active?: boolean;
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
  const ring =
    border === "blue" ? "ring-blue-500" :
    border === "green" ? "ring-emerald-500" :
    border === "red" ? "ring-red-500" :
    border === "amber" ? "ring-amber-500" :
    border === "teal" ? "ring-teal-500" : "ring-slate-400";
  const baseCls = cn(
    "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm border-t-[3px]",
    b,
    onClick ? "cursor-pointer transition hover:shadow-md" : "",
    active ? `ring-2 ring-offset-1 ${ring}` : "",
  );
  const body = (
    <>
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
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseCls, "w-full focus:outline-none focus-visible:ring-2")}
      >
        {body}
      </button>
    );
  }
  return <div className={baseCls}>{body}</div>;
}
