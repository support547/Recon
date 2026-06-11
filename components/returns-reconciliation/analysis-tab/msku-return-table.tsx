"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileText, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";
import { dispositionLabel } from "@/lib/returns-reconciliation/disposition-labels";
import {
  returnActionStatus,
  RETURN_ACTION_BADGE,
  statusesForFilter,
  type StatusCardFilter,
  type ReturnActionStatus,
} from "@/lib/returns-reconciliation/return-action-status";

const PAGE_SIZE_OPTIONS = [15, 30, 50] as const;

type QtyCol = "return" | "inv" | "reimb" | "gnr" | "case" | "adj";

const QTY_ACCESSOR: Record<QtyCol, (r: ReturnsReconRow) => number> = {
  return: (r) => r.totalReturned,
  inv: (r) => r.inventoryQty,
  reimb: (r) => r.reimbOrderMskuQty,
  gnr: (r) => r.gnrLpnQty,
  case: (r) => r.caseClaimedQty,
  adj: (r) => r.adjQty,
};

const QTY_COLS: { key: QtyCol; label: string; width: string }[] = [
  { key: "return", label: "Return", width: "w-[75px]" },
  { key: "inv",    label: "Inv",    width: "w-[65px]" },
  { key: "reimb",  label: "Reimb",  width: "w-[75px]" },
  { key: "gnr",    label: "GNR",    width: "w-[70px]" },
  { key: "case",   label: "Case",   width: "w-[110px]" },
  { key: "adj",    label: "Adj",    width: "w-[95px]" },
];


// Tooltip component for showing overflow items
function OverflowTooltip({
  primary,
  all,
  label = "more",
}: {
  primary: string;
  all: string[];
  label?: string;
}) {
  const extras = all.filter((v) => v !== primary);
  if (extras.length === 0) {
    return (
      <span className="whitespace-nowrap font-mono text-[10px] text-foreground">
        {primary || "—"}
      </span>
    );
  }
  return (
    <span className="group relative inline-flex items-center gap-1">
      <span className="font-mono text-[10px] text-foreground">{primary}</span>
      <span className="cursor-default rounded bg-muted px-1 text-[9px] text-muted-foreground">
        +{extras.length} {label}
      </span>
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-max max-w-[260px] rounded-md border border-border bg-background p-2 shadow-lg group-hover:block">
        {extras.map((v) => (
          <span key={v} className="block font-mono text-[10px] text-foreground py-0.5">
            {v}
          </span>
        ))}
      </span>
    </span>
  );
}

