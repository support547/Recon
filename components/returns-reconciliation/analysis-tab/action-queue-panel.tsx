"use client";

import * as React from "react";
import { AlertTriangle, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReturnsReconRow } from "@/lib/returns-reconciliation/types";

type PriorityLevel = 1 | 2 | 3;

type ActionRow = {
  row: ReturnsReconRow;
  priority: PriorityLevel;
  actionLabel: string;
  caseReason: string;
  showRaise: boolean;
  showAdjust: boolean;
};

function classifyRow(row: ReturnsReconRow): ActionRow | null {
  const { finalStatus, inventoryStatus, reimbStatus } = row;

  // Priority 1 — SELLABLE not confirmed in FBA inventory
  if (finalStatus === "CASE_NEEDED" &&
      inventoryStatus === "NOT_IN_INVENTORY") {
    return {
      row, priority: 1,
      actionLabel:
        `Sellable return not in FBA inventory — ` +
        `FbaSummary shows ${row.fbaSummaryConfirmedQty} ` +
        `of ${row.fbaSummaryExpectedQty} expected`,
      caseReason:
        `Amazon return report status: "Unit returned to inventory" (SELLABLE). ` +
        `FbaSummary.customerReturns for MSKU ${row.msku} shows ` +
        `${row.fbaSummaryConfirmedQty} vs ${row.fbaSummaryExpectedQty} expected. ` +
        `Unit not confirmed in FBA inventory. ` +
        `Return date: ${row.latestReturn}. ` +
        `Please confirm unit receipt or reimburse.`,
      showRaise: true, showAdjust: true,
    };
  }

  // Priority 1 — DAMAGED/DEFECTIVE, overdue
  if (finalStatus === "CASE_NEEDED") {
    const disp = row.dispositions.split(",")[0]?.trim() ?? "UNSELLABLE";
    return {
      row, priority: 1,
      actionLabel:
        `${disp} — ${row.daysSinceReturn}d overdue, no reimbursement`,
      caseReason:
        `Amazon return: "Unit returned to inventory", disposition ${disp}. ` +
        `No reimbursement received after ${row.daysSinceReturn} days ` +
        `(60-day SLA exceeded). Order: ${row.orderId}. ` +
        `MSKU: ${row.msku}. Please reimburse.`,
      showRaise: true, showAdjust: true,
    };
  }

  // Priority 1 — GNR MSKU with no match
  if (finalStatus === "UNKNOWN_GNR_CASE") {
    return {
      row, priority: 1,
      actionLabel:
        `GNR MSKU not matched to our GNR report — raise case`,
      caseReason:
        `Return report shows GNR MSKU "${row.msku}" with FNSKU ` +
        `${row.returnFnsku}. This FNSKU does not match any GNR listing ` +
        `in our account. Unit cannot be verified as ours. ` +
        `Please investigate and reimburse.`,
      showRaise: true, showAdjust: true,
    };
  }

  // Priority 2 — Amazon says "Reimbursed" but not in our report
  if (finalStatus === "INVESTIGATE" &&
      reimbStatus === "REIMBURSED_UNVERIFIED") {
    return {
      row, priority: 2,
      actionLabel:
        `Amazon says "Reimbursed" — not found in reimbursement report`,
      caseReason:
        `Amazon return status is "Reimbursed" for order ${row.orderId} ` +
        `MSKU ${row.msku}, but no matching record in our ` +
        `Reimbursement report. Please verify with Amazon.`,
      showRaise: false, showAdjust: true,
    };
  }

  // Priority 3 — order not in sales data
  if (finalStatus === "INVESTIGATE") {
    return {
      row, priority: 3,
      actionLabel: "Order not in sales data — check report upload coverage",
      caseReason: "",
      showRaise: false, showAdjust: true,
    };
  }

  // Priority 3 — GNR tracking (matched, informational)
  if (finalStatus === "GNR_TRACKING") {
    return {
      row, priority: 3,
      actionLabel:
        `GNR — in grade & resell program` +
        (row.gnrStatus ? ` (${row.gnrStatus})` : ""),
      caseReason: "",
      showRaise: false, showAdjust: false,
    };
  }

  // Priority 3 — LPN-confirmed transfer to GNR
  if (finalStatus === "TRANSFERRED_TO_GNR") {
    return {
      row, priority: 3,
      actionLabel:
        `Transferred to GNR after return — ` +
        `LPN ${row.lpn} matched in GNR report` +
        (row.gnrStatus ? ` (${row.gnrStatus})` : ""),
      caseReason: "",
      showRaise:  false,
      showAdjust: false,
    };
  }

  // Priority 3 — pending window
  if (finalStatus === "PENDING") {
    return {
      row, priority: 3,
      actionLabel:
        inventoryStatus === "PENDING_SUMMARY"
          ? `Return ${row.daysSinceReturn}d old — FbaSummary updating (3-day window)`
          : `Within 60-day SLA — ${row.daysSinceReturn}d since return`,
      caseReason: "",
      showRaise: false, showAdjust: false,
    };
  }

  // Priority 3 — resolved (informational)
  if (finalStatus === "RESOLVED") {
    return {
      row, priority: 3,
      actionLabel:
        inventoryStatus === "IN_INVENTORY"
          ? "Confirmed in FbaSummary inventory"
          : reimbStatus === "REIMBURSED_CASH"
            ? "Reimbursed in cash — verified"
            : reimbStatus === "REIMBURSED_INVENTORY"
              ? "Reimbursed in inventory — verified"
              : "Resolved",
      caseReason: "",
      showRaise: false, showAdjust: false,
    };
  }

  return null;
}

