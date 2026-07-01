"use client";

import * as React from "react";
import { Download, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  SETTLEMENT_ACCOUNT_TYPE_LABELS,
  SETTLEMENT_ACCOUNT_TYPES,
  SETTLEMENT_STORES,
  type ReportTypeValue,
  type SettlementAccountType,
  type SettlementStore,
  type UploadFileResult,
  uploadResultDescription,
} from "@/lib/upload-report-types";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ACCEPT =
  ".csv,.tsv,.txt,.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ResultMsg =
  | { kind: "ok"; text: string }
  | { kind: "warn"; text: string }
  | { kind: "err"; text: string }
  | null;

type PerFileResult = {
  name: string;
  size: number;
  status: "pending" | "uploading" | "ok" | "error";
  message: string | null;
};

type UploadZoneProps = {
  selectedType: ReportTypeValue;
  title: string;
  subtitle: string;
  templateFile: string;
  onUploaded: () => void;
  onPendingChange?: (pending: boolean) => void;
};

export function UploadZone({
  selectedType,
  title,
  subtitle,
  templateFile,
  onUploaded,
  onPendingChange,
}: UploadZoneProps) {
  const [isPending, startTransition] = React.useTransition();
  useTrackPending(isPending);

  React.useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [showProgress, setShowProgress] = React.useState(false);
  const [result, setResult] = React.useState<ResultMsg>(null);
  const [multiResults, setMultiResults] = React.useState<PerFileResult[]>([]);
  const [multiProgress, setMultiProgress] = React.useState<
    { current: number; total: number } | null
  >(null);
  const [accountType, setAccountType] = React.useState<"" | SettlementAccountType>(
    "",
  );
  const [store, setStore] = React.useState<"" | SettlementStore>("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const progressTimer = React.useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const isShipped = selectedType === "shipped_to_fba";

  React.useEffect(() => {
    setResult(null);
    setFiles([]);
    setMultiResults([]);
    setMultiProgress(null);
    setShowProgress(false);
    setProgress(0);
    setAccountType("");
    setStore("");
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [selectedType]);

  React.useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const pickFiles = React.useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const incoming = Array.from(list);
      if (selectedType === "shipped_to_fba") {
        setFiles((prev) => {
          const seen = new Set(prev.map((f) => `${f.name}::${f.size}`));
          const merged = [...prev];
          for (const f of incoming) {
            const key = `${f.name}::${f.size}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(f);
          }
          return merged;
        });
        setMultiResults([]);
        setResult(null);
      } else {
        setFiles([incoming[0]]);
        setResult(null);
      }
    },
    [selectedType],
  );

  const removeFileAt = React.useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    pickFiles(e.dataTransfer.files);
  };

  const stopProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const isSettlement = selectedType === "settlement_report";
  const settlementMetaReady = !isSettlement || (accountType && store);

  const handleUpload = () => {
    if (files.length === 0) {
      toast.error("Choose a file", {
        description: "Drop a CSV, TSV, or Excel file, or click to browse.",
      });
      return;
    }
    if (isSettlement && (!accountType || !store)) {
      toast.error("Pick Account Type and Store", {
        description: "Settlement Report uploads require both selectors.",
      });
      return;
    }

    setResult(null);
    setShowProgress(true);
    setProgress(0);

    if (isShipped) {
      const list = files;
      const initial: PerFileResult[] = list.map((f) => ({
        name: f.name,
        size: f.size,
        status: "pending",
        message: null,
      }));
      setMultiResults(initial);
      setMultiProgress({ current: 0, total: list.length });

      startTransition(async () => {
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          setMultiProgress({ current: i + 1, total: list.length });
          setMultiResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "uploading" } : r,
            ),
          );
          setProgress(Math.round((i / list.length) * 90));

          const fd = new FormData();
          fd.set("report_type", selectedType);
          fd.set("file", f);

          try {
            const httpRes = await fetch("/api/uploads", {
              method: "POST",
              body: fd,
            });
            const res = (await httpRes.json()) as UploadFileResult;
            if (res.ok) {
              const { description } = uploadResultDescription(
                res.rowsInserted,
                res.rowsSkipped,
                res.totalInFile,
                res.filename,
              );
              setMultiResults((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? { ...r, status: "ok", message: description }
                    : r,
                ),
              );
            } else {
              setMultiResults((prev) =>
                prev.map((r, idx) =>
                  idx === i
                    ? {
                        ...r,
                        status: "error",
                        message: `❌ Error: ${res.error}`,
                      }
                    : r,
                ),
              );
            }
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Something went wrong.";
            setMultiResults((prev) =>
              prev.map((r, idx) =>
                idx === i
                  ? { ...r, status: "error", message: `❌ Error: ${msg}` }
                  : r,
              ),
            );
          }
        }
        setProgress(100);
        setMultiProgress(null);
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        onUploaded();
        setTimeout(() => {
          setShowProgress(false);
          setProgress(0);
        }, 1500);
      });
      return;
    }

    stopProgressTimer();
    progressTimer.current = setInterval(() => {
      setProgress((p) => Math.min(p + 15, 85));
    }, 200);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("report_type", selectedType);
      fd.set("file", files[0]);
      if (isSettlement) {
        fd.set("account_type", accountType);
        fd.set("store", store);
      }

      try {
        const httpRes = await fetch("/api/uploads", {
          method: "POST",
          body: fd,
        });
        const res = (await httpRes.json()) as UploadFileResult;
        stopProgressTimer();
        setProgress(100);

        if (res.ok) {
          const { variant, description } = uploadResultDescription(
            res.rowsInserted,
            res.rowsSkipped,
            res.totalInFile,
            res.filename,
          );
          setResult({
            kind: variant === "warning" ? "warn" : "ok",
            text: description,
          });
          setFiles([]);
          if (inputRef.current) inputRef.current.value = "";
          onUploaded();
        } else {
          setResult({ kind: "err", text: `❌ Error: ${res.error}` });
        }
      } catch (err) {
        stopProgressTimer();
        setProgress(100);
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setResult({ kind: "err", text: `❌ Error: ${msg}` });
      } finally {
        setTimeout(() => {
          setShowProgress(false);
          setProgress(0);
        }, 1500);
      }
    });
  };

  const disabled = isPending;
  const templateHref = templateFile
    ? `/upload-templates/${templateFile}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        {templateHref ? (
          <Button variant="outline" size="sm" asChild>
            <a href={templateHref} download={templateFile}>
              <Download className="mr-1.5 size-3.5" aria-hidden />
              Template
            </a>
          </Button>
        ) : null}
      </div>

      <div className="p-5">
        {isSettlement ? (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Account Type <span className="text-destructive">*</span>
              </label>
              <Select
                value={accountType || undefined}
                onValueChange={(v) =>
                  setAccountType(v as SettlementAccountType)
                }
                disabled={isPending}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account type…" />
                </SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SETTLEMENT_ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Store <span className="text-destructive">*</span>
              </label>
              <Select
                value={store || undefined}
                onValueChange={(v) => setStore(v as SettlementStore)}
                disabled={isPending}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select store…" />
                </SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_STORES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          multiple={isShipped}
          accept={ACCEPT}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => pickFiles(e.target.files)}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-muted-foreground/30 bg-muted/30 hover:border-primary hover:bg-primary/10",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <UploadCloud
            className="mb-2.5 size-8 text-muted-foreground opacity-60"
            aria-hidden
          />
          <p className="text-sm font-bold text-foreground">
            Drop file here or click to browse
          </p>
          <p className="mb-3.5 mt-1 text-xs text-muted-foreground">
            CSV, TSV, TXT, XLSX, XLS · max 10 MB
          </p>
          <span className="inline-block rounded-md border border-border bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground">
            CSV / TSV / XLSX / TXT
          </span>
          {!isShipped && files[0] ? (
            <p className="mt-4 truncate text-xs text-primary">
              Selected: <span className="font-mono">{files[0].name}</span>
            </p>
          ) : null}
          {isShipped && files.length > 0 ? (
            <p className="mt-4 text-xs text-primary">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </p>
          ) : null}
        </button>

        {isShipped && files.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-xs">
            {files.map((f, i) => (
              <li
                key={`${f.name}::${f.size}::${i}`}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-foreground">
                    {f.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatBytes(f.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFileAt(i)}
                  disabled={disabled}
                  aria-label={`Remove ${f.name}`}
                  className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={disabled || files.length === 0 || !settlementMetaReady}
            className="min-w-[120px]"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Uploading…
              </>
            ) : (
              "Upload"
            )}
          </Button>
          {files.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setFiles([]);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              {isShipped && files.length > 1 ? "Clear all" : "Clear file"}
            </Button>
          ) : null}
        </div>

        {showProgress ? (
          <div className="mt-3.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  (
                    isShipped
                      ? multiResults.some((r) => r.status === "error")
                      : result?.kind === "err"
                  )
                    ? "bg-destructive"
                    : "bg-primary",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 text-center text-[11px] text-muted-foreground">
              {isPending
                ? isShipped && multiProgress
                  ? `Uploading ${multiProgress.current} of ${multiProgress.total}…`
                  : `Uploading ${files[0]?.name ?? ""}…`
                : "Done!"}
            </div>
          </div>
        ) : null}

        {!isShipped && result ? (
          <div
            className={cn(
              "mt-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold",
              result.kind === "ok" &&
                "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
              result.kind === "warn" &&
                "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
              result.kind === "err" &&
                "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
            )}
          >
            {result.text}
          </div>
        ) : null}

        {isShipped && multiResults.length > 0 ? (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-xs">
            {multiResults.map((r, i) => (
              <li
                key={`${r.name}::${r.size}::${i}`}
                className="flex items-start justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono font-semibold text-foreground">
                    {r.name}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-[11px]",
                      r.status === "ok" &&
                        "text-emerald-700 dark:text-emerald-300",
                      r.status === "error" &&
                        "text-red-700 dark:text-red-300",
                      (r.status === "pending" || r.status === "uploading") &&
                        "text-muted-foreground",
                    )}
                  >
                    {r.status === "pending" && "Pending…"}
                    {r.status === "uploading" && "Uploading…"}
                    {(r.status === "ok" || r.status === "error") &&
                      (r.message ?? "")}
                  </div>
                </div>
                <span className="text-sm leading-none">
                  {r.status === "ok"
                    ? "✅"
                    : r.status === "error"
                      ? "❌"
                      : r.status === "uploading"
                        ? "⏳"
                        : "○"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {selectedType === "shipped_to_fba" ? (
          <CostWorksheet onUploaded={onUploaded} />
        ) : null}
      </div>
    </div>
  );
}

type CostWorksheetProps = {
  onUploaded: () => void;
};

type ShipmentRow = {
  shipment_id: string;
  row_count: number;
  total_qty: number;
  last_ship_date: string | null;
  cost_status: "complete" | "partial" | "pending";
  rows_with_cost: number;
  rows_without_cost: number;
};

function formatShipDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CostWorksheet({ onUploaded }: CostWorksheetProps) {
  const [shipments, setShipments] = React.useState<ShipmentRow[]>([]);
  const [selectedShipments, setSelectedShipments] = React.useState<Set<string>>(
    () => new Set<string>(),
  );
  const lastClickedRef = React.useRef<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<"pending" | "complete">(
    "pending",
  );
  const [loadingIds, setLoadingIds] = React.useState(false);
  useTrackPending(loadingIds);
  const [costFile, setCostFile] = React.useState<File | null>(null);
  const [costDragging, setCostDragging] = React.useState(false);
  const [costResult, setCostResult] = React.useState<ResultMsg>(null);
  const [costPending, startCostTransition] = React.useTransition();
  const [costProgress, setCostProgress] = React.useState(0);
  const [showCostProgress, setShowCostProgress] = React.useState(false);
  const costInputRef = React.useRef<HTMLInputElement>(null);
  const costProgressTimer = React.useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  React.useEffect(() => {
    return () => {
      if (costProgressTimer.current) clearInterval(costProgressTimer.current);
    };
  }, []);

  const stopCostProgressTimer = () => {
    if (costProgressTimer.current) {
      clearInterval(costProgressTimer.current);
      costProgressTimer.current = null;
    }
  };

  const fetchShipments = React.useCallback(async () => {
    setLoadingIds(true);
    try {
      const res = await fetch("/api/shipped-to-fba/shipment-ids");
      const d = (await res.json()) as { rows?: ShipmentRow[] };
      setShipments(d.rows ?? []);
    } catch {
      setShipments([]);
    } finally {
      setLoadingIds(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchShipments();
  }, [fetchShipments]);

  const pendingList = React.useMemo(
    () =>
      shipments.filter(
        (s) => s.cost_status === "pending" || s.cost_status === "partial",
      ),
    [shipments],
  );
  const completeList = React.useMemo(
    () => shipments.filter((s) => s.cost_status === "complete"),
    [shipments],
  );

  const visibleList = activeTab === "pending" ? pendingList : completeList;

  React.useEffect(() => {
    setSelectedShipments((prev) => {
      const visibleIds = new Set(visibleList.map((s) => s.shipment_id));
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
    lastClickedRef.current = null;
  }, [activeTab, visibleList]);

  const toggleShipment = React.useCallback(
    (id: string, e: React.MouseEvent) => {
      setSelectedShipments((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && lastClickedRef.current) {
          const ids = visibleList.map((s) => s.shipment_id);
          const a = ids.indexOf(lastClickedRef.current);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            const shouldSelect = !prev.has(id);
            for (let i = lo; i <= hi; i++) {
              if (shouldSelect) next.add(ids[i]);
              else next.delete(ids[i]);
            }
            lastClickedRef.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastClickedRef.current = id;
        return next;
      });
    },
    [visibleList],
  );

  const allVisibleSelected =
    visibleList.length > 0 &&
    visibleList.every((s) => selectedShipments.has(s.shipment_id));

  const toggleSelectAllVisible = React.useCallback(() => {
    setSelectedShipments((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const s of visibleList) next.delete(s.shipment_id);
        return next;
      }
      const next = new Set(prev);
      for (const s of visibleList) next.add(s.shipment_id);
      return next;
    });
  }, [allVisibleSelected, visibleList]);

  const clearSelection = React.useCallback(() => {
    setSelectedShipments(new Set());
    lastClickedRef.current = null;
  }, []);

  const handleGetSheet = () => {
    if (selectedShipments.size === 0) {
      toast.error("Pick a shipment", {
        description: "Select one or more shipment IDs first.",
      });
      return;
    }
    const ids = Array.from(selectedShipments);
    const url = `/api/shipped-to-fba/cost-export?shipment_ids=${encodeURIComponent(ids.join(","))}`;
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const pickCostFile = (list: FileList | null) => {
    const next = list?.[0];
    if (!next) return;
    setCostFile(next);
    setCostResult(null);
  };

  const handleCostUpload = () => {
    if (!costFile) {
      toast.error("Choose a cost file", {
        description: "Drop the filled cost worksheet CSV.",
      });
      return;
    }
    setCostResult(null);
    setShowCostProgress(true);
    setCostProgress(0);
    stopCostProgressTimer();
    costProgressTimer.current = setInterval(() => {
      setCostProgress((p) => Math.min(p + 15, 85));
    }, 200);
    startCostTransition(async () => {
      const fd = new FormData();
      fd.set("file", costFile);
      try {
        const res = await fetch("/api/shipped-to-fba/cost-upload", {
          method: "POST",
          body: fd,
        });
        stopCostProgressTimer();
        setCostProgress(100);
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          rows_updated?: number;
          rows_skipped?: number;
          warnings?: string[];
        };
        if (res.ok && data.success) {
          const skipNote =
            data.rows_skipped && data.rows_skipped > 0
              ? ` · ${data.rows_skipped.toLocaleString()} skipped`
              : "";
          setCostResult({
            kind: data.rows_skipped && data.rows_skipped > 0 ? "warn" : "ok",
            text: `✅ ${data.rows_updated?.toLocaleString() ?? 0} rows updated${skipNote}`,
          });
          if (data.warnings?.length) {
            toast.warning("Some rows skipped", {
              description: data.warnings.slice(0, 3).join("\n"),
            });
          }
          setCostFile(null);
          if (costInputRef.current) costInputRef.current.value = "";
          onUploaded();
          void fetchShipments();
        } else {
          setCostResult({
            kind: "err",
            text: `❌ Error: ${data.error ?? "Upload failed"}`,
          });
        }
      } catch (err) {
        stopCostProgressTimer();
        setCostProgress(100);
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setCostResult({ kind: "err", text: `❌ Error: ${msg}` });
      } finally {
        setTimeout(() => {
          setShowCostProgress(false);
          setCostProgress(0);
        }, 1500);
      }
    });
  };

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 text-sm font-bold text-foreground">
        Cost Worksheet (Shipped)
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <TabButton
          active={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
          tone="warn"
          count={pendingList.length}
        >
          Open / Pending
        </TabButton>
        <TabButton
          active={activeTab === "complete"}
          onClick={() => setActiveTab("complete")}
          tone="ok"
          count={completeList.length}
        >
          Cost Done
        </TabButton>
      </div>

      {visibleList.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            className="rounded border border-border bg-card px-2 py-1 font-semibold text-muted-foreground hover:border-primary hover:text-primary"
          >
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </button>
          {selectedShipments.size > 0 ? (
            <>
              <span className="text-muted-foreground">
                <span className="font-bold text-foreground">
                  {selectedShipments.size}
                </span>{" "}
                selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-muted-foreground">
              Click rows to select · Shift-click for range
            </span>
          )}
        </div>
      ) : null}

      <ShipmentList
        loading={loadingIds}
        rows={visibleList}
        activeTab={activeTab}
        selectedShipments={selectedShipments}
        onToggle={toggleShipment}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleGetSheet}
          disabled={selectedShipments.size === 0}
        >
          <Download className="mr-1.5 size-3.5" aria-hidden />
          Get Sheet
          {selectedShipments.size > 1 ? ` (${selectedShipments.size})` : ""}
        </Button>
      </div>

      <input
        ref={costInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => pickCostFile(e.target.files)}
      />

      <button
        type="button"
        disabled={costPending}
        onClick={() => costInputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCostDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCostDragging(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setCostDragging(false);
          pickCostFile(e.dataTransfer.files);
        }}
        className={cn(
          "mt-3 flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          costDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/30 bg-card hover:border-primary hover:bg-primary/5",
          costPending && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud
          className="mb-1.5 size-6 text-muted-foreground opacity-60"
          aria-hidden
        />
        <p className="text-xs font-bold text-foreground">
          Drop filled cost CSV here or click to browse
        </p>
        {costFile ? (
          <p className="mt-2 truncate text-xs text-primary">
            Selected: <span className="font-mono">{costFile.name}</span>
          </p>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleCostUpload}
          disabled={costPending || !costFile}
          size="sm"
        >
          {costPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Uploading…
            </>
          ) : (
            "Upload Cost Sheet"
          )}
        </Button>
        {costFile ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={costPending}
            onClick={() => {
              setCostFile(null);
              if (costInputRef.current) costInputRef.current.value = "";
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {showCostProgress ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                costResult?.kind === "err" ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${costProgress}%` }}
            />
          </div>
          <div className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {costPending ? `Uploading ${costFile?.name ?? ""}…` : "Done!"}
          </div>
        </div>
      ) : null}

      {costResult ? (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-xs font-semibold",
            costResult.kind === "ok" &&
              "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
            costResult.kind === "warn" &&
              "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
            costResult.kind === "err" &&
              "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
          )}
        >
          {costResult.text}
        </div>
      ) : null}
    </div>
  );
}

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  tone: "warn" | "ok";
  count: number;
  children: React.ReactNode;
};

function TabButton({ active, onClick, tone, count, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      {children}
      <span
        className={cn(
          "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
          active
            ? "bg-white/20 text-primary-foreground"
            : tone === "warn"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        )}
      >
        {count}
      </span>
    </button>
  );
}

type ShipmentListProps = {
  loading: boolean;
  rows: ShipmentRow[];
  activeTab: "pending" | "complete";
  selectedShipments: Set<string>;
  onToggle: (id: string, e: React.MouseEvent) => void;
};

function ShipmentList({
  loading,
  rows,
  activeTab,
  selectedShipments,
  onToggle,
}: ShipmentListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card px-4 py-10 text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        Loading shipments…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        {activeTab === "pending"
          ? "✅ All shipments have cost data uploaded"
          : "📋 No shipments with cost data yet. Upload a cost sheet to get started."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[24px_1fr_70px_70px_90px_28px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <div />
        <div>Shipment ID</div>
        <div className="text-right">SKUs</div>
        <div className="text-right">Qty</div>
        <div className="text-right">Ship Date</div>
        <div />
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {rows.map((r) => {
          const isSelected = selectedShipments.has(r.shipment_id);
          const accent =
            r.cost_status === "complete"
              ? "border-l-emerald-500"
              : r.cost_status === "partial"
                ? "border-l-amber-500"
                : "border-l-slate-300 dark:border-l-slate-600";
          return (
            <button
              key={r.shipment_id}
              type="button"
              onClick={(e) => onToggle(r.shipment_id, e)}
              aria-pressed={isSelected}
              className={cn(
                "grid w-full grid-cols-[24px_1fr_70px_70px_90px_28px] items-center gap-2 border-l-[3px] border-b border-border px-3 py-2 text-left text-xs transition-colors last:border-b-0",
                accent,
                isSelected
                  ? "bg-primary/10 ring-1 ring-inset ring-primary"
                  : "hover:bg-primary/5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded border text-[10px] font-bold transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40 bg-card",
                )}
              >
                {isSelected ? "✓" : ""}
              </span>
              <span className="truncate font-mono text-[11px] font-bold text-foreground">
                {r.shipment_id}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {r.row_count.toLocaleString()}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {r.total_qty.toLocaleString()}
              </span>
              <span className="text-right text-[11px] text-muted-foreground">
                {formatShipDate(r.last_ship_date)}
              </span>
              <span
                className="text-right text-sm leading-none"
                title={
                  r.cost_status === "complete"
                    ? "Cost complete"
                    : r.cost_status === "partial"
                      ? `Partial — ${r.rows_without_cost} of ${r.row_count} missing`
                      : "Pending"
                }
              >
                {r.cost_status === "complete"
                  ? "✅"
                  : r.cost_status === "partial"
                    ? "⚠️"
                    : "○"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
