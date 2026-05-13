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
import type { ReplacementLogRow } from "@/lib/replacement-reconciliation/types";

export function LogTable({
  rows,
  visibility,
}: {
  rows: ReplacementLogRow[];
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
        <p className="text-sm font-semibold text-foreground">No replacement events</p>
        <p className="text-xs">Upload Replacement Shipments report</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {REPLACEMENT_LOG_COLUMNS.filter((c) => show(c.id)).map((c) => (
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
              {show("shipment_date") && <TableCell className="font-mono text-[11px]">{r.shipmentDate || "—"}</TableCell>}
              {show("msku") && <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>}
              {show("asin") && <TableCell className="font-mono text-[10px]">{r.asin || "—"}</TableCell>}
              {show("qty") && <TableCell className="text-right font-mono text-xs font-bold">{r.quantity}</TableCell>}
              {show("repl_order") && <TableCell className="font-mono text-[10px] font-semibold text-purple-700">{r.replacementOrderId || "—"}</TableCell>}
              {show("orig_order") && <TableCell className="font-mono text-[10px] text-slate-600">{r.originalOrderId || "—"}</TableCell>}
              {show("reason") && <TableCell className="text-[10px]">{r.replacementReasonCode || "—"}</TableCell>}
              {show("fc") && <TableCell className="text-[10px]">{r.fulfillmentCenterId || "—"}</TableCell>}
              {show("orig_fc") && <TableCell className="text-[10px] text-muted-foreground">{r.originalFulfillmentCenterId || "—"}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const REPLACEMENT_LOG_COLUMNS = [
  { id: "shipment_date", label: "Shipment Date", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "qty", label: "Qty", align: "right" as const },
  { id: "repl_order", label: "Replacement Order", align: "left" as const },
  { id: "orig_order", label: "Original Order", align: "left" as const },
  { id: "reason", label: "Reason", align: "left" as const },
  { id: "fc", label: "FC", align: "left" as const },
  { id: "orig_fc", label: "Original FC", align: "left" as const },
];
