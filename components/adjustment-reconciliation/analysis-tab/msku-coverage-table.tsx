"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, FileText, Wrench } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { AdjStatusBadge } from "@/components/adjustment-reconciliation/shared/status-badge";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { cn } from "@/lib/utils";
import { getReasonLabel } from "@/lib/adjustment-reconciliation/formula";
import type {
  AdjAnalysisRow,
  AdjCoverageType,
  AdjCoveredByDetail,
  AdjLedgerReimbDetail,
  AdjLedgerRow,
} from "@/lib/adjustment-reconciliation/types";

// Group order on screen.
const GROUP_ORDER: readonly string[] = ["M", "E", "D", "G", "O", "Q", "4"];
const DEFAULT_EXPANDED: Set<string> = new Set(["M", "E", "D", "G", "O", "Q"]);

function statusRank(s: AdjLedgerRow["actionStatus"]): number {
  switch (s) {
    case "take-action":
      return 0;
    case "waiting":
      return 1;
    case "grade-resell":
      return 2;
    case "reconciled":
      return 3;
  }
}

export function MskuCoverageTable({
  rows,
  mskuRows,
  collapseAllSignal,
  expandOpenSignal,
  onCase,
  onAdjust,
}: {
  rows: AdjLedgerRow[];
  mskuRows: AdjAnalysisRow[];
  collapseAllSignal?: number;
  expandOpenSignal?: number;
  onCase?: (row: AdjAnalysisRow, event: AdjLedgerRow) => void;
  onAdjust?: (row: AdjAnalysisRow, event: AdjLedgerRow) => void;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(
    new Set(DEFAULT_EXPANDED),
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);

  React.useEffect(() => {
    setPage(1);
  }, [rows]);

  React.useEffect(() => {
    if (collapseAllSignal === undefined) return;
    setExpanded(new Set());
  }, [collapseAllSignal]);

  React.useEffect(() => {
    if (expandOpenSignal === undefined) return;
    const next = new Set<string>();
    for (const code of GROUP_ORDER) {
      if (rows.some((r) => r.reason === code && r.actionStatus !== "reconciled" && r.actionStatus !== "grade-resell")) {
        next.add(code);
      }
    }
    setExpanded(next);
  }, [expandOpenSignal, rows]);

  const mskuLookup = React.useMemo(() => {
    const m = new Map<string, AdjAnalysisRow>();
    for (const r of mskuRows) m.set(r.msku, r);
    return m;
  }, [mskuRows]);

  // Column totals across the entire filtered set (not just the visible page).
  // Manual Adj + Case are MSKU-level, so dedupe by MSKU to avoid summing the
  // same case/manual qty once per event on that MSKU.
  const totals = React.useMemo(() => {
    let qty = 0;
    let coveredQty = 0;
    let reimbQty = 0;
    let manualAdjQty = 0;
    let caseClaimedQty = 0;
    let caseApprovedQty = 0;
    let caseCount = 0;
    const seenMsku = new Set<string>();
    for (const r of rows) {
      qty += r.qty;
      coveredQty += r.coveredQty;
      reimbQty += r.reimbQty;
      if (!seenMsku.has(r.msku)) {
        seenMsku.add(r.msku);
        manualAdjQty += r.manualAdjQty;
        caseClaimedQty += r.caseClaimedQty;
        caseApprovedQty += r.caseApprovedQty;
        caseCount += r.caseCount;
      }
    }
    return {
      qty,
      coveredQty,
      reimbQty,
      manualAdjQty,
      caseClaimedQty,
      caseApprovedQty,
      caseCount,
    };
  }, [rows]);

  // Group rows; sort within: status priority, then date desc.
  const grouped = React.useMemo(() => {
    const map = new Map<string, AdjLedgerRow[]>();
    for (const r of rows) {
      const arr = map.get(r.reason) ?? [];
      arr.push(r);
      map.set(r.reason, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const cmp = statusRank(a.actionStatus) - statusRank(b.actionStatus);
        if (cmp !== 0) return cmp;
        return a.adjDate < b.adjDate ? 1 : a.adjDate > b.adjDate ? -1 : 0;
      });
    }
    return map;
  }, [rows]);

  // Flat render list: section header rows + their data rows (only when expanded).
  type RenderItem =
    | { kind: "header"; code: string; count: number; covered: number; open: number; anyOpen: boolean }
    | { kind: "row"; row: AdjLedgerRow };
  const items: RenderItem[] = [];
  for (const code of GROUP_ORDER) {
    const arr = grouped.get(code);
    if (!arr || arr.length === 0) continue;
    let covered = 0;
    let open = 0;
    for (const r of arr) {
      if (r.actionStatus === "reconciled" || r.actionStatus === "grade-resell") covered++;
      else open++;
    }
    items.push({
      kind: "header",
      code,
      count: arr.length,
      covered,
      open,
      anyOpen: open > 0,
    });
    if (expanded.has(code)) {
      for (const row of arr) items.push({ kind: "row", row });
    }
  }

  // Paginate the data rows ONLY (headers always render at top of their group).
  const totalDataRows = items.filter((i) => i.kind === "row").length;
  const dataRowsForPage: RenderItem[] = [];
  {
    let skipped = 0;
    let added = 0;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    for (const it of items) {
      if (it.kind === "header") {
        // Only include header if at least one of its data rows lands on this page.
        dataRowsForPage.push(it);
        continue;
      }
      if (skipped < start) {
        skipped++;
        continue;
      }
      if (added >= pageSize) continue;
      dataRowsForPage.push(it);
      added++;
      if (added + start >= end) break;
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">No adjustment events</p>
        <p className="text-xs">Upload Adjustments report to see ledger</p>
      </div>
    );
  }

  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const COL_COUNT = 14;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              <Th>Date</Th>
              <Th>MSKU / FNSKU</Th>
              <Th>Title</Th>
              <Th>FC</Th>
              <Th>Disposition</Th>
              <Th className="text-right">
                <ThWithTotal label="Qty" total={totals.qty} signed />
              </Th>
              <Th>Coverage</Th>
              <Th className="text-right">
                <ThWithTotal label="Covered Qty" total={totals.coveredQty} />
              </Th>
              <Th className="text-right">
                <ThWithTotal label="Reimb Qty" total={totals.reimbQty} />
              </Th>
              <Th className="text-right">
                <ThWithTotal label="Manual Adj" total={totals.manualAdjQty} signed />
              </Th>
              <Th className="text-right">
                <ThWithTotal
                  label="Case"
                  total={totals.caseApprovedQty}
                  subtitle={`${totals.caseCount} case${totals.caseCount === 1 ? "" : "s"}`}
                />
              </Th>
              <Th>Decision</Th>
              <Th>Status</Th>
              <Th className="text-center">Action</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataRowsForPage.map((it, i) => {
              if (it.kind === "header") {
                return (
                  <SectionHeader
                    key={`hdr-${it.code}-${i}`}
                    code={it.code}
                    count={it.count}
                    covered={it.covered}
                    open={it.open}
                    anyOpen={it.anyOpen}
                    expanded={expanded.has(it.code)}
                    onToggle={() => toggle(it.code)}
                    colSpan={COL_COUNT}
                  />
                );
              }
              const e = it.row;
              const mskuRow = mskuLookup.get(e.msku) ?? null;
              const rowBg =
                e.actionStatus === "take-action"
                  ? "bg-red-50/40"
                  : e.actionStatus === "waiting"
                    ? "bg-amber-50/30"
                    : e.actionStatus === "grade-resell"
                      ? "bg-teal-50/30"
                      : "";
              return (
                <TableRow key={e.id} className={cn("hover:bg-slate-50", rowBg)}>
                  <TableCell className="font-mono text-[11px]">{e.adjDate || "—"}</TableCell>
                  <TableCell className="font-mono text-[11px]">
                    <div className="font-semibold">{e.msku || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{e.fnsku || "—"}</div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-[11px]" title={e.title}>
                    {e.title || "—"}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">
                    {e.fulfillmentCenter || "—"}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">
                    {e.disposition || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-red-600">
                    {e.qty}
                  </TableCell>
                  <TableCell>
                    <CoverageChip event={e} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    <CoveredQtyCell event={e} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    <ReimbQtyCell event={e} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    <ManualAdjCell event={e} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px]">
                    <CaseCell event={e} />
                  </TableCell>
                  <TableCell
                    className="max-w-[220px] truncate text-[11px]"
                    title={e.decision}
                  >
                    {e.decision}
                  </TableCell>
                  <TableCell>
                    <AdjStatusBadge status={e.actionStatus} />
                  </TableCell>
                  <TableCell>
                    <ActionCell
                      event={e}
                      mskuRow={mskuRow}
                      onCase={onCase}
                      onAdjust={onAdjust}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={totalDataRows}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
      />
    </div>
  );
}

function SectionHeader({
  code,
  count,
  covered,
  open,
  anyOpen,
  expanded,
  onToggle,
  colSpan,
}: {
  code: string;
  count: number;
  covered: number;
  open: number;
  anyOpen: boolean;
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  const isGr = code === "4";
  const cls = isGr
    ? "bg-teal-50 text-teal-800"
    : anyOpen
      ? "bg-red-50 text-red-800"
      : "bg-emerald-50 text-emerald-800";
  return (
    <TableRow className={cls}>
      <TableCell colSpan={colSpan} className="px-3 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-wider"
        >
          {expanded ? (
            <ChevronDown className="size-3" aria-hidden />
          ) : (
            <ChevronRight className="size-3" aria-hidden />
          )}
          <span className="font-mono">{code}</span>
          <span className="text-muted-foreground">—</span>
          <span className="normal-case">{getReasonLabel(code)}</span>
          <span className="text-muted-foreground">·</span>
          <span>{count} events</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-emerald-700">✓ {covered}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-red-700">⚠ {open}</span>
        </button>
      </TableCell>
    </TableRow>
  );
}

function CoverageChip({ event }: { event: AdjLedgerRow }) {
  const { coverageType } = event;
  const label = coverageLabel(coverageType);
  const cls = coverageCls(coverageType);
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-mono text-[10px] font-bold", cls)}
    >
      {label}
    </Badge>
  );
}

// Rule: hide Covered Qty when fully reimbursed (reimb column tells the story)
// or when nothing was covered. Show otherwise. Popover trigger fires only when
// coveredByDetails is non-empty.
function CoveredQtyCell({ event }: { event: AdjLedgerRow }) {
  const { coverageType, coveredByDetails, coveredQty } = event;
  if (coverageType === "reimbursed" || coverageType === "open" || coveredQty <= 0) {
    return <span className="text-slate-300">—</span>;
  }
  const value = (
    <span className="font-bold text-emerald-700">+{coveredQty}</span>
  );
  if (coveredByDetails.length === 0) return value;
  const debitQty = Math.abs(event.qty);
  const uncovered = Math.max(0, debitQty - coveredQty);
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CellHoverPopover
        trigger={value}
        title={`Coverage detail · ${event.reason} — ${event.reasonLabel}`}
        count={coveredByDetails.length}
        width={480}
        triggerClassName="text-right"
      >
        <CoveredByTable
          details={coveredByDetails}
          debitQty={debitQty}
          coveredQty={coveredQty}
          partial={coverageType === "partial"}
          uncoveredQty={uncovered}
        />
      </CellHoverPopover>
    </span>
  );
}

function ManualAdjCell({ event }: { event: AdjLedgerRow }) {
  const qty = event.manualAdjQty;
  if (!qty || event.manualAdjCount <= 0) {
    return <span className="text-slate-300">—</span>;
  }
  const cls = qty > 0 ? "text-emerald-700" : "text-red-600";
  const display = qty > 0 ? `+${qty}` : `${qty}`;
  const trigger = <span className={cn("font-bold", cls)}>{display}</span>;
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CellHoverPopover
        side="left"
        width={280}
        title="Manual Adjustment"
        count={event.manualAdjCount}
        trigger={trigger}
        triggerClassName={cn("font-bold", cls)}
      >
        <CellHoverRow left="Qty" right={qty} />
        <CellHoverRow left="Entries" right={event.manualAdjCount} />
        {event.manualAdjReasons ? (
          <CellHoverRow left="Reasons" right={event.manualAdjReasons} />
        ) : null}
      </CellHoverPopover>
    </span>
  );
}

function CaseCell({ event }: { event: AdjLedgerRow }) {
  if (event.caseCount <= 0) {
    return <span className="text-slate-300">—</span>;
  }
  const display =
    event.caseClaimedQty ||
    `${event.caseCount} case${event.caseCount > 1 ? "s" : ""}`;
  const trigger = <span className="font-bold text-teal-700">{display}</span>;
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CellHoverPopover
        side="left"
        width={300}
        title="Case detail"
        count={event.caseCount}
        trigger={trigger}
        triggerClassName="font-bold text-teal-700"
      >
        <CellHoverRow left="Claimed Qty" right={event.caseClaimedQty} />
        <CellHoverRow left="Approved Qty" right={event.caseApprovedQty} />
        <CellHoverRow
          left="Approved $"
          right={`$${event.caseApprovedAmount.toFixed(2)}`}
        />
        {event.caseTopStatus ? (
          <CellHoverRow left="Status" right={event.caseTopStatus} />
        ) : null}
        {event.caseIds ? <CellHoverRow left="Case ID(s)" right={event.caseIds} /> : null}
      </CellHoverPopover>
    </span>
  );
}

