"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/csv";
import { FullStatusBadge } from "@/components/fc-transfer-reconciliation/full-recon-tab/full-status-badge";
import type { FcFullReconRow } from "@/lib/fc-transfer-reconciliation/full-recon-types";

// Flat, self-contained CSV for one drill-down row: one record per transfer leg
// (flattened across all groups, date-ascending), with identity + row summary
// repeated on every row so the file stands alone in Excel.
function buildLegCsv(row: FcFullReconRow): string {
  const headers = [
    "MSKU", "FNSKU", "ASIN", "Title",
    "Log Date", "Reference ID", "Fulfillment Center", "Signed Qty", "Disposition", "Disposition Class",
    "Status", "Net Qty", "Out Qty", "In Qty", "Sellable Shortfall", "Quantity Shortage", "Degradation", "Days Pending", "Imbalance Since",
  ];
  const legs = row.groups
    .flatMap((g) => g.legs)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = legs.map((l) => [
    row.msku, row.fnsku, row.asin, row.title,
    l.date, l.referenceId, l.fc, l.signedQty, l.disposition, l.cls,
    row.status, row.netQty, row.outQty, row.inQty, row.sellableShortfall, row.quantityShortage, row.degradationQty, row.daysPending, row.imbalanceStart,
  ]);
  return toCsv(headers, rows);
}

function sanitize(s: string): string {
  return (s || "row").replace(/[^A-Za-z0-9-_]/g, "_");
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Drill-down: shows every transfer leg behind the status (date, referenceId, FC,
 * signed qty, disposition), grouped by transfer where Reference IDs link out+in.
 * With today's all-null referenceId data, the episode's legs render as one flat
 * group; the grouped layout lights up automatically once refIds populate.
 */
export function LegDrilldownModal({
  row,
  open,
  onOpenChange,
}: {
  row: FcFullReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;
  const linked = row.groups.some((g) => g.referenceId !== "");

  // Full FC code lists (the row now only carries counts; the codes live here).
  // Aggregate the per-group from->to strings the lib already derived.
  const outFcs = new Set<string>();
  const inFcs = new Set<string>();
  for (const g of row.groups) {
    if (g.fromFc) g.fromFc.split(", ").forEach((f) => f && outFcs.add(f));
    if (g.toFc) g.toFc.split(", ").forEach((f) => f && inFcs.add(f));
  }
  const outFcList = Array.from(outFcs).sort().join(", ");
  const inFcList = Array.from(inFcs).sort().join(", ");

  const legCount = row.groups.reduce((n, g) => n + g.legs.length, 0);

  const r = row; // non-null binding for the closure (row is narrowed above)
  const exportCsv = () => {
    if (legCount === 0) {
      toast.info("No logs to export for this row.");
      return;
    }
    downloadCsv(`fc-transfer-logs_${sanitize(r.msku)}_${todayIso()}.csv`, buildLegCsv(r));
    toast.success("✅ CSV exported");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            🔎 Transfer Logs — <span className="font-mono text-sm">{row.msku}</span>
            {row.fnsku ? (
              <span className="font-mono text-xs text-muted-foreground">/ {row.fnsku}</span>
            ) : null}
            <FullStatusBadge status={row.status} />
          </DialogTitle>
        </DialogHeader>

        {/* Status math summary */}
        <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] sm:grid-cols-6">
          <Stat label="OUT" value={row.outQty} sub={`S${row.outSellable}/U${row.outUnsellable}`} cls="text-red-600" />
          <Stat label="IN" value={row.inQty} sub={`S${row.inSellable}/U${row.inUnsellable}`} cls="text-emerald-700" />
          <Stat label="Net" value={(row.netQty > 0 ? "+" : "") + row.netQty} cls={row.netQty < 0 ? "text-red-600" : "text-emerald-700"} />
          <Stat label="Shortage" value={row.quantityShortage} cls="text-red-600" />
          <Stat label="Degradation" value={row.degradationQty} cls="text-rose-700" />
          <Stat label="Days Pending" value={row.daysPending} />
        </div>
        {outFcList || inFcList ? (
          <div className="px-1 text-[11px] text-muted-foreground">
            Route: <span className="font-mono text-foreground">{outFcList || "—"}</span>
            <span className="text-slate-400"> ({row.fromFcCount}) → </span>
            <span className="font-mono text-foreground">{inFcList || "—"}</span>
            <span className="text-slate-400"> ({row.toFcCount})</span>
          </div>
        ) : null}

        <div className="max-h-[55vh] space-y-3 overflow-auto">
          {row.groups.map((g, gi) => (
            <div key={`${g.referenceId}-${gi}`} className="rounded-md border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px]">
                <span className="font-semibold">
                  {linked ? (
                    <>Transfer <span className="font-mono">{g.referenceId || "(unlinked)"}</span></>
                  ) : (
                    <>Episode logs (no Reference ID linkage)</>
                  )}
                </span>
                <span className="font-mono text-muted-foreground">
                  out -{g.outQty} / in +{g.inQty} / var {g.variance > 0 ? "+" : ""}{g.variance}
                  {linked && (g.fromFc || g.toFc) ? `  ·  ${g.fromFc || "—"}→${g.toFc || "—"}` : ""}
                </span>
              </div>
              <table className="w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[10px] font-bold uppercase">Date</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold uppercase">Ref ID</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold uppercase">FC</TableHead>
                    <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Signed Qty</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold uppercase">Disposition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.legs.map((l, li) => {
                    const qtyCls = l.signedQty > 0 ? "text-emerald-700" : l.signedQty < 0 ? "text-red-600" : "";
                    const qtyStr = (l.signedQty > 0 ? "+" : "") + l.signedQty;
                    const dispCls =
                      l.cls === "UNSELLABLE"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : l.cls === "UNKNOWN"
                          ? "border-slate-200 bg-slate-100 text-slate-500"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700";
                    return (
                      <TableRow key={li} className="hover:bg-slate-50">
                        <TableCell className="font-mono text-[11px]">{l.date || "—"}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{l.referenceId || "—"}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{l.fc || "—"}</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs font-bold", qtyCls)}>{qtyStr}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-full font-mono text-[9px]", dispCls)}>
                            {l.disposition || "(blank)"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={exportCsv} disabled={legCount === 0}>⬇ Download CSV</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string | number; sub?: string; cls?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm font-bold", cls)}>{value}</span>
      {sub ? <span className="text-[8px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}