export function MskuReturnTable({
  rows,
  searchQuery,
  statusFilter = "ALL",
  onRaiseCase,
  onAdjust,
}: {
  rows: ReturnsReconRow[];
  searchQuery?: string;
  statusFilter?: StatusCardFilter | ReturnActionStatus;
  onRaiseCase?: (row: ReturnsReconRow) => void;
  onAdjust?: (row: ReturnsReconRow) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(PAGE_SIZE_OPTIONS[0]);
  // Per-column non-zero filter (click a qty total to toggle), mirrors Full Recon
  const [qtyFilter, setQtyFilter] = React.useState<Set<QtyCol>>(new Set());

  // Apply search filter
  const searched = React.useMemo(() => {
    if (!searchQuery?.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.orderId.toLowerCase().includes(q) ||
        r.msku.toLowerCase().includes(q) ||
        r.returnFnsku.toLowerCase().includes(q) ||
        r.asin.toLowerCase().includes(q) ||
        r.fc.toLowerCase().includes(q) ||
        r.lpn.toLowerCase().includes(q) ||
        r.lpnAll.some((l) => l.toLowerCase().includes(q)),
    );
  }, [rows, searchQuery]);

  // Scope to the active status group (driven by the cards / Status dropdown)
  const statusScoped = React.useMemo(() => {
    if (!statusFilter || statusFilter === "ALL") return searched;
    const allowed = new Set(statusesForFilter(statusFilter));
    return searched.filter((r) => allowed.has(returnActionStatus(r).status));
  }, [searched, statusFilter]);

  // Column totals — summed across the status-scoped set (match visible rows)
  const colTotals = React.useMemo(() => {
    const t: Record<QtyCol, number> = {
      return: 0, inv: 0, reimb: 0, gnr: 0, case: 0, adj: 0,
    };
    for (const r of statusScoped) {
      t.return += r.totalReturned;
      t.inv += r.inventoryQty;
      t.reimb += r.reimbOrderMskuQty;
      t.gnr += r.gnrLpnQty;
      t.case += r.caseClaimedQty;
      t.adj += r.adjQty;
    }
    return t;
  }, [statusScoped]);

  // Apply active non-zero column filters on top of search + status
  const filtered = React.useMemo(() => {
    if (qtyFilter.size === 0) return statusScoped;
    return statusScoped.filter((r) =>
      [...qtyFilter].every((c) => QTY_ACCESSOR[c](r) !== 0),
    );
  }, [statusScoped, qtyFilter]);

  const toggleQtyCol = (c: QtyCol) => {
    setQtyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
    setPage(1);
  };

  // Reset page on filter change — adjust during render (no effect needed)
  const [lastQuery, setLastQuery] = React.useState(searchQuery);
  const [lastStatus, setLastStatus] = React.useState(statusFilter);
  if (searchQuery !== lastQuery || statusFilter !== lastStatus) {
    setLastQuery(searchQuery);
    setLastStatus(statusFilter);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startItem  = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem    = Math.min(safePage * pageSize, filtered.length);

  return (
    <div className="space-y-2">
      {/* Table */}
      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)]">
            <tr className="border-b-2 border-slate-300 bg-slate-100">
              {[
                ["Order ID",    "text-left",  "w-[150px]"],
                ["Return Date", "text-left",  "w-[96px]"],
                ["FNSKU / ASIN", "text-left", "w-[120px]"],
                ["Title / MSKU", "text-left", ""],
                ["LPN",         "text-left",  "w-[140px]"],
                ["FC",          "text-left",  "w-[60px]"],
                ["Disposition", "text-left",  "w-[150px]"],
              ].map(([label, align, width]) => (
                <th
                  key={label}
                  className={cn(
                    "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                    align, width,
                  )}
                >
                  {label}
                </th>
              ))}
              {QTY_COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground text-right",
                    c.width,
                  )}
                >
                  <div className="flex flex-col items-end">
                    <span>{c.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleQtyCol(c.key)}
                      title="Click to show only rows with a value in this column"
                      className={cn(
                        "mt-0.5 font-mono text-[9px] font-bold tabular-nums transition",
                        qtyFilter.has(c.key)
                          ? "rounded bg-blue-600 px-1.5 text-white"
                          : "rounded px-1 text-blue-600 hover:bg-blue-50",
                      )}
                    >
                      {colTotals[c.key] >= 0 ? "+" : ""}
                      {colTotals[c.key].toLocaleString()}
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-[120px]">
                Status
              </th>
              <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground w-[80px]">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No returns match the current filter
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const action = returnActionStatus(row);
                return (
                <tr
                  key={`${row.orderId}|${row.msku}`}
                  className="hover:bg-muted/20 transition-colors"
                >
                  {/* Order ID — click to copy */}
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      title="Click to copy order ID"
                      onClick={() => navigator.clipboard?.writeText(row.orderId)}
                      className="whitespace-nowrap font-mono text-[10px] font-semibold text-foreground hover:text-blue-600 transition-colors text-left"
                    >
                      {row.orderId}
                    </button>
                  </td>

                  {/* Return Date */}
                  <td className="px-3 py-2.5">
                    <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                      {row.latestReturn || row.earliestReturn || "—"}
                    </span>
                  </td>

                  {/* FNSKU / ASIN — stacked */}
                  <td className="px-3 py-2.5">
                    <span className="block font-mono text-[10px] text-foreground">
                      {row.returnFnsku !== "—" ? row.returnFnsku : "—"}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {row.asin !== "—" ? row.asin : "—"}
                    </span>
                  </td>

                  {/* MSKU / Title — stacked */}
                  <td className="px-3 py-2.5">
                    <span
                      className="block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-foreground"
                      title={row.msku}
                    >
                      {row.msku}
                    </span>
                    <span
                      className="block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground"
                      title={row.title}
                    >
                      {row.title || "—"}
                    </span>
                  </td>

                  {/* LPN — primary + tooltip for extras */}
                  <td className="px-3 py-2.5">
                    <OverflowTooltip
                      primary={row.lpn}
                      all={row.lpnAll}
                      label="LPN"
                    />
                  </td>

                  {/* FC */}
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {row.fc || "—"}
                    </span>
                  </td>

                  {/* Disposition — primary + tooltip (raw codes → short labels) */}
                  <td className="px-3 py-2.5">
                    <OverflowTooltip
                      primary={dispositionLabel(row.dispositions.split(",")[0] ?? "—")}
                      all={row.dispositions
                        .split(",")
                        .map((d) => dispositionLabel(d))}
                      label="more"
                    />
                  </td>

                  {/* Return Qty */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-[11px] font-semibold tabular-nums">
                      {row.totalReturned}
                    </span>
                  </td>

                  {/* Inventory Qty — from FbaSummary daily match */}
                  <td className="px-3 py-2.5 text-right">
                    {row.inventoryQty > 0 ? (
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-600">
                        {row.inventoryQty}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Reimb Qty — net cash matched on orderId + MSKU; hover for detail.
                      Reversals (originalReimbId set) carry negative qty/amount and
                      net against the original. */}
                  <td className="px-3 py-2.5 text-right">
                    {row.reimbDetails.length > 0 ? (
                      <span className="group relative inline-flex justify-end">
                        <span
                          className={cn(
                            "cursor-default font-mono text-[11px] font-semibold tabular-nums",
                            row.reimbOrderMskuQty > 0
                              ? "text-blue-600"
                              : row.reimbOrderMskuQty < 0
                                ? "text-red-600"
                                : "text-muted-foreground",
                          )}
                        >
                          {row.reimbOrderMskuQty}
                        </span>
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-max min-w-[260px] rounded-md border border-border bg-background p-2 text-left shadow-lg group-hover:block">
                          <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {row.reimbDetails.length} reimbursement
                            {row.reimbDetails.length > 1 ? "s" : ""}
                            {row.reimbDetails.some((d) => d.isReversal) && (
                              <span className="ml-1 text-red-600">· incl. reversal</span>
                            )}
                          </span>
                          {row.reimbDetails.map((d, i) => (
                            <span
                              key={`${d.reimbId}-${i}`}
                              className={cn(
                                "block border-t border-border/50 py-1 first:border-t-0",
                                d.isReversal && "bg-red-50/60",
                              )}
                            >
                              <span className="mb-0.5 flex items-center gap-1">
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    d.isReversal ? "text-red-600" : "text-foreground",
                                  )}
                                >
                                  {d.reason || "—"}
                                </span>
                                {d.isReversal && (
                                  <span className="rounded bg-red-100 px-1 text-[8px] font-bold uppercase text-red-700">
                                    reversal
                                  </span>
                                )}
                              </span>
                              <span className="grid grid-cols-[auto_1fr] gap-x-2 text-[10px]">
                                <span className="text-muted-foreground">Date</span>
                                <span className="font-mono text-foreground">{d.date || "—"}</span>
                                <span className="text-muted-foreground">Reimb ID</span>
                                <span className="font-mono text-foreground">{d.reimbId || "—"}</span>
                                <span className="text-muted-foreground">Case ID</span>
                                <span className="font-mono text-foreground">{d.caseId || "—"}</span>
                                <span className="text-muted-foreground">Qty</span>
                                <span
                                  className={cn(
                                    "font-mono tabular-nums",
                                    d.qty < 0 ? "text-red-600" : "text-foreground",
                                  )}
                                >
                                  {d.qty}
                                </span>
                                <span className="text-muted-foreground">Amount</span>
                                <span
                                  className={cn(
                                    "font-mono tabular-nums",
                                    d.amount < 0 ? "text-red-600" : "text-foreground",
                                  )}
                                >
                                  ${d.amount.toFixed(2)}
                                </span>
                              </span>
                            </span>
                          ))}
                          {/* Net total */}
                          <span className="mt-1 flex items-center justify-between border-t border-border pt-1 text-[10px] font-semibold">
                            <span className="text-muted-foreground">Net</span>
                            <span className="flex gap-3">
                              <span className="font-mono tabular-nums text-foreground">
                                {row.reimbOrderMskuQty} qty
                              </span>
                              <span
                                className={cn(
                                  "font-mono tabular-nums",
                                  row.reimbNetAmount < 0 ? "text-red-600" : "text-foreground",
                                )}
                              >
                                ${row.reimbNetAmount.toFixed(2)}
                              </span>
                            </span>
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* GNR Qty — GnrReport.quantity matched by LPN */}
                  <td className="px-3 py-2.5 text-right">
                    {row.gnrLpnQty > 0 ? (
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-amber-600">
                        {row.gnrLpnQty}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Case — claimed qty only; hover for status / case ID / remarks */}
                  <td className="px-3 py-2.5 text-right">
                    {row.caseCount > 0 ? (
                      <span className="group relative inline-flex justify-end">
                        <span className="cursor-help font-mono text-[11px] font-semibold tabular-nums text-orange-600">
                          +{row.caseClaimedQty}
                        </span>
                        {/* Tooltip */}
                        <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-max min-w-[200px] max-w-[280px] rounded-md border border-border bg-background p-2 text-left shadow-lg group-hover:block">
                          <span className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                            <span className="text-muted-foreground">Status</span>
                            <span
                              className={cn(
                                "font-semibold",
                                /resolved/i.test(row.caseStatusTop)
                                  ? "text-emerald-600"
                                  : /reject/i.test(row.caseStatusTop)
                                    ? "text-red-600"
                                    : "text-orange-600",
                              )}
                            >
                              {row.caseStatusTop}
                            </span>
                            <span className="text-muted-foreground">Claimed</span>
                            <span className="font-mono tabular-nums text-foreground">{row.caseClaimedQty}</span>
                            {row.caseReimbQty > 0 && (
                              <>
                                <span className="text-muted-foreground">Approved</span>
                                <span className="font-mono tabular-nums text-emerald-600">
                                  {row.caseReimbQty}
                                  {row.caseReimbAmount > 0 ? ` · $${row.caseReimbAmount.toFixed(2)}` : ""}
                                </span>
                              </>
                            )}
                            <span className="text-muted-foreground">Case ID</span>
                            <span className="font-mono text-foreground">{row.caseIds || "—"}</span>
                            {row.caseRemarks && (
                              <>
                                <span className="text-muted-foreground">Remarks</span>
                                <span className="text-foreground">{row.caseRemarks}</span>
                              </>
                            )}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Adjustment — signed qty only; hover for reasons/remarks */}
                  <td className="px-3 py-2.5 text-right">
                    {row.adjQty !== 0 ? (
                      <span className="group relative inline-flex justify-end">
                        <span
                          className={cn(
                            "cursor-help font-mono text-[11px] font-semibold tabular-nums",
                            row.adjQty > 0 ? "text-emerald-600" : "text-red-600",
                          )}
                        >
                          {row.adjQty > 0 ? "+" : ""}
                          {row.adjQty}
                        </span>
                        {row.adjReasons && (
                          <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-max min-w-[180px] max-w-[280px] rounded-md border border-border bg-background p-2 text-left shadow-lg group-hover:block">
                            <span className="grid grid-cols-[auto_1fr] gap-x-2 text-[10px]">
                              <span className="text-muted-foreground">Reason</span>
                              <span className="text-foreground">{row.adjReasons}</span>
                            </span>
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Status — qty-based derived status (see return-action-status) */}
                  <td className="px-3 py-2.5">
                    {(() => {
                      const badge = RETURN_ACTION_BADGE[action.status];
                      return (
                        <span
                          className={cn(
                            "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Action — raise case / adjust. Buttons stay clickable on
                      settled rows but are de-emphasized when no action is needed. */}
                  <td className="px-3 py-2.5">
                    <div className="flex justify-center gap-1">
                      <button
                        type="button"
                        title="Raise Case"
                        onClick={() => onRaiseCase?.(row)}
                        className={cn(
                          "flex size-[26px] items-center justify-center rounded-md border transition-colors",
                          action.needsAction
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                            : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
                        )}
                      >
                        <FileText className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        title="Adjust"
                        onClick={() => onAdjust?.(row)}
                        className={cn(
                          "flex size-[26px] items-center justify-center rounded-md border transition-colors",
                          action.needsAction
                            ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
                            : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
                        )}
                      >
                        <Wrench className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination + count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {filtered.length === rows.length
              ? `${rows.length.toLocaleString()} returns`
              : `${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} returns`}
            {filtered.length > 0 &&
              ` · Showing ${startItem}–${endItem}`}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              className="h-7 rounded border border-border bg-background px-1.5 text-[11px]"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length > pageSize && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) =>
                p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
              )
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (
                  idx > 0 &&
                  typeof arr[idx - 1] === "number" &&
                  (p as number) - (arr[idx - 1] as number) > 1
                )
                  acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-[11px] text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p as number)}
                    className={cn(
                      "flex h-7 min-w-[28px] items-center justify-center rounded border px-2 text-[11px] transition-colors",
                      safePage === p
                        ? "border-foreground bg-foreground font-medium text-background"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {p}
                  </button>
                ),
              )}

            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setPage(safePage + 1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
