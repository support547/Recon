"use client";

import * as React from "react";
import { Eye, ScrollText, Wrench } from "lucide-react";

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

const STATUS_LABEL: Record<AdjPivotRow["status"], string> = {
  ok: "✓ Matched",
  excess: "⇄ Excess",
  "take-action": "⚠ Take Action",
};

const STATUS_CLS: Record<AdjPivotRow["status"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excess: "border-blue-200 bg-blue-50 text-blue-700",
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
    let reimbAmount = 0;
    for (const r of filteredRows) {
      for (const c of reasonCodes) t[c] += r.qtyByReason[c] ?? 0;
      reimbQty += r.reimbQty;
      reimbAmount += r.reimbAmount;
    }
    return { byReason: t, reimbQty, reimbAmount };
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
                  <TableHead className="whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    Status
                  </TableHead>
                  <TableHead className="whitespace-nowrap min-w-[80px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    <div className="flex flex-col items-end">
                      <span>Reimb Qty</span>
                      <span className="mt-0.5 font-mono text-[9px] font-bold text-blue-600">
                        {colTotals.reimbQty > 0 ? `+${colTotals.reimbQty.toLocaleString()}` : "0"}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap min-w-[90px] h-11 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3">
                    <div className="flex flex-col items-end">
                      <span>Reimb $</span>
                      <span className="mt-0.5 font-mono text-[9px] font-bold text-blue-600">
                        {`$${colTotals.reimbAmount.toFixed(2)}`}
                      </span>
                    </div>
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
                    return (
                      <TableCell
                        key={code}
                        className={cn(
                          "min-w-[55px] text-right font-mono text-[11px]",
                          cls,
                        )}
                      >
                        {q === 0 ? "—" : (q > 0 ? "+" : "") + q}
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
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-emerald-700">
                        {r.reimbQty || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-emerald-700">
                        {r.reimbAmount > 0 ? `$${r.reimbAmount.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onView?.(r)}
                            className="flex h-6 items-center gap-1 rounded bg-slate-700 px-2 text-[10px] font-bold text-white hover:bg-slate-800"
                            title="View ASIN detail"
                          >
                            <Eye className="size-3" aria-hidden /> View
                          </button>
                          {r.caseCount > 0 ? (
                            <span
                              className="flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700"
                              title={`${r.caseCount} case${r.caseCount > 1 ? "s" : ""} · ${r.caseStatusTop}`}
                            >
                              ⚖️ {r.caseCount}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onCase?.(r)}
                              className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
                              title="Raise Case"
                            >
                              <ScrollText className="size-3" aria-hidden /> Case
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onAdjust?.(r)}
                            className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
                            title="Manual Adjustment / Reimbursement"
                          >
                            <Wrench className="size-3" aria-hidden /> Adjust
                          </button>
                        </div>
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
