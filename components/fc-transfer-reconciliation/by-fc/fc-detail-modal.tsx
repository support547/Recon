"use client";

import * as React from "react";

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
import type { FcByFcRow } from "@/lib/fc-transfer-reconciliation/by-fc-types";
import type { FcByFcDetail } from "@/lib/fc-transfer-reconciliation/by-fc-types";

/**
 * Drill-down for a single FC's analysis row: the per-MSKU flow AT THIS FC
 * (in/out/net scoped to the node) plus the raw ledger legs. DESCRIPTIVE ONLY —
 * no status, no actions, no lanes.
 */
export function FcDetailModal({
  row,
  detail,
  open,
  onOpenChange,
}: {
  row: FcByFcRow | null;
  detail: FcByFcDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = React.useState<"mskus" | "legs">("mskus");
  if (!row) return null;
  const netStr = (row.netQty > 0 ? "+" : "") + row.netQty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            🏬 FC Detail — <span className="font-mono text-sm">{row.fc}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {row.firstDate || "—"} → {row.lastDate || "—"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Flow summary */}
        <div className="grid grid-cols-3 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] sm:grid-cols-6">
          <Stat label="OUT" value={row.outQty} sub={`S${row.outSellable}/U${row.outUnsellable}`} cls="text-red-600" />
          <Stat label="IN" value={row.inQty} sub={`S${row.inSellable}/U${row.inUnsellable}`} cls="text-emerald-700" />
          <Stat label="Net" value={netStr} cls={row.netQty < 0 ? "text-red-600" : row.netQty > 0 ? "text-emerald-700" : ""} />
          <Stat label="Volume" value={row.volume} />
          <Stat label="Damaged In" value={`${(row.damageIntakePct * 100).toFixed(1)}%`} cls={row.damageIntakePct > 0 ? "text-rose-700" : ""} />
          <Stat label="# MSKUs" value={row.mskuCount} />
        </div>

        <div className="flex gap-1">
          <TabBtn active={tab === "mskus"} onClick={() => setTab("mskus")}>By MSKU ({detail?.mskus.length ?? 0})</TabBtn>
          <TabBtn active={tab === "legs"} onClick={() => setTab("legs")}>Logs ({detail?.legs.length ?? 0})</TabBtn>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200 bg-white">
          {tab === "mskus" ? (
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[10px] font-bold uppercase">MSKU</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase">FNSKU</TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Out</TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-bold uppercase">In</TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Net</TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.mskus ?? []).map((m, i) => {
                  const nc = m.netQty > 0 ? "text-emerald-700" : m.netQty < 0 ? "text-red-600" : "text-muted-foreground";
                  return (
                    <TableRow key={`${m.msku}|${m.fnsku}|${i}`} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-[11px] font-semibold">{m.msku || "—"}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{m.fnsku || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-red-600">-{m.outQty}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-emerald-700">+{m.inQty}</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs font-bold", nc)}>
                        {(m.netQty > 0 ? "+" : "") + m.netQty}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{m.events}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          ) : (
            <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[10px] font-bold uppercase">Date</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase">MSKU</TableHead>
                  <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Signed Qty</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase">Disposition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.legs ?? []).map((l, i) => {
                  const qtyCls = l.signedQty > 0 ? "text-emerald-700" : l.signedQty < 0 ? "text-red-600" : "";
                  const qtyStr = (l.signedQty > 0 ? "+" : "") + l.signedQty;
                  const dispCls =
                    l.cls === "UNSELLABLE"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : l.cls === "UNKNOWN"
                        ? "border-slate-200 bg-slate-100 text-slate-500"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700";
                  return (
                    <TableRow key={i} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-[11px]">{l.date || "—"}</TableCell>
                      <TableCell className="font-mono text-[10px]">{l.msku || "—"}</TableCell>
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
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-semibold transition",
        active ? "bg-slate-700 text-white" : "bg-slate-100 text-muted-foreground hover:bg-slate-200",
      )}
    >
      {children}
    </button>
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
