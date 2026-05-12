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
import type { ReturnsLogRow } from "@/lib/returns-reconciliation/types";

export function LogTable({ rows }: { rows: ReturnsLogRow[] }) {
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
              <TableCell className="font-mono text-[11px]">{r.returnDate || "—"}</TableCell>
              <TableCell className="font-mono text-[11px] font-semibold">{r.msku || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>
              <TableCell className="font-mono text-[10px]">{r.orderId || "—"}</TableCell>
              <TableCell className="max-w-[160px] truncate text-[11px]" title={r.title}>
                {r.title || "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-xs font-bold">{r.quantity}</TableCell>
              <TableCell>
                <DispBadge value={r.disposition} />
              </TableCell>
              <TableCell className="max-w-[140px] truncate text-[10px] text-muted-foreground" title={r.detailedDisposition}>
                {r.detailedDisposition || "—"}
              </TableCell>
              <TableCell className="max-w-[120px] truncate text-[10px] text-muted-foreground" title={r.reason}>
                {r.reason || "—"}
              </TableCell>
              <TableCell className="text-[10px]">{r.status || "—"}</TableCell>
              <TableCell className="text-[10px]">{r.fulfillmentCenter || "—"}</TableCell>
              <TableCell className="font-mono text-[10px] text-muted-foreground">
                {r.licensePlateNumber || "—"}
              </TableCell>
              <TableCell>
                {r.caseId ? (
                  <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                    {r.caseId}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const COLUMNS = [
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
