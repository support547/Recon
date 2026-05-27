"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FcAnalysisRow, FcLogRow } from "@/lib/fc-transfer-reconciliation/types";

export function MskuLogModal({
  row,
  logRows,
  open,
  onOpenChange,
}: {
  row: FcAnalysisRow | null;
  logRows: FcLogRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const filtered = React.useMemo(() => {
    if (!row) return [];
    return logRows.filter((r) => r.msku === row.msku && (!row.fnsku || r.fnsku === row.fnsku));
  }, [row, logRows]);

  if (!row) return null;

  function exportCsv() {
    const headers = ["Date", "MSKU", "FNSKU", "ASIN", "Title", "Qty", "Event Type", "FC", "Disposition", "Reason"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        r.transferDate, r.msku, r.fnsku, r.asin, r.title,
        r.quantity, r.eventType, r.fulfillmentCenter, r.disposition, r.reason,
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fc_transfer_log_${row.msku || "msku"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  const totalIn = filtered.filter((r) => r.quantity > 0).reduce((s, r) => s + r.quantity, 0);
  const totalOut = filtered.filter((r) => r.quantity < 0).reduce((s, r) => s + r.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📋 Transfer Log — <span className="font-mono text-sm">{row.msku}</span>
            {row.fnsku ? <span className="font-mono text-xs text-muted-foreground">/ {row.fnsku}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]">
          <Stat label="Events" value={filtered.length} />
          <Stat label="Qty In" value={`+${totalIn}`} cls="text-emerald-700" />
          <Stat label="Qty Out" value={`${totalOut}`} cls="text-red-600" />
          <Stat label="Net" value={`${totalIn + totalOut > 0 ? "+" : ""}${totalIn + totalOut}`} cls={totalIn + totalOut < 0 ? "text-red-600" : "text-emerald-700"} />
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No log entries for this MSKU</div>
          ) : (
            <table className="w-full caption-bottom text-sm">
              <TableHeader className="sticky top-0 z-10 bg-slate-100">
                <TableRow>
                  <TableHead className="h-9 text-[10px] font-bold uppercase">Date</TableHead>
                  <TableHead className="h-9 text-right text-[10px] font-bold uppercase">Qty</TableHead>
                  <TableHead className="h-9 text-[10px] font-bold uppercase">Event Type</TableHead>
                  <TableHead className="h-9 text-[10px] font-bold uppercase">FC</TableHead>
                  <TableHead className="h-9 text-[10px] font-bold uppercase">Disposition</TableHead>
                  <TableHead className="h-9 text-[10px] font-bold uppercase">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const qtyCls = r.quantity > 0 ? "text-emerald-700" : r.quantity < 0 ? "text-red-600" : "";
                  const qtyStr = (r.quantity > 0 ? "+" : "") + r.quantity;
                  return (
                    <TableRow key={r.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-[11px]">{r.transferDate || "—"}</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs font-bold", qtyCls)}>{qtyStr}</TableCell>
                      <TableCell>
                        {r.eventType ? (
                          <Badge variant="outline" className="rounded-full border-blue-200 bg-blue-50 font-mono text-[10px] text-blue-700">
                            {r.eventType}
                          </Badge>
                        ) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{r.fulfillmentCenter || "—"}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{r.disposition || "—"}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{r.reason || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={exportCsv} disabled={filtered.length === 0}>⬇ Download CSV</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, cls }: { label: string; value: string | number; cls?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm font-bold", cls)}>{value}</span>
    </div>
  );
}
