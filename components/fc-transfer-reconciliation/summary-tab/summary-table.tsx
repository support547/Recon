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
import { CaseStatusBadge } from "@/components/fc-transfer-reconciliation/shared/action-status-badge";
import type { FcSummaryRow } from "@/lib/fc-transfer-reconciliation/types";

export function SummaryTable({ rows }: { rows: FcSummaryRow[] }) {
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
            const netCls =
              r.netQty > 0 ? "text-emerald-700" : r.netQty < 0 ? "text-red-600" : "text-muted-foreground";
            const netStr = (r.netQty > 0 ? "+" : "") + r.netQty;
            const dateRange =
              r.earliest && r.latest && r.earliest !== r.latest
                ? `${r.earliest} → ${r.latest}`
                : r.earliest || "—";
            return (
              <TableRow key={`${r.msku}|${r.fnsku}`} className="hover:bg-slate-50">
                <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.asin || "—"}</TableCell>
                <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                  {r.title || "—"}
                </TableCell>
                <TableCell className="text-right text-[11px] text-muted-foreground">{r.eventCount}</TableCell>
                <TableCell className={cn("text-right font-mono text-xs font-bold", netCls)}>{netStr}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
                  +{r.qtyIn}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-red-600">
                  -{r.qtyOut}
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={r.caseStatusTop} count={r.caseCount} />
                </TableCell>
                <TableCell className="text-right font-mono text-[11px]">
                  {r.caseApprovedQty > 0 || r.caseApprovedAmount > 0 ? (
                    <span className="text-emerald-700">
                      <b>{r.caseApprovedQty}</b> / <b>${r.caseApprovedAmount.toFixed(2)}</b>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  {dateRange}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
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
