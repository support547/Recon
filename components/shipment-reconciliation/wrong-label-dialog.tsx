"use client";

import * as React from "react";
import { toast } from "sonner";

import { createWrongLabelAdjustment } from "@/actions/adjustments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type WrongLabelDialogContext = {
  shipmentId: string;
  msku: string;
  expectedFnsku: string;
  asin?: string | null;
  title?: string | null;
  store?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: WrongLabelDialogContext | null;
  onSaved?: () => void | Promise<void>;
};

export function WrongLabelDialog({ open, onOpenChange, context, onSaved }: Props) {
  const [receivedAsFnsku, setReceivedAsFnsku] = React.useState("");
  const [quantity, setQuantity] = React.useState<string>("1");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setReceivedAsFnsku("");
      setQuantity("1");
      setNotes("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!context) return;
    const qty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be at least 1.");
      return;
    }
    if (!receivedAsFnsku.trim()) {
      toast.error("Received-as FNSKU is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createWrongLabelAdjustment({
        shipmentId: context.shipmentId,
        msku: context.msku,
        expectedFnsku: context.expectedFnsku,
        receivedAsFnsku: receivedAsFnsku.trim(),
        quantity: qty,
        notes: notes.trim() || undefined,
        asin: context.asin ?? null,
        title: context.title ?? null,
        store: context.store ?? null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("⚠ Wrong-label adjustment recorded");
      onOpenChange(false);
      await onSaved?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flag Wrong Label</DialogTitle>
          <DialogDescription>
            Record a unit received under a different FNSKU than expected.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wl-shipment" className="text-[11px]">
                Shipment ID
              </Label>
              <Input
                id="wl-shipment"
                value={context?.shipmentId ?? ""}
                readOnly
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="wl-msku" className="text-[11px]">
                MSKU
              </Label>
              <Input
                id="wl-msku"
                value={context?.msku ?? ""}
                readOnly
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wl-expected" className="text-[11px]">
                Expected FNSKU
              </Label>
              <Input
                id="wl-expected"
                value={context?.expectedFnsku ?? ""}
                readOnly
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="wl-received" className="text-[11px]">
                Received as FNSKU
              </Label>
              <Input
                id="wl-received"
                value={receivedAsFnsku}
                onChange={(e) => setReceivedAsFnsku(e.target.value)}
                placeholder="X004YWCZ77"
                className="h-8 font-mono text-xs uppercase"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="wl-qty" className="text-[11px]">
              Quantity
            </Label>
            <Input
              id="wl-qty"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-8 w-32 font-mono text-xs"
              required
            />
          </div>
          <div>
            <Label htmlFor="wl-notes" className="text-[11px]">
              Notes (optional)
            </Label>
            <Textarea
              id="wl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional context"
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
