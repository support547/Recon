"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FcLogRow } from "@/lib/fc-transfer-reconciliation/types";

export function LogTable({ rows }: { rows: FcLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📋</span>
        <p className="text-sm font-semibold text-foreground">No transfer events</p>
        <p className="text-xs">Upload FC Transfer report</p>
      </div>
    );
  }
  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead
                key={c.id}
                className={cn(
                  "whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const qtyCls = r.quantity > 0 ? "text-emerald-700" : r.quantity < 0 ? "text-red-600" : "";
            const qtyStr = (r.quantity > 0 ? "+" : "") + r.quantity;
            return (
              <TableRow key={r.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-[11px]">{r.transferDate || "—"}</TableCell>
                <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>
                <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                  {r.title || "—"}
                </TableCell>
                <TableCell className={cn("text-right font-mono text-xs font-bold", qtyCls)}>{qtyStr}</TableCell>
                <TableCell>
                  {r.eventType ? (
                    <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 font-mono text-[10px] text-blue-700">
                      {r.eventType}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground">{r.fulfillmentCenter || "—"}</TableCell>
                <TableCell className="text-[10px] text-muted-foreground">{r.disposition || "—"}</TableCell>
                <TableCell className="text-[10px] text-muted-foreground">{r.reason || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
  { id: "date", label: "Date", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "qty", label: "Qty", align: "right" as const },
  { id: "event", label: "Event Type", align: "left" as const },
  { id: "fc", label: "FC", align: "left" as const },
  { id: "disp", label: "Disposition", align: "left" as const },
  { id: "reason", label: "Reason", align: "left" as const },
];
