"use client";

import * as React from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import type { ReturnsLogRow } from "@/lib/returns-reconciliation/types";

export function LogTable({
  rows,
  visibility,
}: {
  rows: ReturnsLogRow[];
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
        <span className="text-3xl">📋</span>
        <p className="text-sm font-semibold text-foreground">No return events</p>
        <p className="text-xs">Upload Customer Returns report</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {RETURNS_LOG_COLUMNS.filter((c) => show(c.id)).map((c) => (
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
          {pagedRows.map((r) => (
            <TableRow key={r.id} className="hover:bg-slate-50">
              {show("return_date") && <TableCell className="font-mono text-[11px]">{r.returnDate || "—"}</TableCell>}
              {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>}
              {show("fnsku") && <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>}
              {show("order_id") && <TableCell className="font-mono text-[10px]">{r.orderId || "—"}</TableCell>}
              {show("title") && (
                <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                  {r.title || "—"}
                </TableCell>
              )}
              {show("qty") && <TableCell className="text-right font-mono text-xs font-bold">{r.quantity}</TableCell>}
              {show("disposition") && (
                <TableCell>
                  <DispBadge value={r.disposition} />
                </TableCell>
              )}
              {show("detailed") && (
                <TableCell className="max-w-[140px] truncate text-[10px] text-muted-foreground" title={r.detailedDisposition}>
                  {r.detailedDisposition || "—"}
                </TableCell>
              )}
              {show("reason") && (
                <TableCell className="max-w-[120px] truncate text-[10px] text-muted-foreground" title={r.reason}>
                  {r.reason || "—"}
                </TableCell>
              )}
              {show("status") && <TableCell className="text-[10px]">{r.status || "—"}</TableCell>}
              {show("fc") && <TableCell className="text-[10px]">{r.fulfillmentCenter || "—"}</TableCell>}
              {show("lpn") && (
                <TableCell className="font-mono text-[10px] text-muted-foreground">
                  {r.licensePlateNumber || "—"}
                </TableCell>
              )}
              {show("case") && (
                <TableCell>
                  {r.caseId ? (
                    <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                      {r.caseId}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const RETURNS_LOG_COLUMNS = [
  { id: "return_date", label: "Return Date", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "qty", label: "Qty", align: "right" as const },
  { id: "disposition", label: "Disposition", align: "left" as const },
  { id: "detailed", label: "Detailed Disp.", align: "left" as const },
  { id: "reason", label: "Reason", align: "left" as const },
  { id: "status", label: "Status", align: "left" as const },
  { id: "fc", label: "FC", align: "left" as const },
  { id: "lpn", label: "LPN", align: "left" as const },
  { id: "case", label: "Case", align: "left" as const },
];

function DispBadge({ value }: { value: string }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">—</span>;
  const cls = value.includes("SELLABLE")
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value.includes("UNSELLABLE")
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {value}
    </Badge>
  );
}
