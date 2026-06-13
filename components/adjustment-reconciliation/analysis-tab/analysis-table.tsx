"use client";

import * as React from "react";
import { Eye, FileText, Wrench } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { cn } from "@/lib/utils";
import { getReasonLabel } from "@/lib/adjustment-reconciliation/formula";
import type {
  AdjLogRow,
  AdjPivotResult,
  AdjPivotRow,
} from "@/lib/adjustment-reconciliation/types";

export const STATUS_LABEL: Record<AdjPivotRow["status"], string> = {
  ok: "✓ No Action",
  excess: "⇄ Excess",
  reimbursed: "✓ Reimbursed",
  partial: "~ Partial",
  "take-action": "⚠ Take Action",
};

export const STATUS_CLS: Record<AdjPivotRow["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excess: "border-blue-200 bg-blue-50 text-blue-700",
  reimbursed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  "take-action": "border-red-200 bg-red-50 text-red-700",
};

export function AnalysisTable({
  pivot,
  logRows,
  onCase,
  onView,
  onAdjust,
}: {
  pivot: AdjPivotResult;
  logRows: AdjLogRow[];
  onCase?: (row: AdjPivotRow) => void;
  onView?: (row: AdjPivotRow) => void;
  onAdjust?: (row: AdjPivotRow) => void;
}) {
  const { rows, reasonCodes, groupBy } = pivot;
  const keyLabel = groupBy === "msku" ? "MSKU" : "ASIN";
  const showActions = groupBy === "asin";

  const keyToSkus = React.useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>();
    for (const r of logRows) {
      const k = groupBy === "asin" ? r.asin : r.msku;
      if (!k) continue;
      let mskuMap = map.get(k);
      if (!mskuMap) {
        mskuMap = new Map();
        map.set(k, mskuMap);
      }
      const mskuKey = r.msku || "—";
      let fnskuSet = mskuMap.get(mskuKey);
      if (!fnskuSet) {
        fnskuSet = new Set();
        mskuMap.set(mskuKey, fnskuSet);
      }
      if (r.fnsku) fnskuSet.add(r.fnsku);
    }
    return map;
  }, [logRows, groupBy]);

  const keyToReasonDetails = React.useMemo(() => {
    const map = new Map<string, {
      msku: string; referenceId: string;
      fc: string; disposition: string; qty: number;
    }[]>();
    for (const r of logRows) {
      const k = groupBy === "asin" ? r.asin : r.msku;
      if (!k || !r.reason) continue;
      const key = `${k}|${r.reason.trim().toUpperCase()}`;
      const arr = map.get(key) ?? [];
      arr.push({
        msku: r.msku || "—",
        referenceId: r.referenceId || "—",
        fc: r.fulfillmentCenter || "—",
        disposition: r.disposition || "—",
        qty: r.quantity,
      });
      map.set(key, arr);
    }
    return map;
  }, [logRows, groupBy]);

  const [colFilters, setColFilters] = React.useState<Set<string>>(new Set());
  const toggleColFilter = React.useCallback((code: string) => {
    setColFilters((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const filteredRows = React.useMemo(() => {
    if (colFilters.size === 0) return rows;
    return rows.filter((r) =>
      Array.from(colFilters).every((c) => (r.qtyByReason[c] ?? 0) !== 0),
    );
  }, [rows, colFilters]);

  const colTotals = React.useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of reasonCodes) t[c] = 0;
    let reimbQty = 0;
    let manualAdjQty = 0;
    let caseApprovedQty = 0;
    for (const r of filteredRows) {
      for (const c of reasonCodes) t[c] += r.qtyByReason[c] ?? 0;
      reimbQty += r.reimbQty;
      manualAdjQty += r.manualAdjQty;
      caseApprovedQty += r.caseApprovedQty;
    }
    return { byReason: t, reimbQty, manualAdjQty, caseApprovedQty };
  }, [filteredRows, reasonCodes]);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  React.useEffect(() => {
    setPage(1);
  }, [filteredRows]);
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">No adjustment activity</p>
        <p className="text-xs">Upload Adjustments report to see analysis</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              <TableHead className="whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                {keyLabel}
              </TableHead>
              <TableHead className="whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                Title
              </TableHead>
              {reasonCodes.map((code) => {
                const t = colTotals.byReason[code] ?? 0;
                const active = colFilters.has(code);
                return (
                  <TableHead
                    key={code}
                    title={getReasonLabel(code)}
                    className="whitespace-nowrap min-w-[55px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3"
                  >
                    <div className="flex flex-col items-end">
                      <span>{code}</span>
                      <button
                        type="button"
                        onClick={() => toggleColFilter(code)}
                        className={cn(
                          "mt-0.5 font-mono text-[9px] font-bold transition",
                          active
                            ? "rounded bg-blue-600 px-1.5 text-white"
                            : "rounded px-1 text-blue-600 hover:bg-blue-50",
                        )}
                        title="Click to filter non-zero only"
                      >
                        {t >= 0 ? "+" : ""}{t.toLocaleString()}
                      </button>
                    </div>
                  </TableHead>
                );
              })}
              <TableHead className="whitespace-nowrap min-w-[80px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                Total
              </TableHead>
              {showActions ? (
                <>
                  <TableHead className="whitespace-nowrap min-w-[80px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    <div className="flex flex-col items-end">
                      <span>Reimb Qty</span>
                      <span className="mt-0.5 font-mono text-[9px] font-bold text-blue-600">
                        {colTotals.reimbQty > 0 ? `+${colTotals.reimbQty.toLocaleString()}` : "0"}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap min-w-[80px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    <div className="flex flex-col items-end">
                      <span>Manual Adj</span>
                      <span
                        className={cn(
                          "mt-0.5 font-mono text-[9px] font-bold",
                          colTotals.manualAdjQty > 0
                            ? "text-emerald-700"
                            : colTotals.manualAdjQty < 0
                              ? "text-red-600"
                              : "text-slate-400",
                        )}
                      >
                        {colTotals.manualAdjQty > 0 ? "+" : ""}
                        {colTotals.manualAdjQty.toLocaleString()}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap min-w-[80px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    <div className="flex flex-col items-end">
                      <span>Cases</span>
                      <span
                        className={cn(
                          "mt-0.5 font-mono text-[9px] font-bold",
                          colTotals.caseApprovedQty > 0 ? "text-teal-700" : "text-slate-400",
                        )}
                      >
                        {colTotals.caseApprovedQty.toLocaleString()}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    Status
                  </TableHead>
                  <TableHead className="whitespace-nowrap h-11 text-center text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    Action
                  </TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((r) => {
              const rowBg =
                r.status === "take-action"
                  ? "bg-red-50/40"
                  : r.status === "partial"
                    ? "bg-amber-50/30"
                    : r.status === "excess"
                      ? "bg-blue-50/30"
                      : "";
              return (
                <TableRow key={r.key} className={cn("hover:bg-slate-50", rowBg)}>
                  <TableCell className="font-mono text-[11px] font-semibold">
                    {(() => {
                      const mskuMap = keyToSkus.get(r.key);
                      const entries = mskuMap ? Array.from(mskuMap.entries()) : [];
                      if (entries.length === 0) return r.key;
                      return (
                        <CellHoverPopover
                          trigger={r.key}
                          title={`${keyLabel} ${r.key}`}
                          count={entries.length}
                          width={420}
                          triggerClassName="font-mono text-[11px] font-semibold text-blue-700"
                        >
                          {entries.map(([msku, fnskuSet]) => (
                            <CellHoverRow
                              key={msku}
                              left={<span className="font-mono">{msku}</span>}
                              right={
                                <span className="font-mono text-[10px]">
                                  {fnskuSet.size > 0 ? Array.from(fnskuSet).join(", ") : "—"}
                                </span>
                              }
                            />
                          ))}
                        </CellHoverPopover>
                      );
                    })()}
                  </TableCell>
                  <TableCell
                    className="max-w-[260px] truncate text-[11px]"
                    title={r.title}
                  >
                    {r.title || "—"}
                  </TableCell>
                  {reasonCodes.map((code) => {
                    const q = r.qtyByReason[code] ?? 0;
                    const cls =
                      q > 0
                        ? "text-emerald-700 font-bold"
                        : q < 0
                          ? "text-red-600 font-bold"
                          : "text-slate-300";
                    const details = keyToReasonDetails.get(`${r.key}|${code}`);
                    const cellText = q === 0 ? "—" : (q > 0 ? "+" : "") + q;
                    return (
                      <TableCell
                        key={code}
                        className={cn(
                          "min-w-[55px] text-right font-mono text-[11px]",
                          cls,
                        )}
                      >
                        {!details || details.length === 0 ? (
                          cellText
                        ) : (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <CellHoverPopover
                              trigger={
                                <span className="cursor-pointer underline decoration-dotted">
                                  {cellText}
                                </span>
                              }
                              title={`${code} — ${getReasonLabel(code)}`}
                              count={details.length}
                              width={480}
                              triggerClassName={cn("font-mono text-[11px]", cls)}
                            >
                              {details.map((d, i) => (
                                <CellHoverRow
                                  key={i}
                                  left={
                                    <span
                                      className="font-mono text-[10px] text-slate-700 truncate max-w-[160px]"
                                      title={d.msku}
                                    >
                                      {d.msku}
                                    </span>
                                  }
                                  right={
                                    <div className="flex items-center gap-3 font-mono text-[10px]">
                                      <span
                                        className="text-slate-400 truncate max-w-[100px]"
                                        title={d.referenceId}
                                      >
                                        {d.referenceId}
                                      </span>
                                      <span className="text-slate-500">{d.fc}</span>
                                      <span className="text-slate-500">{d.disposition}</span>
                                      <span
                                        className={cn(
                                          "font-bold",
                                          d.qty < 0 ? "text-red-600" : "text-emerald-700",
                                        )}
                                      >
                                        {d.qty > 0 ? "+" : ""}
                                        {d.qty}
                                      </span>
                                    </div>
                                  }
                                />
                              ))}
                            </CellHoverPopover>
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className={cn(
                      "min-w-[80px] text-right font-mono text-[11px] font-bold",
                      r.totalQty > 0
                        ? "text-emerald-700"
                        : r.totalQty < 0
                          ? "text-red-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {(r.totalQty > 0 ? "+" : "") + r.totalQty}
                  </TableCell>
                  {showActions ? (
                    <>
                      <TableCell className="min-w-[80px] text-right font-mono text-[11px]">
                        {r.reimbDetails.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <CellHoverPopover
                            trigger={
                              <span className="cursor-pointer font-bold text-emerald-700 underline decoration-dotted">
                                +{Math.round(r.reimbQty)}
                              </span>
                            }
                            title={`Reimbursements · ${r.key}`}
                            count={r.reimbDetails.length}
                            width={560}
                          >
                            {r.reimbDetails.map((d, i) => (
                              <CellHoverRow
                                key={i}
                                left={
                                  <span className={cn("font-mono text-[10px]", d.isReversal && "text-red-600")}>
                                    {d.approvalDate || "—"}
                                    {d.isReversal && " ↩"}
                                  </span>
                                }
                                right={
                                  <div className="flex items-center gap-3 text-[10px]">
                                    <span className="font-mono text-slate-500 truncate max-w-[120px]" title={d.reimbId}>
                                      {d.reimbId || "—"}
                                    </span>
                                    <span
                                      className={cn("font-mono", d.caseId ? "text-slate-600" : "text-slate-400 italic")}
                                      title={d.caseId ? undefined : "Amazon auto-reimbursed"}
                                    >
                                      {d.caseId || "auto"}
                                    </span>
                                    <span className="font-mono text-slate-500">{d.reason}</span>
                                    <span className={cn("font-mono font-bold", d.isReversal ? "text-red-600" : "text-emerald-700")}>
                                      {d.isReversal ? "" : "+"}{d.qtyCash}
                                    </span>
                                    <span className={cn("font-mono font-bold", d.isReversal ? "text-red-600" : "text-emerald-700")}>
                                      ${Math.abs(d.amount).toFixed(2)}
                                    </span>
                                  </div>
                                }
                              />
                            ))}
                            <div className="mt-1 border-t border-slate-100 pt-1 text-[9px] italic text-slate-400">
                              "auto" = Amazon reimbursed without a seller case
                            </div>
                          </CellHoverPopover>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[80px] text-right font-mono text-[11px]">
                        <ManualAdjCell row={r} />
                      </TableCell>
                      <TableCell className="min-w-[80px] text-right font-mono text-[11px]">
                        <CaseCell row={r} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full font-mono text-[10px] font-bold",
                            STATUS_CLS[r.status],
                          )}
                        >
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        {r.openQty > 0 && (
                          <div className="mt-0.5 text-[9px] font-mono text-amber-700">
                            {r.openQty} unit{r.openQty !== 1 ? "s" : ""} open
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ActionCell
                          row={r}
                          onView={onView}
                          onCase={onCase}
                          onAdjust={onAdjust}
                        />
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}

function ManualAdjCell({ row }: { row: AdjPivotRow }) {
  const qty = row.manualAdjQty;
  if (!qty || row.manualAdjCount <= 0) {
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
        count={row.manualAdjCount}
        trigger={trigger}
        triggerClassName={cn("font-bold", cls)}
      >
        <CellHoverRow left="Qty" right={qty} />
        <CellHoverRow left="Entries" right={row.manualAdjCount} />
        {row.manualAdjReasons ? (
          <CellHoverRow left="Reasons" right={row.manualAdjReasons} />
        ) : null}
      </CellHoverPopover>
    </span>
  );
}

function CaseCell({ row }: { row: AdjPivotRow }) {
  if (row.caseCount <= 0) {
    return <span className="text-slate-300">—</span>;
  }
  const display =
    row.caseApprovedQty ||
    row.caseClaimedQty ||
    `${row.caseCount} case${row.caseCount > 1 ? "s" : ""}`;
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
        count={row.caseCount}
        trigger={trigger}
        triggerClassName="font-bold text-teal-700"
      >
        <CellHoverRow left="Claimed Qty" right={row.caseClaimedQty} />
        <CellHoverRow left="Approved Qty" right={row.caseApprovedQty} />
        <CellHoverRow
          left="Approved $"
          right={`$${row.caseApprovedAmount.toFixed(2)}`}
        />
        {row.caseStatusTop ? (
          <CellHoverRow left="Status" right={row.caseStatusTop} />
        ) : null}
        {row.caseOpenCount > 0 ? (
          <CellHoverRow left="Open" right={row.caseOpenCount} />
        ) : null}
        {row.caseIds ? <CellHoverRow left="Case ID(s)" right={row.caseIds} /> : null}
      </CellHoverPopover>
    </span>
  );
}

function ActionCell({
  row,
  onView,
  onCase,
  onAdjust,
}: {
  row: AdjPivotRow;
  onView?: (row: AdjPivotRow) => void;
  onCase?: (row: AdjPivotRow) => void;
  onAdjust?: (row: AdjPivotRow) => void;
}) {
  const needs = row.status === "take-action" || row.status === "partial";
  return (
    <div className="flex justify-center gap-1">
      <button
        type="button"
        title="View ASIN detail"
        onClick={(e) => {
          e.stopPropagation();
          onView?.(row);
        }}
        className="flex size-[26px] items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Raise Case"
        onClick={(e) => {
          e.stopPropagation();
          onCase?.(row);
        }}
        className={cn(
          "flex size-[26px] items-center justify-center rounded-md border transition-colors",
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
        onClick={(e) => {
          e.stopPropagation();
          onAdjust?.(row);
        }}
        className={cn(
          "flex size-[26px] items-center justify-center rounded-md border transition-colors",
          needs || row.status === "excess"
            ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
            : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
        )}
      >
        <Wrench className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
