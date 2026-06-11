"use client";

import * as React from "react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import type { AdjLogRow } from "@/lib/adjustment-reconciliation/types";

export const ADJ_LOG_COLUMNS = [
  { id: "date", label: "Date", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "title", label: "Title", align: "left" as const },
  { id: "qty", label: "Qty", align: "right" as const },
  { id: "code", label: "Code", align: "left" as const },
  { id: "reasonLabel", label: "Reason", align: "left" as const },
  { id: "claimTag", label: "Claim Tag", align: "left" as const },
  { id: "fc", label: "FC", align: "left" as const },
  { id: "recon", label: "Reconciled", align: "right" as const },
  { id: "unrecon", label: "Unreconciled", align: "right" as const },
];

const CLAIM_CLS: Record<string, string> = {
  Lost_Warehouse: "border-orange-200 bg-orange-50 text-orange-800",
  Damaged_Warehouse: "border-purple-200 bg-purple-50 text-purple-800",
  Found: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Reimbursement_Reversal: "border-red-200 bg-red-50 text-red-700",
};

export function LogTable({
  rows,
  visibility,
}: {
  rows: AdjLogRow[];
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.msku.toLowerCase().includes(q) ||
        r.asin.toLowerCase().includes(q) ||
        r.referenceId.toLowerCase().includes(q) ||
        r.fnsku.toLowerCase().includes(q),
    );
  }, [rows, search]);

  React.useEffect(() => {
    setPage(1);
  }, [filtered]);

  const pagedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📋</span>
        <p className="text-sm font-semibold text-foreground">No adjustment events</p>
        <p className="text-xs">Upload an Adjustments report</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search MSKU / ASIN / Reference ID / FNSKU"
        className="h-8 max-w-md text-xs"
      />
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              {ADJ_LOG_COLUMNS.filter((c) => show(c.id)).map((c) => (
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
            {pagedRows.map((r) => {
              const qtyCls =
                r.quantity > 0
                  ? "text-emerald-700"
                  : r.quantity < 0
                    ? "text-red-600"
                    : "";
              const qtyStr = (r.quantity > 0 ? "+" : "") + r.quantity;
              const claimCls = CLAIM_CLS[r.claimTag] ?? "border-slate-200 bg-slate-50 text-slate-600";
              return (
                <TableRow key={r.id} className="hover:bg-slate-50">
                  {show("date") && (
                    <TableCell className="font-mono text-[11px]">{r.adjDate || "—"}</TableCell>
                  )}
                  {show("msku") && (
                    <TableCell className="font-mono text-[11px] font-semibold">
                      {r.msku || "—"}
                    </TableCell>
                  )}
                  {show("title") && (
                    <TableCell className="max-w-[180px] truncate text-[11px]" title={r.title}>
                      {r.title || "—"}
                    </TableCell>
                  )}
                  {show("qty") && (
                    <TableCell className={cn("text-right font-mono text-xs font-bold", qtyCls)}>
                      {qtyStr}
                    </TableCell>
                  )}
                  {show("code") && (
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="rounded font-mono text-[10px] font-bold"
                      >
                        {r.reason || "—"}
                      </Badge>
                    </TableCell>
                  )}
                  {show("reasonLabel") && (
                    <TableCell className="text-[11px] text-muted-foreground">
                      {r.reasonLabel || "—"}
                    </TableCell>
                  )}
                  {show("claimTag") && (
                    <TableCell>
                      {r.claimTag ? (
                        <Badge
                          variant="outline"
                          className={cn("rounded-full font-mono text-[10px] font-bold", claimCls)}
                        >
                          {r.claimTag.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  {show("fc") && (
                    <TableCell className="text-[10px] text-muted-foreground">
                      {r.fulfillmentCenter || "—"}
                    </TableCell>
                  )}
                  {show("recon") && (
                    <TableCell className="text-right font-mono text-[11px] text-emerald-700">
                      {r.reconciledQty || "—"}
                    </TableCell>
                  )}
                  {show("unrecon") && (
                    <TableCell className="text-right font-mono text-[11px] text-amber-700">
                      {r.unreconciledQty || "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}
