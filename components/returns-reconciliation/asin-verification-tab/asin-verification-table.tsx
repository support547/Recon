"use client";

import * as React from "react";
import { ScrollText, Wrench } from "lucide-react";

import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/shared/Pagination";
import { cn } from "@/lib/utils";
import { CaseStatusBadge } from "@/components/returns-reconciliation/shared/fnsku-status-badge";
import {
  CellHoverPopover,
  CellHoverRow,
} from "@/components/shared/cell-hover-popover";
import { AsinMatchBadge } from "@/components/returns-reconciliation/asin-verification-tab/asin-match-badge";
import type {
  AsinMatchStatus,
  AsinVerificationRow,
} from "@/lib/returns-reconciliation/types";

export function AsinVerificationTable({
  rows,
  onRaiseCase,
  onAdjust,
  visibility,
}: {
  rows: AsinVerificationRow[];
  onRaiseCase: (row: AsinVerificationRow) => void;
  onAdjust: (row: AsinVerificationRow) => void;
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => {
    setPage(1);
  }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">🔍</span>
        <p className="text-sm font-semibold text-foreground">
          No returns to verify
        </p>
        <p className="text-xs">Adjust filters or upload more data</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              {ASIN_VERIFICATION_COLUMNS.filter((c) => show(c.id)).map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(
                    "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow
                key={`${r.orderId}|${r.returnFnsku}`}
                className={cn(
                  "hover:bg-slate-50",
                  rowBgFor(r.matchStatus),
                  r.isSellableMismatch && "border-l-4 border-red-500",
                )}
              >
                {show("order_id") && (
                  <TableCell className="font-mono text-[10px] font-semibold">
                    {r.orderId}
                  </TableCell>
                )}
                {show("return_fnsku") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.returnFnsku}
                  </TableCell>
                )}
                {show("return_asin") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.returnAsin}
                  </TableCell>
                )}
                {show("return_msku") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.returnMsku}
                  </TableCell>
                )}
                {show("returned_qty") && (
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                    {r.returnedQty}
                  </TableCell>
                )}
                {show("events") && (
                  <TableCell className="text-right text-[11px] text-muted-foreground">
                    {r.returnEvents}
                  </TableCell>
                )}
                {show("disp") && (
                  <TableCell
                    className="max-w-[120px] truncate text-[10px]"
                    title={r.disposition}
                  >
                    {r.disposition ? (
                      <Badge
                        variant="outline"
                        className="rounded-full font-mono text-[10px]"
                      >
                        {r.disposition.split(",")[0]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("sales_asin") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.salesAsin ? (
                      <CellHoverPopover
                        trigger={
                          <span
                            className={cn(
                              "truncate",
                              r.asinMatch
                                ? "text-emerald-700"
                                : "font-bold text-red-600",
                            )}
                          >
                            {r.salesAsin.split(",")[0]}
                          </span>
                        }
                        title="Sales ASIN values on this order"
                        side="left"
                        width={280}
                      >
                        <CellHoverRow left="Return ASIN" right={r.returnAsin} />
                        <CellHoverRow left="Sales ASIN(s)" right={r.salesAsin} />
                      </CellHoverPopover>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {show("sales_msku") && (
                  <TableCell className="font-mono text-[10px]">
                    {r.salesMsku ? (
                      <CellHoverPopover
                        trigger={
                          <span
                            className={cn(
                              "truncate",
                              r.mskuMatch
                                ? "text-emerald-700"
                                : "font-bold text-red-600",
                            )}
                          >
                            {r.salesMsku.split(",")[0]}
                          </span>
                        }
                        title="Sales MSKU values on this order"
                        side="left"
                        width={280}
                      >
                        <CellHoverRow left="Return MSKU" right={r.returnMsku} />
                        <CellHoverRow left="Sales MSKU(s)" right={r.salesMsku} />
                      </CellHoverPopover>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {show("catalog_asin") && (
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {r.catalogAsin || "—"}
                  </TableCell>
                )}
                {show("catalog_msku") && (
                  <TableCell
                    className="max-w-[140px] truncate font-mono text-[10px] text-muted-foreground"
                    title={r.catalogMsku}
                  >
                    {r.catalogMsku || "—"}
                  </TableCell>
                )}
                {show("match_status") && (
                  <TableCell>
                    <AsinMatchBadge status={r.matchStatus} />
                  </TableCell>
                )}
                {show("match_score") && (
                  <TableCell className="text-center">
                    <ScoreBadge score={r.matchScore} />
                  </TableCell>
                )}
                {show("sellable") && (
                  <TableCell className="text-center">
                    {r.isSellableMismatch ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-red-300 bg-red-50 font-mono text-[10px] font-bold text-red-700"
                      >
                        ⚠ SELLABLE
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </TableCell>
                )}
                {show("case") && (
                  <TableCell>
                    <CaseStatusBadge
                      status={r.caseStatusTop}
                      count={r.caseCount}
                    />
                  </TableCell>
                )}
                {show("reimb_qty") && (
                  <TableCell className="text-right font-mono text-xs">
                    {r.reimbQty > 0 ? (
                      <b className="text-emerald-700">{r.reimbQty}</b>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                {show("actions") && (
                  <TableCell>
                    <Actions
                      row={r}
                      onRaiseCase={onRaiseCase}
                      onAdjust={onAdjust}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
      />
    </div>
  );
}

export const ASIN_VERIFICATION_COLUMNS = [
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "return_fnsku", label: "Return FNSKU", align: "left" as const },
  { id: "return_asin", label: "Return ASIN", align: "left" as const },
  { id: "return_msku", label: "Return MSKU", align: "left" as const },
  { id: "returned_qty", label: "Returned", align: "right" as const },
  { id: "events", label: "Events", align: "right" as const },
  { id: "disp", label: "Disposition", align: "left" as const },
  { id: "sales_asin", label: "Sales ASIN", align: "left" as const },
  { id: "sales_msku", label: "Sales MSKU", align: "left" as const },
  { id: "catalog_asin", label: "Catalog ASIN", align: "left" as const },
  { id: "catalog_msku", label: "Catalog MSKU", align: "left" as const },
  { id: "match_status", label: "Match Status", align: "left" as const },
  { id: "match_score", label: "Score", align: "center" as const },
  { id: "sellable", label: "Sellable?", align: "center" as const },
  { id: "case", label: "Case", align: "left" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function rowBgFor(status: AsinMatchStatus): string {
  switch (status) {
    case "FULLY_VERIFIED":
      return "";
    case "ASIN_MISMATCH":
      return "bg-red-50";
    case "MSKU_MISMATCH":
      return "bg-orange-50";
    case "MULTI_MISMATCH":
      return "bg-red-100";
    case "NOT_IN_CATALOG":
      return "bg-purple-50";
    case "ORDER_NOT_FOUND":
      return "bg-amber-50";
  }
}

function ScoreBadge({ score }: { score: number }) {
  const good = score === 3;
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-bold",
        good ? "text-emerald-700" : "text-red-600",
      )}
    >
      {score}/3 {good ? "✓" : "⚠"}
    </span>
  );
}

function Actions({
  row,
  onRaiseCase,
  onAdjust,
}: {
  row: AsinVerificationRow;
  onRaiseCase: (row: AsinVerificationRow) => void;
  onAdjust: (row: AsinVerificationRow) => void;
}) {
  const showRaise = row.matchStatus !== "FULLY_VERIFIED" && row.caseCount === 0;
  return (
    <div className="flex gap-1">
      {row.caseCount > 0 ? (
        <span className="flex h-6 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700">
          ⚖️ {row.caseCount} Case{row.caseCount > 1 ? "s" : ""}
        </span>
      ) : showRaise ? (
        <button
          type="button"
          onClick={() => onRaiseCase(row)}
          className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
          title="Raise Case"
        >
          <ScrollText className="size-3" aria-hidden /> Raise Case
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onAdjust(row)}
        className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-bold text-white hover:bg-blue-700"
        title="Manual Adjustment"
      >
        <Wrench className="size-3" aria-hidden /> Adjust
      </button>
    </div>
  );
}
