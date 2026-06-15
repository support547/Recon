"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveAdjManualAdjAction } from "@/actions/adjustment-reconciliation";
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
import { AdjStatusBadge } from "@/components/adjustment-reconciliation/shared/status-badge";
import type { AdjAnalysisRow } from "@/lib/adjustment-reconciliation/types";

const ADJ_TYPES = [
  { value: "QUANTITY", label: "Quantity / Recount" },
  { value: "FINANCIAL", label: "Financial / Credit" },
  { value: "STATUS", label: "Status Change" },
  { value: "LOST", label: "Lost" },
  { value: "OTHER", label: "Other / Write-off" },
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function AdjustModal({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: AdjAnalysisRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔧 Manual Adjustment — Adjustment Recon</DialogTitle>
        </DialogHeader>
        <ModalBody
          key={`${row.msku}|${row.fnsku}|${open ? "o" : "c"}`}
          row={row}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  row,
  onClose,
  onSaved,
}: {
  row: AdjAnalysisRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [adjType, setAdjType] = React.useState("QUANTITY");
  const [qtyAdjusted, setQtyAdjusted] = React.useState(row.unreconciledQty || 0);
  const [reason, setReason] = React.useState("Confirmed reconciled offline");
  const [adjDate, setAdjDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onSubmit() {
    if (!adjType) {
      toast.error("Select adjustment type");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter reason");
      return;
    }
    setBusy(true);
    try {
      const res = await saveAdjManualAdjAction({
        msku: row.msku,
        fnsku: row.fnsku || null,
        asin: row.asin || null,
        title: row.title || null,
        adjType,
        qtyAdjusted,
        reason,
        adjDate,
        notes: notes || null,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("🔧 Adjustment saved");
      onClose();
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
        <Info label="MSKU">{row.msku}</Info>
        <Info label="FNSKU">{row.fnsku || "—"}</Info>
        <Info label="Loss Qty">{row.lossQty}</Info>
        <Info label="Unreconciled">
          <span className="text-amber-700 font-bold">{row.unreconciledQty}</span>
        </Info>
        <Info label="Days Pending">{row.daysPending}</Info>
        <div className="flex items-center gap-2 py-1">
          <span className="text-[10px] uppercase text-muted-foreground">Status</span>
          <AdjStatusBadge status={row.actionStatus} />
        </div>
      </div>

      <Field label="Adjustment Type *">
        <Select value={adjType} onValueChange={setAdjType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="— Select type —" />
          </SelectTrigger>
          <SelectContent>
            {ADJ_TYPES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Qty Adjusted (±)">
          <Input
            type="number"
            value={qtyAdjusted}
            onChange={(e) => setQtyAdjusted(Number.parseInt(e.target.value) || 0)}
            className="text-center font-bold"
          />
        </Field>
        <Field label="Adj. Date">
          <Input
            type="date"
            value={adjDate}
            onChange={(e) => setAdjDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Reason *">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Brief reason…"
        />
      </Field>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void onSubmit()} disabled={busy}>
          🔧 Save Adjustment
        </Button>
      </DialogFooter>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] font-semibold">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
