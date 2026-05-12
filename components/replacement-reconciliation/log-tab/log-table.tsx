"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReplacementLogRow } from "@/lib/replacement-reconciliation/types";

export function LogTable({ rows }: { rows: ReplacementLogRow[] }) {
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
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-slate-50">
              <TableCell className="font-mono text-[11px]">{r.shipmentDate || "—"}</TableCell>
              <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.asin || "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs font-bold">{r.quantity}</TableCell>
              <TableCell className="font-mono text-[10px] font-semibold text-purple-700">{r.replacementOrderId || "—"}</TableCell>
              <TableCell className="font-mono text-[10px] text-slate-600">{r.originalOrderId || "—"}</TableCell>
              <TableCell className="text-[10px]">{r.replacementReasonCode || "—"}</TableCell>
              <TableCell className="text-[10px]">{r.fulfillmentCenterId || "—"}</TableCell>
              <TableCell className="text-[10px] text-muted-foreground">{r.originalFulfillmentCenterId || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
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
