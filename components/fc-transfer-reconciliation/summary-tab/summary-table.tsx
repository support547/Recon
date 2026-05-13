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
import { CaseStatusBadge } from "@/components/fc-transfer-reconciliation/shared/action-status-badge";
import type { FcSummaryRow } from "@/lib/fc-transfer-reconciliation/types";

export function SummaryTable({
  rows,
  visibility,
}: {
  rows: FcSummaryRow[];
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => { setPage(1); }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">⇄</span>
        <p className="text-sm font-semibold text-foreground">No FC transfers found</p>
        <p className="text-xs">Upload FC Transfer report or adjust filters</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {FC_SUMMARY_COLUMNS.filter((c) => show(c.id)).map((c) => (
              <TableHead
                key={c.id}
                className={cn(
                  "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((r) => {
            const netCls =
              r.netQty > 0 ? "text-emerald-700" : r.netQty < 0 ? "text-red-600" : "text-muted-foreground";
            const netStr = (r.netQty > 0 ? "+" : "") + r.netQty;
            const dateRange =
              r.earliest && r.latest && r.earliest !== r.latest
                ? `${r.earliest} → ${r.latest}`
                : r.earliest || "—";
            return (
              <TableRow key={`${r.msku}|${r.fnsku}`} className="hover:bg-slate-50">
                {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>}
                {show("fnsku") && <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>}
                {show("asin") && <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>}
                {show("title") && (
                  <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                    {r.title || "—"}
                  </TableCell>
                )}
                {show("events") && <TableCell className="text-right text-[11px] text-muted-foreground">{r.eventCount}</TableCell>}
                {show("net") && <TableCell className={cn("text-right font-mono text-xs font-bold", netCls)}>{netStr}</TableCell>}
                {show("in") && (
                  <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
                    +{r.qtyIn}
                  </TableCell>
                )}
                {show("out") && (
                  <TableCell className="text-right font-mono text-xs font-semibold text-red-600">
                    -{r.qtyOut}
                  </TableCell>
                )}
                {show("case") && (
                  <TableCell>
                    <CaseStatusBadge status={r.caseStatusTop} count={r.caseCount} />
                  </TableCell>
                )}
                {show("reimb") && (
                  <TableCell className="text-right font-mono text-[11px]">
                    {r.caseApprovedQty > 0 || r.caseApprovedAmount > 0 ? (
                      <span className="text-emerald-700">
                        <b>{r.caseApprovedQty}</b> / <b>${r.caseApprovedAmount.toFixed(2)}</b>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {show("range") && (
                  <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                    {dateRange}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const FC_SUMMARY_COLUMNS = [
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "events", label: "Events", align: "right" as const },
  { id: "net", label: "Net Qty", align: "right" as const },
  { id: "in", label: "Qty In (+)", align: "right" as const },
  { id: "out", label: "Qty Out (−)", align: "right" as const },
  { id: "case", label: "Case Status", align: "left" as const },
  { id: "reimb", label: "Case Reimb", align: "right" as const },
  { id: "range", label: "Date Range", align: "left" as const },
];
