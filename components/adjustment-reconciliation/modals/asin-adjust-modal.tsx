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
import type { AdjLogRow, AdjPivotRow } from "@/lib/adjustment-reconciliation/types";

const ADJ_TYPES = [
  { value: "FINANCIAL", label: "Reimbursement" },
  { value: "QUANTITY", label: "Quantity / Recount" },
  { value: "STATUS", label: "Status Change" },
  { value: "LOST", label: "Lost" },
  { value: "OTHER", label: "Other" },
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function AsinAdjustModal({
  row,
  logRows,
  open,
  onOpenChange,
  onSaved,
}: {
  row: AdjPivotRow | null;
  logRows: AdjLogRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [adjType, setAdjType] = React.useState("FINANCIAL");
  const [referenceId, setReferenceId] = React.useState("");
  const [qtyAdjusted, setQtyAdjusted] = React.useState(0);
  const [amount, setAmount] = React.useState(0);
  const [reason, setReason] = React.useState("Manual reimbursement entry");
  const [adjDate, setAdjDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [msku, setMsku] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  const mskuOptions = React.useMemo(() => {
    if (!row) return [] as { msku: string; fnsku: string }[];
    const map = new Map<string, string>();
    for (const r of logRows) {
      if (r.asin !== row.key) continue;
      if (!r.msku) continue;
      if (!map.has(r.msku)) map.set(r.msku, r.fnsku || "");
    }
    return Array.from(map.entries()).map(([msku, fnsku]) => ({ msku, fnsku }));
  }, [row, logRows]);

  const fnsku = React.useMemo(() => {
    return mskuOptions.find((o) => o.msku === msku)?.fnsku ?? "";
  }, [msku, mskuOptions]);

  React.useEffect(() => {
    if (!open || !row) return;
    setAdjType("FINANCIAL");
    setReferenceId("");
    setQtyAdjusted(Math.abs(row.totalQty) || 0);
    setAmount(0);
    setReason("Manual reimbursement entry");
    setAdjDate(todayIso());
    setNotes("");
    setMsku("");
  }, [open, row]);

  if (!row) return null;

  async function onSubmit() {
    if (!row) return;
    if (!adjType) {
      toast.error("Select adjustment type");
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter reason");
      return;
    }
    if (qtyAdjusted === 0 && amount === 0) {
      toast.error("Enter Qty or Amount");
      return;
    }
    setBusy(true);
    try {
      const res = await saveAdjManualAdjAction({
        msku: msku || null,
        fnsku: fnsku || null,
        asin: row.key,
        title: row.title || null,
        adjType,
        qtyAdjusted,
        amount,
        referenceId: referenceId || null,
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
      <DialogContent
        className="max-h-[92vh] w-[95vw] overflow-y-auto sm:!max-w-3xl"
        style={{ maxWidth: "min(95vw, 880px)" }}
      >
        <DialogHeader>
          <DialogTitle>🔧 Adjustment / Reimbursement — ASIN {row.key}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <Info label="ASIN">{row.key}</Info>
          <Info label="Title">{row.title || "—"}</Info>
          <Info label="Net Qty">
            <span
              className={
                row.totalQty < 0
                  ? "text-red-600"
                  : row.totalQty > 0
                    ? "text-emerald-700"
                    : ""
              }
            >
              {row.totalQty > 0 ? "+" : ""}
              {row.totalQty}
            </span>
          </Info>
          <Info label="Reimb Qty (existing)">{row.reimbQty}</Info>
          <Info label="Reimb $ (existing)">{`$${row.reimbAmount.toFixed(2)}`}</Info>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="MSKU (optional)">
            <Select value={msku || "__none__"} onValueChange={(v) => setMsku(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select MSKU" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {mskuOptions.map((o) => (
                  <SelectItem key={o.msku} value={o.msku}>
                    {o.msku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="FNSKU (auto)">
            <Input value={fnsku} readOnly placeholder="—" className="bg-slate-50" />
          </Field>
        </div>

        <Field label="Adjustment Type *">
          <Select value={adjType} onValueChange={setAdjType}>
            <SelectTrigger className="w-full">
              <SelectValue />
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

        <Field label="Reimbursement ID">
          <Input
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="Amazon reimbursement / reference ID"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Qty">
            <Input
              type="number"
              value={qtyAdjusted}
              onChange={(e) => setQtyAdjusted(Number.parseInt(e.target.value) || 0)}
              className="text-center font-bold"
            />
          </Field>
          <Field label="Amount ($)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number.parseFloat(e.target.value) || 0)}
              className="text-emerald-700"
            />
          </Field>
        </div>

        <Field label="Adj. Date">
          <Input
            type="date"
            value={adjDate}
            onChange={(e) => setAdjDate(e.target.value)}
          />
        </Field>

        <Field label="Reason *">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            🔧 Save
          </Button>
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