function ReimbQtyCell({ event }: { event: AdjLedgerRow }) {
  if (
    (event.coverageType !== "reimbursed" && event.coverageType !== "partial") ||
    event.reimbQty <= 0
  ) {
    return <span className="text-slate-300">—</span>;
  }
  const qty = Math.round(event.reimbQty);
  const value = (
    <span className="font-bold text-emerald-700">+{qty}</span>
  );
  if (event.reimbDetails.length === 0) return value;
  const totalQty = event.reimbDetails.reduce((s, d) => s + d.qtyCash, 0);
  const totalAmount = event.reimbDetails.reduce((s, d) => s + d.amount, 0);
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CellHoverPopover
        trigger={value}
        title={`Reimbursement detail · ${truncate(event.msku, 28)}`}
        count={event.reimbDetails.length}
        width={560}
        triggerClassName="text-right"
      >
        <ReimbDetailTable
          details={event.reimbDetails}
          totalQty={totalQty}
          totalAmount={totalAmount}
        />
      </CellHoverPopover>
    </span>
  );
}

const CODE_BADGE_CLS: Record<string, string> = {
  F: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "3": "border-teal-200 bg-teal-50 text-teal-700",
  P: "border-blue-200 bg-blue-50 text-blue-700",
  LW: "border-amber-200 bg-amber-50 text-amber-800",
  DW: "border-amber-200 bg-amber-50 text-amber-800",
  CA: "border-purple-200 bg-purple-50 text-purple-700",
  MA: "border-slate-200 bg-slate-50 text-slate-600",
};