const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  1: "Raise case now",
  2: "Review needed",
  3: "Info",
};
const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  1: "bg-[#F7C1C1] text-[#791F1F]",
  2: "bg-[#FAC775] text-[#633806]",
  3: "bg-[#D3D1C7] text-[#444441]",
};
const PRIORITY_DOT: Record<PriorityLevel, string> = {
  1: "bg-red-500",
  2: "bg-amber-500",
  3: "bg-slate-400",
};
const ROW_BG: Record<PriorityLevel, string> = {
  1: "bg-red-50/20",
  2: "bg-amber-50/10",
  3: "",
};

type FilterKey =
  | "all" | "case" | "wrong" | "gnr"
  | "investigate" | "pending" | "resolved";

const PAGE_SIZE = 20;

export function ActionQueuePanel({
  rows,
  externalDisposition,
  externalSearch,
  externalFnskuStatus,
  onRaiseCase,
  onAdjust,
}: {
  rows: ReturnsReconRow[];
  externalDisposition?: string;
  externalSearch?: string;
  externalFnskuStatus?: string;
  onRaiseCase: (row: ReturnsReconRow, caseReason: string) => void;
  onAdjust: (row: ReturnsReconRow) => void;
}) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [page, setPage] = React.useState(1);

  // Reset page when filter changes
  React.useEffect(() => { setPage(1); }, [filter, externalDisposition, externalSearch, externalFnskuStatus]);

  // Build + classify action rows
  const allActionRows = React.useMemo(() => {
    let source = rows;

    // Apply external search filter
    if (externalSearch?.trim()) {
      const q = externalSearch.trim().toLowerCase();
      source = source.filter(
        (r) =>
          r.orderId.toLowerCase().includes(q) ||
          r.msku.toLowerCase().includes(q) ||
          r.returnFnsku.toLowerCase().includes(q) ||
          r.asin.toLowerCase().includes(q),
      );
    }

    // Apply external disposition filter
    if (externalDisposition && externalDisposition !== "All" && externalDisposition !== "") {
      source = source.filter((r) =>
        r.dispositions.toUpperCase().includes(externalDisposition.toUpperCase()),
      );
    }

    // Apply external FNSKU status filter (matches ownership OR final status)
    if (externalFnskuStatus &&
        externalFnskuStatus !== "" &&
        externalFnskuStatus !== "All Statuses") {
      source = source.filter(
        (r) =>
          r.ownershipStatus === externalFnskuStatus ||
          r.finalStatus     === externalFnskuStatus,
      );
    }

    return source
      .map(classifyRow)
      .filter((x): x is ActionRow => x !== null)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.row.daysSinceReturn - a.row.daysSinceReturn;
      });
  }, [rows, externalDisposition, externalSearch, externalFnskuStatus]);

  // Counts for filter tabs (mapped onto new finalStatus model)
  const counts = React.useMemo(() => ({
    all:         allActionRows.length,
    case:        allActionRows.filter(
      (a) => a.row.finalStatus === "CASE_NEEDED").length,
    wrong:       allActionRows.filter(
      (a) => a.row.finalStatus === "UNKNOWN_GNR_CASE").length,
    gnr:         allActionRows.filter(
      (a) => a.row.finalStatus === "GNR_TRACKING").length,
    transferred: allActionRows.filter(
      (a) => a.row.finalStatus === "TRANSFERRED_TO_GNR").length,
    investigate: allActionRows.filter(
      (a) => a.row.finalStatus === "INVESTIGATE").length,
    pending:     allActionRows.filter(
      (a) => a.row.finalStatus === "PENDING").length,
    resolved:    allActionRows.filter(
      (a) => a.row.finalStatus === "RESOLVED").length,
  }), [allActionRows]);

  // Apply action type filter
  const filtered = React.useMemo(() => {
    if (filter === "all") return allActionRows;
    if (filter === "case")
      return allActionRows.filter((a) => a.row.finalStatus === "CASE_NEEDED");
    if (filter === "wrong")
      return allActionRows.filter((a) => a.row.finalStatus === "UNKNOWN_GNR_CASE");
    if (filter === "gnr")
      return allActionRows.filter((a) => a.row.finalStatus === "GNR_TRACKING");
    if (filter === "investigate")
      return allActionRows.filter((a) => a.row.finalStatus === "INVESTIGATE");
    if (filter === "pending")
      return allActionRows.filter((a) => a.row.finalStatus === "PENDING");
    if (filter === "resolved")
      return allActionRows.filter((a) => a.row.finalStatus === "RESOLVED");
    return allActionRows;
  }, [allActionRows, filter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startItem = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, filtered.length);

  // No rows match filter
  if (allActionRows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span>○</span>
        <span className="font-medium">No rows match the current filter</span>
        <span className="text-slate-500">— try clearing the FNSKU Status or date filters</span>
      </div>
    );
  }

  const overdueCount = allActionRows.filter((a) => a.row.daysSinceReturn > 60 && a.priority === 1).length;

  return (
    <div className="space-y-3">

      {/* Alert bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="size-4 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {allActionRows.length} orders need action
              {overdueCount > 0 && ` — ${overdueCount} past 60-day Amazon window`}
            </p>
            <p className="text-xs text-red-600">
              Raise cases on Amazon or make manual adjustments for the orders below
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {counts.case > 0 && (
            <span className="rounded-full bg-[#F7C1C1] px-2.5 py-1 text-[10px] font-medium text-[#791F1F]">
              {counts.case} overdue cases
            </span>
          )}
          {counts.wrong > 0 && (
            <span className="rounded-full bg-[#FAC775] px-2.5 py-1 text-[10px] font-medium text-[#633806]">
              {counts.wrong} wrong seller
            </span>
          )}
          {counts.investigate > 0 && (
            <span className="rounded-full bg-[#FAEEDA] px-2.5 py-1 text-[10px] font-medium text-[#854F0B]">
              {counts.investigate} investigate
            </span>
          )}
          {counts.gnr > 0 && (
            <span className="rounded-full bg-[#EEEDFE] px-2.5 py-1 text-[10px] font-medium text-[#534AB7]">
              {counts.gnr} GNR tracking
            </span>
          )}
          {counts.pending > 0 && (
            <span className="rounded-full bg-[#D3D1C7] px-2.5 py-1 text-[10px] font-medium text-[#444441]">
              {counts.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* Queue table */}
      <div className="space-y-2">

        {/* Table header row: title + filter tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <ClipboardList className="size-3.5 text-red-500" aria-hidden />
            Action queue — sorted by priority
          </div>
          <div className="flex overflow-hidden rounded-md border border-border text-[10px]">
            {(["all", "case", "wrong", "gnr", "investigate", "pending", "resolved"] as FilterKey[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1.5 transition-colors",
                  filter === f
                    ? "bg-foreground font-medium text-background"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {f === "all" ? `All (${counts.all})`
                  : f === "case" ? `Case needed (${counts.case})`
                  : f === "wrong" ? `Unknown GNR (${counts.wrong})`
                  : f === "gnr" ? `GNR tracking (${counts.gnr})`
                  : f === "investigate" ? `Investigate (${counts.investigate})`
                  : f === "pending" ? `Pending (${counts.pending})`
                  : `Resolved (${counts.resolved})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  ["Order ID",     "text-left",  "w-[150px]"],
                  ["Return Date",  "text-left",  "w-[95px]"],
                  ["FNSKU / ASIN", "text-left",  "w-[130px]"],
                  ["MSKU",         "text-left",  ""],
                  ["Days",        "text-right", "w-[55px]"],
                  ["Qty",         "text-right", "w-[40px]"],
                  ["Priority",    "text-left",  "w-[115px]"],
                  ["What to do",  "text-left",  ""],
                  ["Disposition", "text-left",  "w-[110px]"],
                  ["Action",      "text-right", "w-[130px]"],
                ].map(([label, align, width]) => (
                  <th
                    key={label}
                    className={cn(
                      "px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
                      align,
                      width,
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
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No items match this filter
                  </td>
                </tr>
              ) : (
                pageRows.map((a) => (
                  <tr
                    key={`${a.row.orderId}|${a.row.returnFnsku}`}
                    className={cn("transition-colors hover:bg-muted/20", ROW_BG[a.priority])}
                  >
                    {/* Order ID — click to copy */}
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        title="Click to copy order ID"
                        onClick={() => navigator.clipboard?.writeText(a.row.orderId)}
                        className="font-mono text-[10px] font-semibold text-foreground hover:text-blue-600 transition-colors text-left"
                      >
                        {a.row.orderId}
                      </button>
                    </td>

                    {/* Return date */}
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {a.row.latestReturn || a.row.earliestReturn || "—"}
                      </span>
                      {a.row.earliestReturn &&
                        a.row.latestReturn &&
                        a.row.earliestReturn !== a.row.latestReturn && (
                          <span className="block font-mono text-[9px] text-muted-foreground/60">
                            from {a.row.earliestReturn}
                          </span>
                        )}
                    </td>

                    {/* FNSKU / ASIN — stacked */}
                    <td className="px-3 py-2.5">
                      <span
                        className="block font-mono text-[10px] font-semibold text-foreground"
                        title={a.row.returnFnsku}
                      >
                        {a.row.returnFnsku !== "—" ? a.row.returnFnsku : "—"}
                      </span>
                      <span
                        className="block font-mono text-[9px] text-muted-foreground"
                        title={a.row.asin}
                      >
                        {a.row.asin !== "—" ? a.row.asin : "—"}
                      </span>
                    </td>

                    {/* MSKU */}
                    <td className="px-3 py-2.5">
                      <span
                        className="block max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-muted-foreground"
                        title={a.row.msku}
                      >
                        {a.row.msku}
                      </span>
                    </td>

                    {/* Days */}
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={cn(
                          "font-mono text-xs font-bold",
                          a.row.daysSinceReturn > 60 ? "text-red-600" : "text-amber-600",
                        )}
                      >
                        {a.row.daysSinceReturn >= 0 ? a.row.daysSinceReturn : "—"}
                      </span>
                    </td>

                    {/* Qty */}
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-mono text-xs font-semibold">
                        {a.row.unsellableQty > 0 ? a.row.unsellableQty : a.row.totalReturned}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          PRIORITY_BADGE[a.priority],
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[a.priority])} aria-hidden />
                        {PRIORITY_LABEL[a.priority]}
                      </span>
                    </td>

                    {/* What to do */}
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] text-muted-foreground">{a.actionLabel}</span>
                    </td>

                    {/* Disposition */}
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-block max-w-[110px] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                        title={a.row.dispositions}
                      >
                        {a.row.dispositions.split(",")[0]?.trim() ?? "—"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {a.showRaise && (
                          <button
                            type="button"
                            onClick={() => onRaiseCase(a.row, a.caseReason)}
                            className="rounded bg-red-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-600 transition-colors"
                          >
                            Raise Case
                          </button>
                        )}
                        {a.showAdjust && (
                          <button
                            type="button"
                            onClick={() => onAdjust(a.row)}
                            className="rounded bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 transition-colors"
                          >
                            Adjust
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-[11px] text-muted-foreground">
              Showing {startItem}–{endItem} of {filtered.length} action items
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
              </button>

              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) =>
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - safePage) <= 1,
                )
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-[11px] text-muted-foreground">…</span>
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
                className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
