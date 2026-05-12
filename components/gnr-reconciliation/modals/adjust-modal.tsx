"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveGnrAdjustmentAction } from "@/actions/gnr-reconciliation";
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
import { Textarea } from "@/components/ui/textarea";
import { GnrStatusBadge } from "@/components/gnr-reconciliation/shared/status-badge";
import type { GnrReconRow } from "@/lib/gnr-reconciliation/types";

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function AdjustModal({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: GnrReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [qtyAdjusted, setQtyAdjusted] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [adjDate, setAdjDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    setQtyAdjusted(Math.abs(row.endingBalance) || 0);
    setReason("GNR manual adjustment");
    setAdjDate(todayIso());
    setNotes("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmit() {
    if (!row) return;
    if (!qtyAdjusted) {
      toast.error("Please enter adjustment qty");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please enter a reason");
      return;
    }
    setBusy(true);
    try {
      const res = await saveGnrAdjustmentAction({
        usedMsku: row.usedMsku,
        asin: row.asin === "—" ? null : row.asin,
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
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔧 Manual Adjustment — GNR Recon</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="Used MSKU">{row.usedMsku}</Info>
          <Info label="Used FNSKU">{row.usedFnsku}</Info>
          <Info label="Ending Balance">{row.endingBalance}</Info>
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Status</span>
            <GnrStatusBadge status={row.actionStatus} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Adjustment Qty *">
            <Input
              type="number"
              min={0}
              value={qtyAdjusted}
              onChange={(e) => setQtyAdjusted(Number.parseInt(e.target.value) || 0)}
              className="text-center font-bold"
            />
          </Field>
          <Field label="Adj. Date">
            <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Reason *">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Brief reason…" />
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes…" />
        </Field>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>🔧 Save Adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