function CodeBadge({ code }: { code: string }) {
  const cls = CODE_BADGE_CLS[code] ?? "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span
      className={cn(
        "rounded border px-1 font-mono text-[10px] font-bold",
        cls,
      )}
    >
      {code}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function CoveredByTable({
  details,
  debitQty,
  coveredQty,
  partial,
  uncoveredQty,
}: {
  details: AdjCoveredByDetail[];
  debitQty: number;
  coveredQty: number;
  partial: boolean;
  uncoveredQty: number;
}) {
  const sorted = [...details].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return (
    <div>
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-semibold">Code</th>
            <th className="px-2 py-1 text-left font-semibold">Date</th>
            <th className="px-2 py-1 text-left font-semibold">MSKU</th>
            <th className="px-2 py-1 text-left font-semibold">Disposition</th>
            <th className="px-2 py-1 text-right font-semibold">Qty</th>
            <th className="px-2 py-1 text-left font-semibold">FC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((d, i) => {
            const isReimb = d.code === "LW" || d.code === "DW";
            return (
              <tr key={`${d.code}|${d.date}|${d.msku}|${d.referenceId ?? ""}|${i}`}>
                <td className="px-2 py-1">
                  <CodeBadge code={d.code} />
                </td>
                <td className="px-2 py-1 font-mono text-[10px]">{d.date || "—"}</td>
                <td className="px-2 py-1">
                  {isReimb ? (
                    <span className="italic text-slate-500">Amazon reimbursement</span>
                  ) : (
                    <span className="font-mono text-[11px]" title={d.msku}>
                      {truncate(d.msku, 32)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">
                  {d.disposition || "—"}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums font-bold text-emerald-700">
                  +{Math.round(d.qty)}
                </td>
                <td className="px-2 py-1 font-mono text-muted-foreground">
                  {d.fc || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold">
        <span className="text-red-700">Debit: {debitQty}</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-emerald-700">Covered: +{coveredQty}</span>
      </div>
      {partial && uncoveredQty > 0 ? (
        <div className="border-t border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          ⚠ Still open: {uncoveredQty} unit{uncoveredQty === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

const COV_LABEL: Record<AdjCoverageType, string> = {
  reimbursed: "✓ Reimbursed",
  found: "✓ Found",
  "grade-resell": "♻ Grade & Resell",
  "disposition-change": "↔ Dispo Change",
  case: "⚖ Case",
  "manual-adj": "🔧 Manual Adj",
  partial: "▲ Partial",
  open: "○ Open",
};

const COV_CLS: Record<AdjCoverageType, string> = {
  reimbursed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  found: "border-blue-200 bg-blue-50 text-blue-700",
  "grade-resell": "border-teal-200 bg-teal-50 text-teal-700",
  "disposition-change": "border-purple-200 bg-purple-50 text-purple-700",
  case: "border-sky-200 bg-sky-50 text-sky-700",
  "manual-adj": "border-indigo-200 bg-indigo-50 text-indigo-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  open: "border-slate-200 bg-slate-50 text-slate-600",
};

function coverageLabel(c: AdjCoverageType): string {
  return COV_LABEL[c];
}
function coverageCls(c: AdjCoverageType): string {
  return COV_CLS[c];
}

function ReimbDetailTable({
  details,
  totalQty,
  totalAmount,
}: {
  details: AdjLedgerReimbDetail[];
  totalQty?: number;
  totalAmount?: number;
}) {
  const sorted = [...details].sort((a, b) =>
    a.approvalDate < b.approvalDate ? 1 : a.approvalDate > b.approvalDate ? -1 : 0,
  );
  return (
    <div>
    <table className="w-full text-[11px]">
      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-2 py-1 text-left font-semibold">Date</th>
          <th className="px-2 py-1 text-left font-semibold">Reimb ID</th>
          <th className="px-2 py-1 text-left font-semibold">Case ID</th>
          <th className="px-2 py-1 text-left font-semibold">Reason</th>
          <th className="px-2 py-1 text-right font-semibold">Qty</th>
          <th className="px-2 py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {sorted.map((d, i) => (
          <tr key={`${d.reimbId}|${i}`}>
            <td className="px-2 py-1 font-mono">{d.approvalDate || "—"}</td>
            <td className="px-2 py-1 font-mono text-[10px] text-slate-500">
              {d.reimbId || "—"}
            </td>
            <td
              className={cn(
                "px-2 py-1 font-mono",
                d.caseId ? "" : "text-slate-400",
              )}
              title={
                d.caseId
                  ? undefined
                  : "Auto-reimbursed by Amazon (no case required)"
              }
            >
              {d.caseId || "—"}
            </td>
            <td className={cn("px-2 py-1", reimbReasonCls(d.reason))}>
              {d.reason || "—"}
            </td>
            <td className="px-2 py-1 text-right font-mono tabular-nums font-bold text-emerald-700">
              +{Math.round(d.qtyCash)}
            </td>
            <td className="px-2 py-1 text-right font-mono tabular-nums font-bold text-emerald-700">
              ${d.amount.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      {totalQty != null && totalAmount != null && details.length > 1 ? (
        <div className="border-t border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
          Total: {Math.round(totalQty)} unit{Math.round(totalQty) === 1 ? "" : "s"} · $
          {totalAmount.toFixed(2)}
        </div>
      ) : null}
      <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-muted-foreground">
        Case ID &apos;—&apos; = Amazon reimbursed automatically without a seller claim
      </div>
    </div>
  );
}

function reimbReasonCls(reason: string): string {
  const r = (reason ?? "").toLowerCase();
  if (r === "lost_warehouse") return "text-amber-800";
  if (r === "damaged_warehouse") return "text-orange-700";
  return "text-slate-600";
}

function ActionCell({
  event,
  mskuRow,
  onCase,
  onAdjust,
}: {
  event: AdjLedgerRow;
  mskuRow: AdjAnalysisRow | null;
  onCase?: (row: AdjAnalysisRow, event: AdjLedgerRow) => void;
  onAdjust?: (row: AdjAnalysisRow, event: AdjLedgerRow) => void;
}) {
  // GNR pattern: always render both icon buttons. Highlight color when the
  // row needs action (take-action / waiting); muted when reconciled or
  // grade-resell. Disabled only if the MSKU lookup failed.
  const needs =
    event.actionStatus === "take-action" || event.actionStatus === "waiting";
  const disabled = !mskuRow;
  return (
    <div className="flex justify-center gap-1">
      <button
        type="button"
        title="Raise Case"
        disabled={disabled}
        onClick={() => mskuRow && onCase?.(mskuRow, event)}
        className={cn(
          "flex size-[26px] items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          needs
            ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100"
            : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
        )}
      >
        <FileText className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Adjust"
        disabled={disabled}
        onClick={() => mskuRow && onAdjust?.(mskuRow, event)}
        className={cn(
          "flex size-[26px] items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          needs
            ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
            : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
        )}
      >
        <Wrench className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
        className,
      )}
    >
      {children}
    </TableHead>
  );
}

// Header label + GNR-style total sub-line. Total color: emerald for positive,
// red for negative, slate-400 for zero. `signed` adds an explicit + prefix.
function ThWithTotal({
  label,
  total,
  signed,
  subtitle,
}: {
  label: string;
  total: number;
  signed?: boolean;
  subtitle?: string;
}) {
  const rounded = Math.round(total);
  const cls =
    rounded > 0
      ? "text-emerald-700"
      : rounded < 0
        ? "text-red-600"
        : "text-slate-400";
  const display =
    signed && rounded > 0 ? `+${rounded.toLocaleString()}` : rounded.toLocaleString();
  return (
    <div className="flex flex-col items-end">
      <span>{label}</span>
      <span
        className={cn(
          "mt-0.5 font-mono text-[11px] font-bold tabular-nums normal-case tracking-normal",
          cls,
        )}
      >
        {display}
      </span>
      {subtitle ? (
        <span className="text-[9px] font-normal normal-case tracking-normal text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
