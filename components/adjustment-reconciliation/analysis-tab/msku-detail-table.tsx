"use client";

import * as React from "react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import type { AdjLogRow } from "@/lib/adjustment-reconciliation/types";

export function MskuDetailTable({ rows }: { rows: AdjLogRow[] }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    setPage(1);
  }, [rows]);

  const sorted = React.useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          a.msku.localeCompare(b.msku) ||
          a.adjDate.localeCompare(b.adjDate),
      ),
    [rows],
  );
  const pagedRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">✓</span>
        <p className="text-sm font-semibold text-foreground">No adjustment events</p>
        <p className="text-xs">Upload Adjustments report to see details</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Date</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">FNSKU</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">ASIN</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">MSKU</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Title</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Event Type</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Reference ID</TableHead>
              <TableHead className="h-11 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Quantity</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">FC</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Disposition</TableHead>
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Reason</TableHead>
              <TableHead className="h-11 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Reconciled</TableHead>
              <TableHead className="h-11 px-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Unreconciled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((r) => {
              const qtyCls =
                r.quantity > 0
                  ? "text-emerald-700"
                  : r.quantity < 0
                    ? "text-red-600"
                    : "";
              const qtyStr = (r.quantity > 0 ? "+" : "") + r.quantity;
              return (
                <TableRow key={r.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-[11px]">{r.adjDate || "—"}</TableCell>
                  <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>
                  <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-[11px]" title={r.title}>
                    {r.title || "—"}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">Adjustment</TableCell>
                  <TableCell className="font-mono text-[10px]">{r.referenceId || "—"}</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs font-bold", qtyCls)}>{qtyStr}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{r.fulfillmentCenter || "—"}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{r.disposition || "—"}</TableCell>
                  <TableCell className="font-mono text-[10px] font-semibold">{r.reason || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-emerald-700">{r.reconciledQty || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-[11px] text-amber-700">{r.unreconciledQty || "—"}</TableCell>
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
