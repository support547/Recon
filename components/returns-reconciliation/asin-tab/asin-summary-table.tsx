"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AsinReturnRow, ReturnsReconRow } from "@/lib/returns-reconciliation/types";
import { AsinDetailModal } from "./asin-detail-modal";

const PAGE_SIZE = 20;

const STATUS_CFG = {
  CASE_NEEDED:  { label: "⚠ Raise Case", cls: "bg-red-50 text-red-700 font-semibold border border-red-200" },
  INVESTIGATE:  { label: "? Investigate", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  PENDING:      { label: "⏱ Pending",    cls: "bg-slate-50 text-slate-600 border border-slate-200" },
  RESOLVED:     { label: "✓ Resolved",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
};

export function AsinSummaryTable({
  asinRows,
  onRaiseCase,
  onAdjust,
}: {
  asinRows: AsinReturnRow[];
  onRaiseCase: (row: ReturnsReconRow, caseReason: string) => void;
  onAdjust: (row: ReturnsReconRow) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [detailAsin, setDetailAsin] = React.useState<AsinReturnRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(asinRows.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = asinRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startItem  = asinRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem    = Math.min(safePage * PAGE_SIZE, asinRows.length);

  // Summary stats
  const totals = React.useMemo(() => ({
    returned:       asinRows.reduce((s, r) => s + r.returnedQty, 0),
    inventory:      asinRows.reduce((s, r) => s + r.inventoryQty, 0),
    reimbursed:     asinRows.reduce((s, r) => s + r.reimbursedQty, 0),
    adjusted:       asinRows.reduce((s, r) => s + r.adjustedQty, 0),
    pending:        asinRows.reduce((s, r) => s + r.pendingQty, 0),
    caseNeeded:     asinRows.filter((r) => r.asinStatus === "CASE_NEEDED").length,
    resolved:       asinRows.filter((r) => r.asinStatus === "RESOLVED").length,
  }), [asinRows]);

  function numCell(
    val: number,
    colorCls = "",
    bold = false,
  ) {
    if (val === 0)
      return (
        <td className="px-3 py-2.5 text-right">
          <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
        </td>
      );
    return (
      <td className="px-3 py-2.5 text-right">
        <span className={cn("font-mono text-[11px] tabular-nums", colorCls, bold && "font-bold")}>
          {val}
        </span>
      </td>
    );
  }

  return (
    <>
      {/* Summary stat bar */}
      <div className="mb-3 grid grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="font-mono text-lg font-semibold tabular-nums">{asinRows.length}</div>
          <div className="text-muted-foreground">Unique ASINs</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="font-mono text-lg font-semibold tabular-nums text-red-600">{totals.caseNeeded}</div>
          <div className="text-red-600/70">Need Action</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="font-mono text-lg font-semibold tabular-nums text-red-600">{totals.pending}</div>
          <div className="text-muted-foreground">Pending Units</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="font-mono text-lg font-semibold tabular-nums text-emerald-600">{totals.resolved}</div>
          <div className="text-emerald-600/70">Fully Resolved</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                ["ASIN",           "text-left",  "w-[100px]"],
                ["Title",          "text-left",  ""],
                ["Returned",       "text-right", "w-[75px]"],
                ["Inventory Qty",  "text-right", "w-[100px]"],
                ["Reimbursed",     "text-right", "w-[85px]"],
                ["Adjusted",       "text-right", "w-[75px]"],
                ["Pending",        "text-right", "w-[75px]"],
                ["Status",         "text-left",  "w-[120px]"],
                ["",               "text-right", "w-[55px]"],
              ].map(([label, align, width]) => (
                <th
                  key={label || "action"}
                  className={cn(
                    "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                    align, width,
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No returns found
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const statusCfg = STATUS_CFG[r.asinStatus];
                return (
                  <tr
                    key={r.asin}
                    className={cn(
                      "hover:bg-muted/20 transition-colors",
                      r.asinStatus === "CASE_NEEDED" && "bg-red-50/10",
                    )}
                  >
                    {/* ASIN — clickable */}
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetailAsin(r)}
                        className="font-mono text-[11px] font-semibold text-blue-600 hover:underline text-left"
                      >
                        {r.asin}
                      </button>
                    </td>

                    {/* Title */}
                    <td className="px-3 py-2.5">
                      <span
                        className="block max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-foreground"
                        title={r.title}
                      >
                        {r.title || "—"}
                      </span>
                    </td>

                    {/* Quantities */}
                    {numCell(r.returnedQty, "text-foreground", true)}

                    {/* Inventory Qty — FBA summary + GNR, with breakdown popup */}
                    <td className="px-3 py-2.5 text-right">
                      {r.inventoryQty === 0 ? (
                        <span className="font-mono text-[11px] text-muted-foreground/40">—</span>
                      ) : (
                        <span className="group relative inline-block">
                          <span className="cursor-help font-mono text-[11px] tabular-nums text-emerald-600 underline decoration-dotted underline-offset-2">
                            {r.inventoryQty}
                          </span>
                          <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max min-w-[160px] rounded-md border border-border bg-popover px-3 py-2 text-left shadow-lg group-hover:block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Inventory breakdown
                            </span>
                            <span className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-muted-foreground">FBA Summary</span>
                              <span className="font-mono tabular-nums text-emerald-600">{r.inventoryFbaQty}</span>
                            </span>
                            <span className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-muted-foreground">GNR</span>
                              <span className="font-mono tabular-nums text-purple-600">{r.gnrQty}</span>
                            </span>
                            <span className="flex items-center justify-between gap-4 text-[11px]">
                              <span className="text-muted-foreground">Transfer GNR (LPN)</span>
                              <span className="font-mono tabular-nums text-purple-500">{r.transferredGnrQty}</span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1 text-[11px] font-semibold">
                              <span>Total</span>
                              <span className="font-mono tabular-nums text-emerald-600">{r.inventoryQty}</span>
                            </span>
                          </span>
                        </span>
                      )}
                    </td>

                    {numCell(r.reimbursedQty, "text-blue-600")}
                    {numCell(r.adjustedQty, "text-slate-600")}
                    {numCell(r.pendingQty, "text-amber-600", true)}

                    {/* Status badge */}
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", statusCfg.cls)}>
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* View button */}
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailAsin(r)}
                        className="rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Totals footer row */}
          {asinRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-3 py-2 text-[10px] font-semibold text-muted-foreground" colSpan={2}>
                  TOTALS — {asinRows.length} ASINs
                </td>
                {[
                  [totals.returned,   "text-foreground font-bold"],
                  [totals.inventory,  "text-emerald-600"],
                  [totals.reimbursed, "text-blue-600"],
                  [totals.adjusted,   "text-slate-600"],
                  [totals.pending,    "text-red-600 font-bold"],
                ].map(([val, cls], i) => (
                  <td key={i} className="px-3 py-2 text-right">
                    <span className={cn("font-mono text-[11px] tabular-nums", cls as string)}>
                      {(val as number) > 0 ? val : "—"}
                    </span>
                  </td>
                ))}
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {asinRows.length > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Showing {startItem}–{endItem} of {asinRows.length} ASINs
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === "number" &&
                    (p as number) - (arr[idx - 1] as number) > 1)
                  acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-[11px] text-muted-foreground">…</span>
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
              className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailAsin && (
        <AsinDetailModal
          summary={detailAsin}
          onClose={() => setDetailAsin(null)}
          onRaiseCase={onRaiseCase}
          onAdjust={onAdjust}
        />
      )}
    </>
  );
}
