"use client";

import * as React from "react";
import { DollarSign, Trash2, Unlock, Wrench } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { WrongItemBadge } from "@/components/removal-reconciliation/shared/status-badge";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/Pagination";
import type { RemovalReceiptRow } from "@/lib/removal-reconciliation/types";

export function ReceiptsTable({
  rows,
  onPostAction,
  onReimb,
  onUnlock,
  onDelete,
  visibility,
}: {
  rows: RemovalReceiptRow[];
  onPostAction: (row: RemovalReceiptRow) => void;
  onReimb: (row: RemovalReceiptRow) => void;
  onUnlock: (row: RemovalReceiptRow) => void;
  onDelete: (row: RemovalReceiptRow) => void;
  visibility?: Record<string, boolean>;
}) {
  const show = (id: string) => visibility?.[id] !== false;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => { setPage(1); }, [rows]);
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
        <span className="text-3xl">📦</span>
        <p className="text-sm font-semibold text-foreground">No receipts yet</p>
        <p className="text-xs">Use Receive button in Orders tab</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
    <div className="rounded-md border border-slate-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
          <TableRow>
            {RECEIPTS_TABLE_COLUMNS.filter((h) => show(h.id)).map((h) => (
              <TableHead
                key={h.id}
                className={cn(
                  "whitespace-nowrap h-11 text-[10px] font-bold uppercase tracking-wider text-slate-700 px-3",
                  h.align === "right" && "text-right",
                  h.align === "center" && "text-center",
                )}
              >
                {h.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((r) => (
            <TableRow
              key={r.id}
              className={cn(
                "hover:bg-slate-50",
                r.wrongItemReceived && "bg-amber-50/40",
              )}
            >
              {show("order_id") && <TableCell className="font-mono text-[10px]">{r.orderId || "—"}</TableCell>}
              {show("fnsku") && <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>}
              {show("msku") && (
                <TableCell className="max-w-[120px] truncate font-mono text-[10px]" title={r.msku}>
                  {r.msku || "—"}
                </TableCell>
              )}
              {show("tracking") && (
                <TableCell className="max-w-[100px] truncate font-mono text-[10px]" title={r.trackingNumber}>
                  {r.trackingNumber || "—"}
                </TableCell>
              )}
              {show("exp") && <TableCell className="text-right font-mono text-xs">{r.expectedQty}</TableCell>}
              {show("rcvd_date") && <TableCell className="font-mono text-[11px]">{r.receivedDate || "—"}</TableCell>}
              {show("rcvd_qty") && (
                <TableCell className="text-right">
                  <RcvdCell row={r} />
                </TableCell>
              )}
              {show("condition") && (
                <TableCell>
                  <CondBadge value={r.conditionReceived} />
                </TableCell>
              )}
              {show("wrong") && (
                <TableCell className="text-center">
                  <WrongItemTooltip row={r} />
                </TableCell>
              )}
              {show("wh_comment") && (
                <TableCell className="max-w-[140px] truncate text-[11px] text-muted-foreground" title={r.warehouseComment}>
                  {r.warehouseComment || "—"}
                </TableCell>
              )}
              {show("wh_status") && (
                <TableCell>
                  <WhStatusBadge value={r.whStatus} />
                </TableCell>
              )}
              {show("transfer") && (
                <TableCell>
                  <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                    {r.transferTo || "—"}
                  </Badge>
                </TableCell>
              )}
              {show("post_action") && (
                <TableCell>
                  <PostActionBadge value={r.postAction} />
                </TableCell>
              )}
              {show("seller_status") && (
                <TableCell className="text-[11px]">
                  <Badge variant="outline" className="rounded-full font-mono text-[10px]">
                    {r.sellerStatus || r.finalStatus || "Pending"}
                  </Badge>
                </TableCell>
              )}
              {show("seller_comments") && (
                <TableCell className="max-w-[130px] truncate text-[11px] text-muted-foreground" title={r.sellerComments}>
                  {r.sellerComments || "—"}
                </TableCell>
              )}
              {show("reimb_qty") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.reimbQty > 0 ? <b className="text-emerald-700">{r.reimbQty}</b> : "—"}
                </TableCell>
              )}
              {show("reimb_amt") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.reimbAmount > 0 ? <b className="text-emerald-700">${r.reimbAmount.toFixed(2)}</b> : "—"}
                </TableCell>
              )}
              {show("billed") && (
                <TableCell className="text-center">
                  {r.warehouseBilled ? (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      ✓ YES
                    </span>
                  ) : (
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                      NO
                    </span>
                  )}
                </TableCell>
              )}
              {show("billed_date") && <TableCell className="font-mono text-[11px] text-muted-foreground">{r.billedDate || "—"}</TableCell>}
              {show("billed_amt") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.billedAmount > 0 ? <b className="text-amber-700">${r.billedAmount.toFixed(2)}</b> : "—"}
                </TableCell>
              )}
              {show("remarks") && (
                <TableCell className="max-w-[130px] truncate text-[11px]" title={r.actionRemarks}>
                  {r.actionRemarks || "—"}
                </TableCell>
              )}
              {show("by") && <TableCell className="text-[11px]">{r.receivedBy || "—"}</TableCell>}
              {show("actions") && (
                <TableCell>
                  <ReceiptActions
                    row={r}
                    onPostAction={onPostAction}
                    onReimb={onReimb}
                    onUnlock={onUnlock}
                    onDelete={onDelete}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
    <Pagination page={page} pageSize={pageSize} totalRows={rows.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}

export const RECEIPTS_TABLE_COLUMNS = [
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "tracking", label: "Tracking", align: "left" as const },
  { id: "exp", label: "Exp.", align: "right" as const },
  { id: "rcvd_date", label: "Rcvd Date", align: "left" as const },
  { id: "rcvd_qty", label: "Rcvd Qty", align: "right" as const },
  { id: "condition", label: "Condition", align: "left" as const },
  { id: "wrong", label: "Wrong Item", align: "center" as const },
  { id: "wh_comment", label: "Wh. Comment", align: "left" as const },
  { id: "wh_status", label: "Wh. Status", align: "left" as const },
  { id: "transfer", label: "Transfer To", align: "left" as const },
  { id: "post_action", label: "Post-Action", align: "left" as const },
  { id: "seller_status", label: "Seller Status", align: "left" as const },
  { id: "seller_comments", label: "Seller Comments", align: "left" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "reimb_amt", label: "Reimb. $", align: "right" as const },
  { id: "billed", label: "Wh. Billed", align: "center" as const },
  { id: "billed_date", label: "Billed Date", align: "left" as const },
  { id: "billed_amt", label: "Billed Amt", align: "right" as const },
  { id: "remarks", label: "Remarks", align: "left" as const },
  { id: "by", label: "By", align: "left" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function RcvdCell({ row }: { row: RemovalReceiptRow }) {
  if (row.receivedQty === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help font-mono text-xs font-bold text-blue-700 underline decoration-dotted">
          {row.receivedQty}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="w-52">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span>✓ Sellable</span><b>{row.sellableQty}</b></div>
          <div className="flex justify-between"><span>⚠ Unsellable</span><b>{row.unsellableQty}</b></div>
          {row.missingQty > 0 ? (
            <div className="flex justify-between"><span>✕ Missing</span><b>{row.missingQty}</b></div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CondBadge({ value }: { value: string }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    NEW: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "LIKE NEW": "border-teal-200 bg-teal-50 text-teal-700",
    "USED GOOD": "border-blue-200 bg-blue-50 text-blue-700",
    USED: "border-slate-200 bg-slate-50 text-slate-700",
    "INCORRECT ITEM": "border-amber-200 bg-amber-50 text-amber-800",
    DAMAGED: "border-red-200 bg-red-50 text-red-700",
    "WATER DAMAGED": "border-pink-200 bg-pink-50 text-pink-700",
    DISPOSE: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const cls = map[value] ?? "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {value}
    </Badge>
  );
}

function WhStatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    RECEIVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    PROCESSED: "border-amber-200 bg-amber-50 text-amber-800",
    COMPLETE: "border-slate-200 bg-slate-100 text-slate-700",
    PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const cls = map[value] ?? "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {value || "PENDING"}
    </Badge>
  );
}

function PostActionBadge({ value }: { value: string }) {
  if (!value) {
    return (
      <Badge variant="outline" className="rounded-full font-mono text-[10px] text-slate-500">
        ⏳ Pending
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-full font-mono text-[10px]">
      {value}
    </Badge>
  );
}

function WrongItemTooltip({ row }: { row: RemovalReceiptRow }) {
  if (!row.wrongItemReceived) return <WrongItemBadge count={0} />;
  if (!row.wrongItemNotes) return <WrongItemBadge count={1} />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help"><WrongItemBadge count={1} /></span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <div className="text-xs text-amber-200">{row.wrongItemNotes}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function ReceiptActions({
  row,
  onPostAction,
  onReimb,
  onUnlock,
  onDelete,
}: {
  row: RemovalReceiptRow;
  onPostAction: (row: RemovalReceiptRow) => void;
  onReimb: (row: RemovalReceiptRow) => void;
  onUnlock: (row: RemovalReceiptRow) => void;
  onDelete: (row: RemovalReceiptRow) => void;
}) {
  const isLocked = (row.postAction && row.postAction.length > 0) || row.reimbQty > 0;
  if (isLocked) {
    const lockLabel = row.reimbQty > 0 ? `💰 ${row.postAction || "Reimbursed"}` : `✓ ${row.postAction}`;
    return (
      <div className="flex items-center gap-1">
        <span
          className="max-w-[100px] truncate rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500"
          title={lockLabel}
        >
          {lockLabel}
        </span>
        <button
          type="button"
          onClick={() => onUnlock(row)}
          className="flex size-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
          title="Unlock"
        >
          <Unlock className="size-3" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onPostAction(row)}
        className="flex h-6 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-bold text-white hover:bg-amber-600"
        title="Post-Receipt Action"
      >
        <Wrench className="size-3" aria-hidden /> Action
      </button>
      <button
        type="button"
        onClick={() => onReimb(row)}
        className="flex size-6 items-center justify-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
        title="Reimbursement"
      >
        <DollarSign className="size-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onDelete(row)}
        className="flex size-6 items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
        title="Delete"
      >
        <Trash2 className="size-3" aria-hidden />
      </button>
    </div>
  );
}
