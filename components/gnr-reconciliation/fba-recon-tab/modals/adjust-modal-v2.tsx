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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GnrV2StatusBadge } from "@/components/gnr-reconciliation/fba-recon-tab/status-badge-v2";
import type { GnrV2Row } from "@/lib/gnr-reconciliation/v2/types";

const ADJ_TYPES = [
  { value: "QUANTITY", label: "Quantity / Recount" },
  { value: "FINANCIAL", label: "Financial / Credit" },
  { value: "STATUS", label: "Status / Transfer" },
  { value: "LOST", label: "Lost" },
  { value: "OTHER", label: "Other / Write-off" },
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Manual-adjustment modal for the FBA Recon v2 table. Mirrors the Returns Recon
 * flow (same server action the v1 GNR tab uses). The saved row lands in
 * manualAdjustment with reconType=GNR, so it flows back into the v2 Manual Adj
 * column (buildAdjMapV2 keys adjustments by used MSKU) on the next refresh.
 *
 * Sign matters: qtyAdjusted is stored as entered and feeds adjSigned in the
 * recon (a negative value subtracts from Computed End). Default is the signed
 * variance so a one-click adjustment closes the gap.
 */
export function AdjustModalV2({
  row,
  open,
  onOpenChange,
  onSaved,
}: {
  row: GnrV2Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [qtyAdjusted, setQtyAdjusted] = React.useState(0);
  const [adjType, setAdjType] = React.useState("QUANTITY");
  const [reason, setReason] = React.useState("");
  const [adjDate, setAdjDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    // Default to the SIGNED variance so the adjustment closes Computed End→Ledger.
    // variance = ledgerEnding − computedEnding; adjSigned += qtyAdjusted, so the
    // value that zeroes variance is exactly the variance itself.
    setQtyAdjusted(row.variance ?? 0);
    setAdjType("QUANTITY");
    setReason("GNR manual adjustment");
    setAdjDate(todayIso());
    setNotes("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmit() {
    if (!row) return;
    if (!qtyAdjusted) {
      toast.error("Please enter a non-zero adjustment qty");
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
          <DialogTitle>🔧 Manual Adjustment — FBA Recon v2</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="Used MSKU">{row.usedMsku}</Info>
          <Info label="Used FNSKU">{row.usedFnsku}</Info>
          <Info label="Computed End">{row.isMixedSku ? "—" : row.computedEnding}</Info>
          <Info label="Ledger End">{row.ledgerEnding ?? "—"}</Info>
          <Info label="Variance">{row.variance ?? "—"}</Info>
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Status</span>
            <GnrV2StatusBadge status={row.status} />
          </div>
        </div>

        <Field label="Adjustment Type *">
          <Select value={adjType} onValueChange={setAdjType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— Select type —" />
            </SelectTrigger>
            <SelectContent>
              {ADJ_TYPES.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Adjustment Qty * (signed)">
            <Input
              type="number"
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
