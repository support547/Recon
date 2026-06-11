"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AsinReturnRow, ReturnsReconRow } from "@/lib/returns-reconciliation/types";

type Filter = "all" | "case" | "pending" | "gnr" | "resolved" | "investigate";

export function AsinDetailModal({
  summary,
  onClose,
  onRaiseCase,
  onAdjust,
}: {
  summary: AsinReturnRow;
  onClose: () => void;
  onRaiseCase: (row: ReturnsReconRow, caseReason: string) => void;
  onAdjust: (row: ReturnsReconRow) => void;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = React.useMemo(() => {
    switch (filter) {
      case "case":       return summary.rows.filter((r) => r.finalStatus === "CASE_NEEDED" || r.finalStatus === "UNKNOWN_GNR_CASE");
      case "pending":    return summary.rows.filter((r) => r.finalStatus === "PENDING");
      case "gnr":        return summary.rows.filter((r) => r.finalStatus === "GNR_TRACKING" || r.finalStatus === "TRANSFERRED_TO_GNR");
      case "resolved":   return summary.rows.filter((r) => r.finalStatus === "RESOLVED");
      case "investigate":return summary.rows.filter((r) => r.finalStatus === "INVESTIGATE");
      default:           return summary.rows;
    }
  }, [summary.rows, filter]);

  const counts = {
    all:         summary.rows.length,
    case:        summary.rows.filter((r) => r.finalStatus === "CASE_NEEDED" || r.finalStatus === "UNKNOWN_GNR_CASE").length,
    pending:     summary.rows.filter((r) => r.finalStatus === "PENDING").length,
    gnr:         summary.rows.filter((r) => r.finalStatus === "GNR_TRACKING" || r.finalStatus === "TRANSFERRED_TO_GNR").length,
    resolved:    summary.rows.filter((r) => r.finalStatus === "RESOLVED").length,
    investigate: summary.rows.filter((r) => r.finalStatus === "INVESTIGATE").length,
  };

  function statusBadge(row: ReturnsReconRow) {
    const cfg: Record<string, { label: string; cls: string }> = {
      RESOLVED:          { label: "✓ Resolved",      cls: "bg-emerald-50 text-emerald-700" },
      PENDING:           { label: "⏱ Pending",        cls: "bg-slate-50 text-slate-600" },
      CASE_NEEDED:       { label: "⚠ Case Needed",    cls: "bg-red-50 text-red-700 font-semibold" },
      GNR_TRACKING:      { label: "↻ GNR",            cls: "bg-purple-50 text-purple-700" },
      TRANSFERRED_TO_GNR:{ label: "↻ To GNR (LPN)",  cls: "bg-purple-50 text-purple-700" },
      UNKNOWN_GNR_CASE:  { label: "✕ Unknown GNR",   cls: "bg-red-50 text-red-700" },
      INVESTIGATE:       { label: "? Investigate",    cls: "bg-amber-50 text-amber-700" },
    };
    const c = cfg[row.finalStatus] ?? { label: row.finalStatus, cls: "" };
    return (
      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", c.cls)}>
        {c.label}
      </span>
    );
  }

  // Close on backdrop click
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-5xl max-h-[80vh] overflow-hidden rounded-xl bg-background shadow-2xl border border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">
                {summary.asin}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground line-clamp-1">
                {summary.title}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{summary.returnedQty} returned</span>
              {summary.inventoryQty > 0 && (
                <span className="text-emerald-600">· {summary.inventoryQty} in inventory</span>
              )}
              {summary.reimbursedQty > 0 && (
                <span className="text-blue-600">· {summary.reimbursedQty} reimbursed</span>
              )}
              {summary.gnrQty + summary.transferredGnrQty > 0 && (
                <span className="text-purple-600">
                  · {summary.gnrQty + summary.transferredGnrQty} GNR
                </span>
              )}
              {summary.adjustedQty > 0 && (
                <span className="text-slate-500">· {summary.adjustedQty} adjusted</span>
              )}
              {summary.pendingQty > 0 && (
                <span className="text-red-600 font-semibold">
                  · {summary.pendingQty} pending
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 border-b border-border px-5 py-2">
          {(["all", "case", "pending", "gnr", "resolved", "investigate"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f === "all"         ? `All (${counts.all})`
               : f === "case"     ? `Case Needed (${counts.case})`
               : f === "pending"  ? `Pending (${counts.pending})`
               : f === "gnr"      ? `GNR (${counts.gnr})`
               : f === "resolved" ? `Resolved (${counts.resolved})`
               : `Investigate (${counts.investigate})`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr className="border-b border-border">
                {[
                  ["Order ID",    "text-left",  "w-[160px]"],
                  ["Return Date", "text-left",  "w-[100px]"],
                  ["FNSKU",       "text-left",  "w-[110px]"],
                  ["MSKU",        "text-left",  ""],
                  ["Days",        "text-right", "w-[55px]"],
                  ["Qty",         "text-right", "w-[40px]"],
                  ["Disposition", "text-left",  "w-[120px]"],
                  ["Adj Qty",     "text-right", "w-[65px]"],
                  ["Status",      "text-left",  "w-[130px]"],
                  ["Action",      "text-right", "w-[160px]"],
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No rows match this filter
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={`${row.orderId}|${row.returnFnsku}`}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        title="Click to copy"
                        onClick={() => navigator.clipboard?.writeText(row.orderId)}
                        className="font-mono text-[10px] font-semibold text-foreground hover:text-blue-600 transition-colors text-left"
                      >
                        {row.orderId}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {row.latestReturn || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground" title={row.returnFnsku}>
                        {row.returnFnsku !== "—"
                          ? row.returnFnsku.length > 12
                            ? `${row.returnFnsku.slice(0, 12)}…`
                            : row.returnFnsku
                          : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="block max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-muted-foreground"
                        title={row.msku}
                      >
                        {row.msku}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn(
                        "font-mono text-xs font-semibold",
                        row.daysSinceReturn > 60 ? "text-red-600" : "text-amber-600",
                      )}>
                        {row.daysSinceReturn >= 0 ? row.daysSinceReturn : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-xs">{row.totalReturned}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {row.dispositions.split(",")[0]?.trim() ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn(
                        "font-mono text-xs",
                        row.adjQty > 0 ? "text-blue-600 font-semibold" : "text-muted-foreground",
                      )}>
                        {row.adjQty > 0 ? `+${row.adjQty}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(row)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(row.finalStatus === "CASE_NEEDED" ||
                          row.finalStatus === "UNKNOWN_GNR_CASE") && (
                          <button
                            type="button"
                            onClick={() =>
                              onRaiseCase(
                                row,
                                `Return order ${row.orderId} MSKU ${row.msku} ` +
                                `ASIN ${row.asin} — ${row.dispositions} ` +
                                `— ${row.daysSinceReturn}d overdue, no reimbursement.`,
                              )
                            }
                            className="rounded bg-red-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-600 transition-colors"
                          >
                            Raise Case
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onAdjust(row)}
                          className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          Adjust
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
