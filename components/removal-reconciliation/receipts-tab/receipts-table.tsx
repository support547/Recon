"use client";

import * as React from "react";
import { Download, DollarSign, Eye, Paperclip, Trash2, Unlock, Wrench } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { WrongItemBadge } from "@/components/removal-reconciliation/shared/status-badge";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/Pagination";
import { saveWarehouseBilling } from "@/actions/removal-reconciliation";
import type { RemovalReceiptRow } from "@/lib/removal-reconciliation/types";
import { caseStatusBadgeClass, formatEnumLabel } from "@/lib/cases-ui";
import { useCanDelete } from "@/components/auth/permissions-context";
import { PermissionModule, type CaseStatus } from "@prisma/client";

export function ReceiptsTable({
  rows,
  onPostAction,
  onReimb,
  onUnlock,
  onDelete,
  onBillingSaved,
  visibility,
}: {
  rows: RemovalReceiptRow[];
  onPostAction: (row: RemovalReceiptRow) => void;
  onReimb: (row: RemovalReceiptRow) => void;
  onUnlock: (row: RemovalReceiptRow) => void;
  onDelete: (row: RemovalReceiptRow) => void;
  onBillingSaved?: () => void;
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
              {show("order_date") && (
                <TableCell className="font-mono text-[11px]">{(r as any).requestDate || "—"}</TableCell>
              )}
              {show("order_id") && <TableCell className="font-mono text-[10px]">{r.orderId || "—"}</TableCell>}
              {show("fnsku") && <TableCell className="font-mono text-[10px]">{r.fnsku || "—"}</TableCell>}
              {show("msku") && (
                <TableCell className="max-w-[120px] truncate font-mono text-[10px]" title={r.msku}>
                  {r.msku || "—"}
                </TableCell>
              )}
              {show("tracking") && (
                <TableCell className="max-w-[120px] truncate font-mono text-[10px]" title={r.trackingNumber}>
                  <TrackingWithBol row={r} />
                </TableCell>
              )}
              {show("carrier") && (
                <TableCell className="font-mono text-[10px]">{r.carrier || "—"}</TableCell>
              )}
              {show("rcvd_date") && <TableCell className="font-mono text-[11px]">{r.receivedDate || "—"}</TableCell>}
              {show("lpn") && (
                <TableCell className="font-mono text-[11px]">{(r as any).lpnNumber || "—"}</TableCell>
              )}
              {show("bin_location") && (
                <TableCell className="font-mono text-[11px]">{r.binLocation || "—"}</TableCell>
              )}
              {show("item_title") && (
                <TableCell className="max-w-[160px] truncate text-[11px]" title={r.itemTitle}>
                  {r.itemTitle || "—"}
                </TableCell>
              )}
              {show("exp") && <TableCell className="text-right font-mono text-xs">{r.expectedQty}</TableCell>}
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
              {show("title_note") && (
                <TableCell className="max-w-[140px] truncate text-[11px] text-muted-foreground" title={r.notes}>
                  {r.notes || "—"}
                </TableCell>
              )}
              {show("wh_comment") && (
                <TableCell className="max-w-[140px] truncate text-[11px] text-muted-foreground" title={r.warehouseComment}>
                  {r.warehouseComment || "—"}
                </TableCell>
              )}
              {show("front_photo") && (
                <TableCell className="text-center">
                  <AttachmentLinks urls={(r as any).frontPhotoUrls ?? []} label="Front photo" />
                </TableCell>
              )}
              {show("back_photo") && (
                <TableCell className="text-center">
                  <AttachmentLinks urls={(r as any).backPhotoUrls ?? []} label="Back photo" />
                </TableCell>
              )}
              {show("packing_list") && (
                <TableCell className="text-center">
                  <AttachmentLinks urls={(r as any).packingListUrls ?? []} label="Packing list" />
                </TableCell>
              )}
              {show("processed_by") && (
                <TableCell className="text-[11px]">{r.receivedBy || "—"}</TableCell>
              )}
              {show("wrong") && (
                <TableCell className="text-center">
                  <WrongItemTooltip row={r} />
                </TableCell>
              )}
              {show("wh_status") && (
                <TableCell>
                  <WhStatusBadge value={r.whStatus} />
                </TableCell>
              )}
              {show("billed") && (
                <TableCell className="text-center">
                  <WhBilledCell row={r} onSaved={onBillingSaved} />
                </TableCell>
              )}
              {show("billed_date") && <TableCell className="font-mono text-[11px] text-muted-foreground">{r.billedDate || "—"}</TableCell>}
              {show("billed_amt") && (
                <TableCell className="text-right font-mono text-xs">
                  {r.billedAmount > 0 ? <b className="text-amber-700">${r.billedAmount.toFixed(2)}</b> : "—"}
                </TableCell>
              )}
              {show("case_id") && (
                <TableCell className="font-mono text-[11px]">
                  <CaseIdCell row={r} />
                </TableCell>
              )}
              {show("case_status") && (
                <TableCell className="text-[11px]">
                  <CaseStatusBadge value={(r as any).caseStatus ?? ""} />
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
              {show("case_remark") && (
                <TableCell className="max-w-[160px] truncate text-[11px] text-muted-foreground" title={(r as any).caseRemark ?? ""}>
                  {(r as any).caseRemark || "—"}
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
              {show("remarks") && (
                <TableCell className="max-w-[130px] truncate text-[11px]" title={r.actionRemarks}>
                  {r.actionRemarks || "—"}
                </TableCell>
              )}
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
  { id: "order_date", label: "Order Date", align: "left" as const },
  { id: "order_id", label: "Order ID", align: "left" as const },
  { id: "fnsku", label: "FNSKU", align: "left" as const },
  { id: "msku", label: "MSKU", align: "left" as const },
  { id: "tracking", label: "Tracking", align: "left" as const },
  { id: "carrier", label: "Carrier", align: "left" as const },
  { id: "rcvd_date", label: "Rcvd Date", align: "left" as const },
  { id: "lpn", label: "LPN #", align: "left" as const },
  { id: "bin_location", label: "Bin Location", align: "left" as const },
  { id: "item_title", label: "Item Title", align: "left" as const },
  { id: "exp", label: "Exp.", align: "right" as const },
  { id: "rcvd_qty", label: "Rcvd Qty", align: "right" as const },
  { id: "condition", label: "Book Condition", align: "left" as const },
  { id: "title_note", label: "Title Note", align: "left" as const },
  { id: "wh_comment", label: "Wh. Comment", align: "left" as const },
  { id: "front_photo", label: "Front Photo", align: "center" as const },
  { id: "back_photo", label: "Back Photo", align: "center" as const },
  { id: "packing_list", label: "Packing List", align: "center" as const },
  { id: "processed_by", label: "Processed By", align: "left" as const },
  { id: "wrong", label: "Wrong Item", align: "center" as const },
  { id: "wh_status", label: "Wh. Status", align: "left" as const },
  { id: "billed", label: "Wh. Billed", align: "center" as const },
  { id: "billed_date", label: "Billed Date", align: "left" as const },
  { id: "billed_amt", label: "Billed Amt", align: "right" as const },
  { id: "case_id", label: "Case ID", align: "left" as const },
  { id: "case_status", label: "Case Status", align: "left" as const },
  { id: "transfer", label: "Transfer To", align: "left" as const },
  { id: "post_action", label: "Post-Action", align: "left" as const },
  { id: "seller_status", label: "Seller Status", align: "left" as const },
  { id: "seller_comments", label: "Seller Comments", align: "left" as const },
  { id: "case_remark", label: "Case Remark", align: "left" as const },
  { id: "reimb_qty", label: "Reimb. Qty", align: "right" as const },
  { id: "reimb_amt", label: "Reimb. $", align: "right" as const },
  { id: "remarks", label: "Remarks", align: "left" as const },
  { id: "actions", label: "Actions", align: "left" as const },
];

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const path = url.split("?")[0].split("#")[0];
    const name = path.substring(path.lastIndexOf("/") + 1);
    return decodeURIComponent(name) || fallback;
  } catch {
    return fallback;
  }
}

async function downloadAttachment(url: string, fileName: string) {
  // Blob download so cross-origin/header-served files still save instead of navigating.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: same-origin anchor download.
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function AttachmentLinks({ urls, label = "Attachment" }: { urls: string[]; label?: string }) {
  if (!urls?.length) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
          title={`${urls.length} ${label.toLowerCase()}${urls.length > 1 ? "s" : ""} — view or download`}
        >
          <Paperclip className="size-3" aria-hidden /> {urls.length}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        onClick={(e) => e.stopPropagation()}
        className="w-44"
      >
        {urls.map((u, i) => {
          const fileName = fileNameFromUrl(u, `${label.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`);
          return (
            <React.Fragment key={i}>
              {urls.length > 1 && (
                <DropdownMenuLabel className="truncate text-[10px] font-semibold text-slate-500" title={fileName}>
                  {label} {i + 1}
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem asChild>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <Eye className="size-3.5" aria-hidden /> View
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void downloadAttachment(u, fileName);
                }}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <Download className="size-3.5" aria-hidden /> Download
              </DropdownMenuItem>
              {urls.length > 1 && i < urls.length - 1 && <DropdownMenuSeparator />}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TrackingWithBol({ row }: { row: RemovalReceiptRow }) {
  const tracking = row.trackingNumber;
  if (!tracking) return <span className="text-muted-foreground">—</span>;
  const bolUrls = (row as any).bolAttachmentUrls as string[] | undefined;
  const bol = bolUrls?.[0];
  if (!bol) return <span title={tracking}>{tracking}</span>;
  return (
    <a
      href={bol}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 underline-offset-2 hover:underline"
      title={`${tracking} — open BOL`}
    >
      {tracking}
    </a>
  );
}

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function WhBilledCell({
  row,
  onSaved,
}: {
  row: RemovalReceiptRow;
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [billedDate, setBilledDate] = React.useState(row.billedDate || todayIso());
  const [amount, setAmount] = React.useState(row.billedAmount || 0);
  const [busy, setBusy] = React.useState(false);

  // Re-sync local form when the row data changes (e.g. after a refresh).
  React.useEffect(() => {
    setBilledDate(row.billedDate || todayIso());
    setAmount(row.billedAmount || 0);
  }, [row.billedDate, row.billedAmount]);

  async function save(billed: boolean) {
    setBusy(true);
    try {
      const res = await saveWarehouseBilling({
        receiptId: row.id,
        warehouseBilled: billed,
        billedDate: billed ? billedDate : null,
        billedAmount: billed ? amount : 0,
      });
      if (res.ok) {
        toast.success(billed ? "✅ Marked billed" : "Marked not billed");
        setOpen(false);
        onSaved?.();
      } else {
        toast.error(res.error || "Failed to save billing");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded border px-2 py-0.5 text-[10px] font-bold transition",
            row.warehouseBilled
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
          )}
          title="Edit warehouse billing"
        >
          {row.warehouseBilled ? "✓ YES" : "NO"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Warehouse billing
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-muted-foreground">
              Billed Date
            </label>
            <Input
              type="date"
              value={billedDate}
              onChange={(e) => setBilledDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-muted-foreground">
              Amount ($)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(Number.parseFloat(e.target.value) || 0)}
              className="h-8 text-center text-xs font-bold text-amber-700"
            />
          </div>
          <div className="flex gap-1 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 bg-emerald-600 text-[11px] hover:bg-emerald-700"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Save billed
            </Button>
            {row.warehouseBilled ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Mark NO
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CaseStatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const cls = caseStatusBadgeClass(value as CaseStatus);
  return (
    <Badge variant="outline" className={cn("rounded-full font-mono text-[10px]", cls)}>
      {formatEnumLabel(value)}
    </Badge>
  );
}

function CaseIdCell({ row }: { row: RemovalReceiptRow }) {
  const id = row.caseId;
  if (!id) return <span className="text-muted-foreground">—</span>;
  const url = (row as any).caseUrl as string | undefined;
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 hover:underline"
        title={`Open ${id}`}
      >
        {id}
      </a>
    );
  }
  return <span>{id}</span>;
}

function CondBadge({ value }: { value: string }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    NEW: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "LIKE NEW": "border-teal-200 bg-teal-50 text-teal-700",
    "USED GOOD": "border-blue-200 bg-blue-50 text-blue-700",
    USED: "border-slate-200 bg-slate-50 text-slate-700",
    "INCORRECT ITEM": "border-amber-200 bg-amber-50 text-amber-800",
    "WRONG ITEM": "border-amber-200 bg-amber-50 text-amber-800",
    "USED ACCEPTABLE": "border-slate-200 bg-slate-50 text-slate-700",
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
  const canDelete = useCanDelete(PermissionModule.RECONCILIATION);
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
      {canDelete ? (
        <button
          type="button"
          onClick={() => onDelete(row)}
          className="flex size-6 items-center justify-center rounded bg-red-600 text-white hover:bg-red-700"
          title="Delete"
        >
          <Trash2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
