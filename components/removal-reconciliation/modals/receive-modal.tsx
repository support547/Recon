"use client";

import * as React from "react";
import { Hash, MapPin, Upload, X, FileText, Camera, Package } from "lucide-react";
import { toast } from "sonner";

import { saveReceiveAction } from "@/actions/removal-reconciliation";
import { uploadRemovalAttachment } from "@/actions/removal-attachments";
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
} from "@/components/removal-reconciliation/shared/condition-button-grid";
import { cn } from "@/lib/utils";
import type { RemovalReconRow } from "@/lib/removal-reconciliation/types";

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

type AttachmentSlot = "bol" | "front" | "back" | "packing";

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
  const [selectedTracking, setSelectedTracking] = React.useState("");
  const [receivedDate, setReceivedDate] = React.useState(todayIso());
  const [lpnNumber, setLpnNumber] = React.useState("");
  const [binLocation, setBinLocation] = React.useState("");
  const [itemTitle, setItemTitle] = React.useState("");
  const [receivedQty, setReceivedQty] = React.useState(0);
  const [sellableQty, setSellableQty] = React.useState(0);
  const [unsellableQty, setUnsellableQty] = React.useState(0);
  const [conditionReceived, setConditionReceived] = React.useState("NEW");
  const [titleNote, setTitleNote] = React.useState("");
  const [whComment, setWhComment] = React.useState("");
  const [processedBy, setProcessedBy] = React.useState("");
  const [transferTo, setTransferTo] = React.useState("FBA Reshipment");
  const [whStatus, setWhStatus] = React.useState("Received - Ready");
  const [raiseCase, setRaiseCase] = React.useState(false);
  const [caseReason, setCaseReason] = React.useState("Removal_Short_Received");
  const [unitsClaimed, setUnitsClaimed] = React.useState(0);
  const [valuePerUnit, setValuePerUnit] = React.useState(0);
  const [caseNotes, setCaseNotes] = React.useState("");
  const [caseId, setCaseId] = React.useState("");
  const [caseUrl, setCaseUrl] = React.useState("");
  const [files, setFiles] = React.useState<Record<AttachmentSlot, File[]>>({
    bol: [],
    front: [],
    back: [],
    packing: [],
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !row) return;
    const details = row.trackingDetails ?? [];
    // Default to the first tracking not yet fully received, else the first one.
    const firstOpen =
      details.find((d) => d.received < d.shipped) ?? details[0];
    setSelectedTracking(firstOpen?.tracking ?? "");
    const exp = firstOpen ? firstOpen.shipped : row.expectedShipped;
    setReceivedDate(todayIso());
    setLpnNumber("");
    setBinLocation("");
    setItemTitle("");
    setReceivedQty(exp);
    setSellableQty(exp);
    setUnsellableQty(0);
    setConditionReceived("NEW");
    setTitleNote("");
    setWhComment("");
    setProcessedBy("");
    setTransferTo("FBA Reshipment");
    setWhStatus("Received - Ready");
    setRaiseCase(Boolean(preselectCase));
    setCaseReason("Removal_Short_Received");
    setUnitsClaimed(0);
    setValuePerUnit(0);
    setCaseNotes("");
    setCaseId("");
    setCaseUrl("");
    setFiles({ bol: [], front: [], back: [], packing: [] });
  }, [open, row, preselectCase]);

  if (!row) return null;

  const trackingDetails = row.trackingDetails ?? [];
  const hasMultiTracking = trackingDetails.length > 1;

  // Selected per-tracking detail drives tracking #, carrier, and expected qty.
  // Falls back to the parent-row pipe-joined string when no shipment detail exists.
  const selectedDetail = trackingDetails.find((d) => d.tracking === selectedTracking);
  const fallbackTracking =
    row.trackingNumbers.split(/[,\n| ]/).map((s) => s.trim()).filter(Boolean)[0] ?? "";
  const fallbackCarrier = row.carriers.split(/[,\n]/)[0]?.trim() ?? "";

  const trackingNumber = selectedDetail?.tracking ?? (selectedTracking || fallbackTracking);
  const carrier = selectedDetail?.carrier || fallbackCarrier;
  // Per-tracking expected = units shipped on this tracking; fall back to order-level.
  const expectedQty = selectedDetail ? selectedDetail.shipped : row.expectedShipped;
  const missing = Math.max(0, expectedQty - receivedQty);
  const totalClaim = unitsClaimed * valuePerUnit;

  function onChangeTracking(t: string) {
    setSelectedTracking(t);
    const d = (row?.trackingDetails ?? []).find((x) => x.tracking === t);
    const exp = d ? d.shipped : (row?.expectedShipped ?? 0);
    setReceivedQty(exp);
    setSellableQty(exp);
    setUnsellableQty(0);
    setRaiseCase(Boolean(preselectCase));
    setUnitsClaimed(0);
  }

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
      if (preset.value === "WRONG ITEM" || preset.value === "INCORRECT ITEM") {
        setUnitsClaimed(expectedQty);
      } else if (preset.value === "DAMAGED" || preset.value === "WATER DAMAGED") {
        setUnitsClaimed(unsellableQty || receivedQty);
      }
    } else if (missing === 0 && unsellableQty === 0) {
      setRaiseCase(false);
    }
  }

  async function uploadSlot(arr: File[]): Promise<string[]> {
    if (!arr.length) return [];
    const out: string[] = [];
    for (const f of arr) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await uploadRemovalAttachment(fd);
      if (!res.ok) {
        toast.error(`Upload failed: ${f.name}`, { description: res.error });
        throw new Error(res.error);
      }
      out.push(res.url);
    }
    return out;
  }

  async function onSubmit() {
    if (!row || !processedBy.trim()) return;
    if (raiseCase && unitsClaimed < 1) {
      toast.error("Cannot raise case", {
        description: "Enter at least 1 unit to claim, or turn off the case toggle.",
      });
      return;
    }
    setBusy(true);
    try {
      let bolUrls: string[] = [];
      let frontUrls: string[] = [];
      let backUrls: string[] = [];
      let packingUrls: string[] = [];
      try {
        [bolUrls, frontUrls, backUrls, packingUrls] = await Promise.all([
          uploadSlot(files.bol),
          uploadSlot(files.front),
          uploadSlot(files.back),
          uploadSlot(files.packing),
        ]);
      } catch {
        return;
      }
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
        notes: titleNote || null,
        receivedBy: processedBy,
        warehouseComment: whComment,
        transferTo,
        whStatus,
        wrongItemReceived: conditionReceived === "WRONG ITEM" || conditionReceived === "INCORRECT ITEM",
        wrongItemNotes: null,
        raiseCase,
        caseReason: raiseCase ? caseReason : null,
        unitsClaimed: raiseCase ? unitsClaimed : 0,
        amountClaimed: raiseCase ? totalClaim : 0,
        caseNotes: raiseCase ? caseNotes : null,
        caseId: raiseCase ? (caseId.trim() || null) : null,
        caseUrl: raiseCase ? (caseUrl.trim() || null) : null,
        issueDate: receivedDate,
        invoiceNumber: lpnNumber || null,
        reshippedQty: 0,
        itemTitle: itemTitle || null,
        binLocation: binLocation || null,
        lpnNumber: lpnNumber || null,
        bolAttachmentCount: bolUrls.length,
        frontPhotoCount: frontUrls.length,
        backPhotoCount: backUrls.length,
        packingListCount: packingUrls.length,
        bolAttachmentUrls: bolUrls,
        frontPhotoUrls: frontUrls,
        backPhotoUrls: backUrls,
        packingListUrls: packingUrls,
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
      <DialogContent
        className="max-h-[95vh] w-[95vw] overflow-y-auto sm:!max-w-3xl"
        style={{ maxWidth: "min(95vw, 880px)" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5" aria-hidden /> Mark as Received
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {row.orderType} · {row.orderStatus} · {row.disposition}
          </p>
        </DialogHeader>

        {/* ─── Read-only: Order ID / FNSKU / MSKU ─── */}
        <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-300 bg-slate-100 p-3 sm:grid-cols-3">
          <SummaryCell label="Order ID" value={row.orderId} mono />
          <SummaryCell label="FNSKU" value={row.fnsku} mono />
          <SummaryCell label="MSKU" value={row.msku} mono />
        </div>

        {/* ─── Read-only: Order Date / Tracking / Carrier / Shipped + BOL upload ─── */}
        <div className="rounded-md border border-slate-300 bg-slate-100 p-3 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <SummaryCell label="Order Date" value={row.requestDate || "—"} mono />
            {hasMultiTracking ? (
              <div className="rounded-md border border-blue-300 bg-blue-50/60 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-blue-700">
                  Tracking ID / BOL · pick one
                </div>
                <Select value={selectedTracking} onValueChange={onChangeTracking}>
                  <SelectTrigger className="mt-1 h-8 w-full font-mono text-xs">
                    <SelectValue placeholder="Select tracking" />
                  </SelectTrigger>
                  <SelectContent>
                    {trackingDetails.map((d) => {
                      const done = d.received >= d.shipped && d.shipped > 0;
                      const remaining = Math.max(0, d.shipped - d.received);
                      return (
                        <SelectItem key={d.tracking} value={d.tracking}>
                          <span className="font-mono">{d.tracking}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            ship {d.shipped} ·{" "}
                            {done
                              ? "✓ received"
                              : d.received > 0
                                ? `${remaining} left`
                                : "not received"}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <SummaryCell label="Tracking ID / BOL" value={trackingNumber} mono />
            )}
            <SummaryCell label="Carrier" value={carrier} mono />
            <SummaryCell
              label={hasMultiTracking ? "Shipped (this tracking)" : "Shipped Qty"}
              value={String(selectedDetail ? selectedDetail.shipped : row.actualShipped)}
              tone="violet"
            />
          </div>
          <DropZone
            label="Tracking ID / BOL Proof"
            icon={<FileText className="size-4" aria-hidden />}
            files={files.bol}
            onChange={(f) => setFiles((p) => ({ ...p, bol: f }))}
          />
        </div>

        {/* ─── Editable: Received Date / Bin Location / LPN ─── */}
        <Section step={1} title="Receipt Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Received Date">
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </Field>
            <Field label="Bin Location">
              <IconInput
                icon={<MapPin className="size-4" aria-hidden />}
                value={binLocation}
                onChange={setBinLocation}
                placeholder="e.g. A-12-03"
              />
            </Field>
            <Field label="LPN Number">
              <IconInput
                icon={<Hash className="size-4" aria-hidden />}
                value={lpnNumber}
                onChange={setLpnNumber}
                placeholder="e.g. LPN-00123"
              />
            </Field>
          </div>
        </Section>

        {/* ─── Item Title / Condition / Received Qty ─── */}
        <Section step={2} title="Item & Condition">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Item Title">
              <Input
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                placeholder="Book title / product name"
              />
            </Field>
            <Field label="Book Condition">
              <Select
                value={conditionReceived}
                onValueChange={(v) => {
                  const preset = CONDITION_PRESETS.find((p) => p.value === v);
                  if (preset) onPickCondition(preset);
                  else setConditionReceived(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="mr-2">{p.icon}</span>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Received Qty (Expected ${expectedQty})`}>
              <Input
                type="number"
                min={0}
                value={receivedQty}
                onChange={(e) => onChangeReceived(Number.parseInt(e.target.value) || 0)}
                className="h-10 text-center text-lg font-bold"
              />
            </Field>
          </div>
          {missing > 0 ? (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              ⚠ <b>{missing}</b> units missing (Expected {expectedQty}, Received {receivedQty})
            </div>
          ) : null}
        </Section>

        {/* ─── Notes (2-col) ─── */}
        <Section step={3} title="Notes & Comments">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Note for Book Title">
              <Textarea
                value={titleNote}
                onChange={(e) => setTitleNote(e.target.value)}
                rows={3}
                placeholder="e.g. spine broken, ink stain…"
              />
            </Field>
            <Field label="Warehouse Comment">
              <Textarea
                value={whComment}
                onChange={(e) => setWhComment(e.target.value)}
                rows={3}
                placeholder="Internal warehouse note"
              />
            </Field>
          </div>
        </Section>

        {/* ─── Attachments: Front / Back / Packing Slip ─── */}
        <Section step={4} title="Photo Attachments">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DropZone
              label="Front of Book"
              icon={<Camera className="size-4" aria-hidden />}
              files={files.front}
              onChange={(f) => setFiles((p) => ({ ...p, front: f }))}
            />
            <DropZone
              label="Back of Book"
              icon={<Camera className="size-4" aria-hidden />}
              files={files.back}
              onChange={(f) => setFiles((p) => ({ ...p, back: f }))}
            />
            <DropZone
              label="Packing Slip"
              icon={<FileText className="size-4" aria-hidden />}
              files={files.packing}
              onChange={(f) => setFiles((p) => ({ ...p, packing: f }))}
            />
          </div>
        </Section>

        <Section step={5} title="Processed By">
          <Field label="Your Name / Processor Name (required)">
            <Input
              value={processedBy}
              onChange={(e) => setProcessedBy(e.target.value)}
              placeholder="Enter processor name"
              className={cn(!processedBy.trim() && "border-red-300")}
            />
          </Field>
        </Section>

        <div className="rounded-md border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Raise Reimbursement Case (optional)
            </span>
            <ToggleSwitch checked={raiseCase} onChange={setRaiseCase} />
          </div>
          {raiseCase ? (
            <div className="space-y-3 p-3">
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="Case ID (if already raised)">
                  <Input
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                    placeholder="Amazon case number"
                  />
                </Field>
                <Field label="Amazon Case URL">
                  <Input
                    type="url"
                    value={caseUrl}
                    onChange={(e) => setCaseUrl(e.target.value)}
                    placeholder="https://sellercentral.amazon.com/cu/case-dashboard/view-case?caseID=..."
                  />
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
        </div>

        <DialogFooter className="gap-2">
          {raiseCase ? (
            <span className="mr-auto text-[11px] text-muted-foreground">
              A case will be auto-created on save
            </span>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={busy || !processedBy.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Save Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCell({
  label,
  value,
  mono,
  tone,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "blue" | "violet";
  className?: string;
}) {
  const valueClass =
    tone === "blue"
      ? "text-blue-700 font-bold text-lg"
      : tone === "violet"
        ? "text-violet-700 font-bold text-lg"
        : "text-foreground font-semibold text-xs";
  return (
    <div className={cn("rounded-md border border-slate-300 bg-slate-200/80 px-2.5 py-2", className)}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(mono ? "font-mono" : "", valueClass, "truncate")} title={value}>
        {value || "—"}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  step?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function IconInput({
  icon,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        {icon}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
        checked ? "bg-blue-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function DropZone({
  label,
  icon,
  files,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  files: File[];
  onChange: (f: File[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  function add(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    onChange([...files, ...arr]);
  }

  function remove(i: number) {
    onChange(files.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon} {label}
      </Label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-4 text-center transition",
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
        )}
      >
        <Upload className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-[11px] text-muted-foreground">
          Drag &amp; drop or click to upload
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
      </div>
      {files.length > 0 ? (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
            >
              <span className="truncate" title={f.name}>
                {f.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                className="ml-2 flex size-4 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
