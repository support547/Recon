"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  STATUS_CLS,
  STATUS_LABEL,
} from "@/components/adjustment-reconciliation/analysis-tab/analysis-table";
import type {
  AdjLogRow,
  AdjPivotRow,
  AdjPivotStatus,
} from "@/lib/adjustment-reconciliation/types";

export function AsinViewModal({
  row,
  logRows,
  open,
  onOpenChange,
}: {
  row: AdjPivotRow | null;
  logRows: AdjLogRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const events = React.useMemo(() => {
    if (!row) return [];
    return logRows
      .filter((r) => r.asin === row.key)
      .sort((a, b) => a.adjDate.localeCompare(b.adjDate));
  }, [row, logRows]);

  if (!row) return null;

  function exportCsv() {
    const headers = [
      "Date", "FNSKU", "ASIN", "MSKU", "Title", "Event Type", "Reference ID",
      "Quantity", "FC", "Disposition", "Reason", "Reconciled", "Unreconciled", "Store",
    ];
    const dataRows = events.map((r) => [
      r.adjDate, r.fnsku, r.asin, r.msku, r.title, "Adjustment", r.referenceId,
      r.quantity, r.fulfillmentCenter, r.disposition, r.reason,
      r.reconciledQty, r.unreconciledQty, r.store,
    ]);
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const d of dataRows) lines.push(d.map(esc).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adjustment_${row?.key ?? "asin"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[95vw] overflow-hidden sm:!max-w-6xl"
        style={{ maxWidth: "min(98vw, 1280px)" }}
      >
        <DialogHeader>
          <DialogTitle>
            🔍 ASIN Detail — {row.key}
            {row.title ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {row.title}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-6">
          <Info label="Net Qty">
            <span
              className={cn(
                row.totalQty < 0
                  ? "text-red-600"
                  : row.totalQty > 0
                    ? "text-emerald-700"
                    : "",
              )}
            >
              {row.totalQty > 0 ? "+" : ""}
              {row.totalQty}
            </span>
          </Info>
          <Info label="Reimbursed">
            <span className="text-emerald-700">{row.reimbQty}</span>
          </Info>
          <Info label="Still Open">
            {row.openQty > 0 ? (
              <span className="font-bold text-red-600">{row.openQty}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Info>
          <Info label="Reimb $">{`$${row.reimbAmount.toFixed(2)}`}</Info>
          <Info label="Cases">{row.caseCount}</Info>
          <Info label="Status">
            <AdjPivotStatusBadge status={row.status} />
          </Info>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12)]">
              <TableRow>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">Date</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">FNSKU</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">MSKU</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">Event</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">Reference ID</TableHead>
                <TableHead className="h-10 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Qty</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">FC</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">Disposition</TableHead>
                <TableHead className="h-10 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-700">Reason</TableHead>
                <TableHead className="h-10 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Reconciled</TableHead>
                <TableHead className="h-10 px-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-700">Unreconciled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((r) => {
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
                    <TableCell className="font-mono text-[10px]">{r.msku || "—"}</TableCell>
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
          {events.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No events for this ASIN
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={exportCsv}>
            ⬇ Download CSV
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjPivotStatusBadge({ status }: { status: AdjPivotStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full font-mono text-[10px] font-bold",
        STATUS_CLS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px] font-bold">{children}</span>
    </div>
  );
}
