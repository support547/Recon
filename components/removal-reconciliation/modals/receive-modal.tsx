"use client";

import * as React from "react";
import { toast } from "sonner";

import { saveReceiveAction } from "@/actions/removal-reconciliation";
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
import {
  CaseTypeButtonGrid,
  CONDITION_PRESETS,
  ConditionButtonGrid,
} from "@/components/removal-reconciliation/shared/condition-button-grid";
import type { RemovalReconRow } from "@/lib/removal-reconciliation/types";

const CARRIERS = ["UPS_GR_PL", "USPS_ATS_BPM", "FedEx", "Other"];
const WH_STATUSES = [
  "Pending",
  "Received - Ready",
  "Received - Pending Check",
  "Damaged - Case Needed",
  "Incorrect Item",
  "Disposed",
];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function ReceiveModal({
  row,
  open,
  onOpenChange,
  preselectCase,
  onSaved,
}: {
  row: RemovalReconRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectCase?: boolean;
  onSaved?: () => void;
}) {
  const [trackingNumber, setTrackingNumber] = React.useState("");
  const [carrier, setCarrier] = React.useState("");
  const [receivedDate, setReceivedDate] = React.useState(todayIso());
  const [receivedBy, setReceivedBy] = React.useState("");
  const [receivedQty, setReceivedQty] = React.useState(0);
  const [sellableQty, setSellableQty] = React.useState(0);
  const [unsellableQty, setUnsellableQty] = React.useState(0);
  const [conditionReceived, setConditionReceived] = React.useState("NEW");
  const [notes, setNotes] = React.useState("");
  const [whComment, setWhComment] = React.useState("");
  const [whStatus, setWhStatus] = React.useState("Pending");
  const [transferTo, setTransferTo] = React.useState("");
  const [wrongItem, setWrongItem] = React.useState(false);
  const [wrongItemNotes, setWrongItemNotes] = React.useState("");
  const [raiseCase, setRaiseCase] = React.useState(false);
  const [caseReason, setCaseReason] = React.useState("Removal_Short_Received");
  const [unitsClaimed, setUnitsClaimed] = React.useState(0);
  const [valuePerUnit, setValuePerUnit] = React.useState(0);
  const [caseNotes, setCaseNotes] = React.useState("");
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [reshippedQty, setReshippedQty] = React.useState(0);
  const [itemTitle, setItemTitle] = React.useState("");
  const [binLocation, setBinLocation] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    const exp = row.expectedShipped;
    setTrackingNumber(row.trackingNumbers.split(" | ")[0] ?? "");
    setCarrier(row.carriers.split(", ")[0] ?? "");
    setReceivedDate(todayIso());
    setReceivedBy("");
    setReceivedQty(exp);
    setSellableQty(exp);
    setUnsellableQty(0);
    setConditionReceived("NEW");
    setNotes("");
    setWhComment("");
    setWhStatus("Received - Ready");
    setTransferTo("FBA Reshipment");
    setWrongItem(false);
    setWrongItemNotes("");
    setRaiseCase(Boolean(preselectCase));
    setCaseReason("Removal_Short_Received");
    setUnitsClaimed(0);
    setValuePerUnit(0);
    setCaseNotes("");
    setInvoiceNumber("");
    setReshippedQty(0);
    setItemTitle("");
    setBinLocation("");
  }, [open, row, preselectCase]);

  if (!row) return null;

  const expectedQty = row.expectedShipped;
  const missing = Math.max(0, expectedQty - receivedQty);
  const totalClaim = unitsClaimed * valuePerUnit;

  function onChangeReceived(v: number) {
    setReceivedQty(v);
    const newSell = Math.max(0, v - unsellableQty);
    setSellableQty(newSell);
    const miss = Math.max(0, expectedQty - v);
    if (miss > 0) {
      setRaiseCase(true);
      setCaseReason(v === 0 ? "Removal_Not_Received" : "Removal_Short_Received");
      setUnitsClaimed(miss);
    } else if (unsellableQty === 0) {
      setRaiseCase(false);
    }
  }

  function onChangeSellable(v: number) {
    setSellableQty(v);
    const newUnsell = Math.max(0, receivedQty - v);
    setUnsellableQty(newUnsell);
    if (newUnsell > 0) {
      setConditionReceived("DAMAGED");
      setUnitsClaimed(newUnsell);
    }
  }

  function onChangeUnsellable(v: number) {
    setUnsellableQty(v);
    const newSell = Math.max(0, receivedQty - v);
    setSellableQty(newSell);
    if (v > 0) {
      setConditionReceived("DAMAGED");
      setRaiseCase(true);
      setUnitsClaimed(v);
    }
  }

  function onPickCondition(preset: (typeof CONDITION_PRESETS)[number]) {
    setConditionReceived(preset.value);
    setTransferTo(preset.transferTo);
    setWhStatus(preset.whStatus);
    if (preset.triggersCase) {
      setRaiseCase(true);
      if (preset.caseReason) setCaseReason(preset.caseReason);
      if (preset.value === "INCORRECT ITEM") {
        setUnitsClaimed(expectedQty);
      } else if (preset.value === "DAMAGED" || preset.value === "WATER DAMAGED") {
        setUnitsClaimed(unsellableQty || receivedQty);
      }
    } else {
      setRaiseCase(false);
    }
  }

  async function onSubmit() {
    if (!row) return;
    setBusy(true);
    try {
      const res = await saveReceiveAction({
        orderId: row.orderId,
        fnsku: row.fnsku,
        msku: row.msku,
        trackingNumber: trackingNumber || null,
        carrier: carrier || null,
        expectedQty,
        receivedDate,
        receivedQty,
        sellableQty,
        unsellableQty,
        conditionReceived,
        notes,
        receivedBy,
        warehouseComment: whComment,
        transferTo,
        whStatus,
        wrongItemReceived: wrongItem,
        wrongItemNotes: wrongItem ? wrongItemNotes : null,
        raiseCase,
        caseReason: raiseCase ? caseReason : null,
        unitsClaimed: raiseCase ? unitsClaimed : 0,
        amountClaimed: raiseCase ? totalClaim : 0,
        caseNotes: raiseCase ? caseNotes : null,
        issueDate: receivedDate,
        invoiceNumber: invoiceNumber || null,
        reshippedQty,
        itemTitle: itemTitle || null,
        binLocation: binLocation || null,
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success(raiseCase ? "✓ Saved! Receipt + Case created." : "✓ Receipt saved.");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📦 Mark as Received</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {row.orderType} · {row.orderStatus} · {row.disposition}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs sm:grid-cols-4">
          <Cell label="Order ID" mono>{row.orderId}</Cell>
          <Cell label="FNSKU" mono>{row.fnsku}</Cell>
          <Cell label="Expected" tone="blue">{expectedQty}</Cell>
          <Cell label="Shipped" tone="violet">{row.actualShipped}</Cell>
          <Cell label="MSKU" mono className="col-span-2 sm:col-span-4">{row.msku}</Cell>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Step 1 — Warehouse Receipt
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tracking Number">
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Auto-filled"
            />
          </Field>
          <Field label="Carrier">
            <Select value={carrier} onValueChange={setCarrier}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                {CARRIERS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Received Date">
            <Input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </Field>
          <Field label="Received By">
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Your name" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Received Qty">
            <Input
              type="number"
              min={0}
              value={receivedQty}
              onChange={(e) => onChangeReceived(Number.parseInt(e.target.value) || 0)}
              className="text-center text-lg font-bold"
            />
          </Field>
          <Field label="Sellable Qty">
            <Input
              type="number"
              min={0}
              value={sellableQty}
              onChange={(e) => onChangeSellable(Number.parseInt(e.target.value) || 0)}
              className="text-emerald-700"
            />
          </Field>
          <Field label="Unsellable Qty">
            <Input
              type="number"
              min={0}
              value={unsellableQty}
              onChange={(e) => onChangeUnsellable(Number.parseInt(e.target.value) || 0)}
              className="text-red-700"
            />
          </Field>
        </div>

        {missing > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠ <b>{missing}</b> units missing (Expected {expectedQty}, Received {receivedQty})
          </div>
        ) : null}

        <Field label="Book Condition">
          <ConditionButtonGrid value={conditionReceived} onChange={onPickCondition} />
        </Field>

        <Field label="Notes / Damage Description">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. 2 books water damaged, spine broken…"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Warehouse Status">
            <Select value={whStatus} onValueChange={setWhStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WH_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Transfer To">
            <Input value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
          </Field>
        </div>

        <Field label="Warehouse Comment">
          <Textarea
            value={whComment}
            onChange={(e) => setWhComment(e.target.value)}
            rows={2}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Item Title">
            <Input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Bin Location">
            <Input
              value={binLocation}
              onChange={(e) => setBinLocation(e.target.value)}
              placeholder="e.g. A-12-03"
            />
          </Field>
          <Field label="Invoice Number">
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Receipt invoice #"
            />
          </Field>
          <Field label="Reshipped Qty">
            <Input
              type="number"
              min={0}
              value={reshippedQty}
              onChange={(e) =>
                setReshippedQty(Number.parseInt(e.target.value) || 0)
              }
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
            ⚠️ Wrong Item Received?
          </span>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={wrongItem}
              onChange={(e) => setWrongItem(e.target.checked)}
              className="size-4 accent-amber-500"
            />
            Yes, wrong item received
          </label>
        </div>
        {wrongItem ? (
          <Field label="Wrong Item Description">
            <Textarea
              value={wrongItemNotes}
              onChange={(e) => setWrongItemNotes(e.target.value)}
              rows={2}
              className="border-amber-300"
              placeholder="e.g. Received ISBN 978-X instead of ISBN 978-Y…"
            />
          </Field>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Step 2 — Raise Reimbursement Case
          </span>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={raiseCase}
              onChange={(e) => setRaiseCase(e.target.checked)}
              className="size-4 accent-blue-500"
            />
            Raise Case
          </label>
        </div>

        {raiseCase ? (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Field label="Case Type">
              <CaseTypeButtonGrid value={caseReason} onChange={setCaseReason} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Units to Claim">
                <Input
                  type="number"
                  min={0}
                  value={unitsClaimed}
                  onChange={(e) => setUnitsClaimed(Number.parseInt(e.target.value) || 0)}
                  className="text-center font-bold"
                />
              </Field>
              <Field label="Value/Unit ($)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={valuePerUnit}
                  onChange={(e) => setValuePerUnit(Number.parseFloat(e.target.value) || 0)}
                />
              </Field>
              <Field label="Total Claim ($)">
                <Input readOnly value={totalClaim.toFixed(2)} className="bg-slate-100 text-emerald-700" />
              </Field>
            </div>
            <Field label="Case Notes">
              <Textarea
                value={caseNotes}
                onChange={(e) => setCaseNotes(e.target.value)}
                rows={2}
                placeholder="Evidence, notes…"
              />
            </Field>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            💾 Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Cell({
  label,
  children,
  mono,
  tone,
  className,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  tone?: "blue" | "violet";
  className?: string;
}) {
  const valueClass =
    tone === "blue"
      ? "text-blue-700 text-lg font-bold"
      : tone === "violet"
        ? "text-violet-700 font-bold"
        : "text-foreground font-semibold";
  return (
    <div className={className}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${valueClass} text-xs truncate`}>{children}</div>
    </div>
  );
}
