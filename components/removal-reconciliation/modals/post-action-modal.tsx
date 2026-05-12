"use client";

import * as React from "react";
import { toast } from "sonner";

import { savePostAction } from "@/actions/removal-reconciliation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { POST_ACTION_PRESETS } from "@/components/removal-reconciliation/shared/condition-button-grid";
import {
  AttachmentZone,
  type AttachmentEntry,
} from "@/components/removal-reconciliation/modals/attachment-zone";
import type { RemovalReceiptRow } from "@/lib/removal-reconciliation/types";

const SELLER_STATUSES = [
  "Pending",
  "Under Review",
  "Resell Ready",
  "Reshipped to FBA",
  "Disposed",
  "Donated",
  "Reimbursed",
  "Case Pending",
  "Closed",
];

const TRANSFER_OPTIONS = [
  "FBA Reshipment",
  "Local Sale",
  "Donate",
  "Dispose",
  "Hold / Pending",
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function PostActionModal({
  receipt,
  open,
  onOpenChange,
  onSaved,
}: {
  receipt: RemovalReceiptRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [action, setAction] = React.useState("");
  const [actionDate, setActionDate] = React.useState(todayIso());
  const [transferTo, setTransferTo] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [reimbQty, setReimbQty] = React.useState(0);
  const [reimbAmount, setReimbAmount] = React.useState(0);
  const [sellerStatus, setSellerStatus] = React.useState("");
  const [sellerComments, setSellerComments] = React.useState("");
  const [warehouseBilled, setWarehouseBilled] = React.useState(false);
  const [billedDate, setBilledDate] = React.useState("");
  const [billedAmount, setBilledAmount] = React.useState(0);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [reshippedQty, setReshippedQty] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  type ReceiptExt = RemovalReceiptRow & {
    invoiceNumber?: string | null;
    reshippedQty?: number;
    attachmentUrls?: unknown;
  };
  const r = receipt as ReceiptExt | null;
  const initialAttachments: AttachmentEntry[] = React.useMemo(() => {
    const raw = r?.attachmentUrls;
    if (!raw) return [];
    let arr: unknown = raw;
    if (typeof raw === "string") {
      try {
        arr = JSON.parse(raw);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(arr)) return [];
    return (arr as unknown[])
      .map((v): AttachmentEntry | null => {
        if (typeof v === "string") {
          return {
            url: v,
            filename: v.split("/").pop() ?? v,
            size: 0,
            uploadedAt: "",
          };
        }
        if (v && typeof v === "object" && "url" in v) {
          const o = v as Record<string, unknown>;
          return {
            url: String(o.url),
            filename: String(o.filename ?? ""),
            size: Number(o.size ?? 0) || 0,
            uploadedAt: String(o.uploadedAt ?? ""),
          };
        }
        return null;
      })
      .filter((x): x is AttachmentEntry => x !== null);
  }, [r?.attachmentUrls]);

  React.useEffect(() => {
    if (!open || !receipt) return;
    setAction(receipt.postAction || "");
    setActionDate(receipt.actionDate || todayIso());
    setTransferTo(receipt.transferTo || "");
    setRemarks(receipt.actionRemarks || "");
    setReimbQty(receipt.reimbQty || 0);
    setReimbAmount(receipt.reimbAmount || 0);
    setSellerStatus(receipt.sellerStatus || "");
    setSellerComments(receipt.sellerComments || "");
    setWarehouseBilled(receipt.warehouseBilled);
    setBilledDate(receipt.billedDate || "");
    setBilledAmount(receipt.billedAmount || 0);
    setInvoiceNumber(r?.invoiceNumber ?? "");
    setReshippedQty(r?.reshippedQty ?? 0);
  }, [open, receipt, r]);

  if (!receipt) return null;

  function onPickAction(v: string) {
    setAction(v);
    const preset = POST_ACTION_PRESETS.find((p) => p.value === v);
    if (preset) setTransferTo(preset.transferTo);
  }

  async function onSubmit() {
    if (!action) {
      toast.error("Please select an action");
      return;
    }
    setBusy(true);
    try {
      const res = await savePostAction({
        receiptId: receipt!.id,
        postAction: action,
        actionRemarks: remarks,
        actionDate,
        transferTo,
        reimbQty,
        reimbAmount,
        sellerStatus: sellerStatus || action,
        sellerComments,
        warehouseBilled,
        billedDate: warehouseBilled ? billedDate : null,
        billedAmount: warehouseBilled ? billedAmount : 0,
        invoiceNumber: invoiceNumber || null,
        reshippedQty,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("✓ Action saved!");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  const isReimb = action === "Reimbursed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🎯 Post-Receipt Action</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {receipt.orderId} · {receipt.fnsku} · Rcvd:{receipt.receivedQty} · Sell:
            {receipt.sellableQty} · Unsell:{receipt.unsellableQty}
          </p>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">
            What happened to these books?
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {POST_ACTION_PRESETS.map((p) => {
              const active = action === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onPickAction(p.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-xs font-medium transition",
                    active
                      ? "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {isReimb ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="mb-2 text-[11px] font-semibold text-emerald-800">
              Amazon Reimbursement Details
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Reimb. Qty</Label>
                <Input
                  type="number"
                  min={0}
                  value={reimbQty}
                  onChange={(e) => setReimbQty(Number.parseInt(e.target.value) || 0)}
                  className="text-center font-bold text-emerald-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Amount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={reimbAmount}
                  onChange={(e) => setReimbAmount(Number.parseFloat(e.target.value) || 0)}
                  className="text-center font-bold text-emerald-700"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Transfer To</Label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Select —" />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Action Date</Label>
            <Input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Remarks</Label>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Disposal reason, sale price, tracking…"
          />
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Seller Tracking
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Seller Status</Label>
              <Select value={sellerStatus} onValueChange={setSellerStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— Select —" />
                </SelectTrigger>
                <SelectContent>
                  {SELLER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Seller Comments</Label>
              <Input value={sellerComments} onChange={(e) => setSellerComments(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Warehouse Billing
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Billed?</Label>
              <Select
                value={warehouseBilled ? "YES" : "NO"}
                onValueChange={(v) => setWarehouseBilled(v === "YES")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO">❌ NO</SelectItem>
                  <SelectItem value="YES">✓ YES</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Billed Date</Label>
              <Input
                type="date"
                value={billedDate}
                onChange={(e) => setBilledDate(e.target.value)}
                disabled={!warehouseBilled}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Amount ($)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={billedAmount}
                onChange={(e) => setBilledAmount(Number.parseFloat(e.target.value) || 0)}
                disabled={!warehouseBilled}
                className="text-center font-bold text-amber-700"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Invoice / Reshipment
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Invoice Number
              </Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Reshipped Qty
              </Label>
              <Input
                type="number"
                min={0}
                value={reshippedQty}
                onChange={(e) =>
                  setReshippedQty(Number.parseInt(e.target.value) || 0)
                }
                className="text-center font-bold"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Attachments
          </div>
          <AttachmentZone
            receiptId={receipt.id}
            initial={initialAttachments}
            disabled={busy}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            ✓ Save Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
