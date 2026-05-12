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
import { ConditionBadge } from "@/components/gnr-reconciliation/shared/status-badge";
import type { GnrLogRow } from "@/lib/gnr-reconciliation/types";

export function LogTable({ rows }: { rows: GnrLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📋</span>
        <p className="text-sm font-semibold text-foreground">No GNR log entries</p>
        <p className="text-xs">Upload GNR Report or add via Grade &amp; Resell</p>
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
              <TableCell>
                {r.entrySource === "manual" ? (
                  <Badge variant="outline" className="rounded border-purple-200 bg-purple-50 px-1.5 text-[9px] font-bold text-purple-700">
                    Manual
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded border-sky-200 bg-sky-50 px-1.5 text-[9px] font-bold text-sky-700">
                    Report
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-[11px]">{r.reportDate || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.orderId || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.lpn || "—"}</TableCell>
              <TableCell className="text-[10px] text-slate-600">{r.valueRecoveryType || "—"}</TableCell>
              <TableCell className="max-w-[140px] truncate font-mono text-[10px]" title={r.msku}>
                {r.msku || "—"}
              </TableCell>
              <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.asin || "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs font-bold">{r.quantity}</TableCell>
              <TableCell>
                <UnitStatus value={r.unitStatus} />
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-[10px] text-muted-foreground" title={r.reasonForUnitStatus}>
                {r.reasonForUnitStatus || "—"}
              </TableCell>
              <TableCell>
                <ConditionBadge value={r.usedCondition} />
              </TableCell>
              <TableCell className="max-w-[140px] truncate font-mono text-[10px]" title={r.usedMsku}>
                {r.usedMsku || "—"}
              </TableCell>
              <TableCell className="font-mono text-[10px]">{r.usedFnsku || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
  { id: "source", label: "Src", align: "left" as const },
  { id: "date", label: "Date", align: "left" as const },
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "lpn", label: "LPN", align: "left" as const },
  { id: "recovery", label: "Recovery Type", align: "left" as const },
  { id: "msku", label: "Orig MSKU", align: "left" as const },
  { id: "fnsku", label: "Orig FNSKU", align: "left" as const },
  { id: "asin", label: "ASIN", align: "left" as const },
  { id: "qty", label: "Qty", align: "right" as const },
  { id: "unit_status", label: "Unit Status", align: "left" as const },
  { id: "reason", label: "Reason / Notes", align: "left" as const },
  { id: "condition", label: "Condition", align: "left" as const },
  { id: "used_msku", label: "Used MSKU", align: "left" as const },
  { id: "used_fnsku", label: "Used FNSKU", align: "left" as const },
];

function UnitStatus({ value }: { value: string }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">—</span>;
  const lo = value.toLowerCase();
  const cls = lo === "succeeded"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : lo === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {value}
    </Badge>
  );
}
