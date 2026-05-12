"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveReimbursement } from "@/actions/removal-reconciliation";
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

export type ReimbModalTarget =
  | { kind: "order"; orderId: string; fnsku: string; msku: string; missingQty: number }
  | { kind: "receipt"; receiptId: string; orderId: string; fnsku: string; missingQty: number };

export function ReimbursementModal({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: ReimbModalTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [qty, setQty] = React.useState(0);
  const [amount, setAmount] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !target) return;
    setQty(target.missingQty);
    setAmount(0);
    setNotes("");
  }, [open, target]);

  if (!target) return null;

  async function onSubmit() {
    if (!target) return;
    setBusy(true);
    try {
      const res = await saveReimbursement({
        receiptId: target.kind === "receipt" ? target.receiptId : null,
        orderId: target.orderId,
        fnsku: target.fnsku,
        reimbQty: qty,
        reimbAmount: amount,
        notes,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("💰 Reimbursement saved!");
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
          <DialogTitle>💰 Enter Amazon Reimbursement</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
          Order: <b className="font-mono text-foreground">{target.orderId}</b>
          {" · "}
          FNSKU: <b className="font-mono text-foreground">{target.fnsku}</b>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Reimbursed Qty</Label>
            <Input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(Number.parseInt(e.target.value) || 0)}
              className="text-center text-base font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Amount ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number.parseFloat(e.target.value) || 0)}
              className="text-center text-base font-bold text-emerald-700"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Amazon case ID, transaction ref…"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            💰 Save Reimb.
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
