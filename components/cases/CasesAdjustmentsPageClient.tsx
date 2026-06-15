"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AdjType, CaseStatus, ReconType } from "@prisma/client";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import type {
  AdjustmentFilters,
  CaseFilters,
  CaseTrackerRow,
} from "@/actions/cases";
import type { ManualAdjustmentRow } from "@/lib/manual-adjustment-serialize";
import {
  deleteAdjustment,
  deleteCase,
  getAdjustments,
  getCases,
} from "@/actions/cases";
import { AdjustmentFormModal } from "@/components/cases/AdjustmentFormModal";
import { AdjustmentsTable } from "@/components/cases/AdjustmentsTable";
import { CaseFormModal } from "@/components/cases/CaseFormModal";
import { CasesTable } from "@/components/cases/CasesTable";
import { HeaderActions } from "@/components/layout/header-actions";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/cases-ui";
import { cn } from "@/lib/utils";

const ALL = "__all__";

const ADJ_TYPE_LABELS: Record<AdjType, string> = {
  QUANTITY: "Quantity",
  FINANCIAL: "Financial",
  STATUS: "Status",
  RETURN_NEW_MSKU: "Return → New MSKU",
  LOST: "Lost",
  OTHER: "Other",
};

type PageTab = "cases" | "adjustments";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** CSV-quote a cell: wrap in quotes and double any inner quotes. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((line) => line.map((c) => csvCell(c)).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type CasesAdjustmentsPageClientProps = {
  initialCases: CaseTrackerRow[];
  initialAdjustments: ManualAdjustmentRow[];
};

export function CasesAdjustmentsPageClient({
  initialCases,
  initialAdjustments,
}: CasesAdjustmentsPageClientProps) {
  const router = useRouter();

  const [tab, setTab] = React.useState<PageTab>("cases");

  const [caseFilters, setCaseFilters] = React.useState<CaseFilters>({});
  const [adjFilters, setAdjFilters] = React.useState<AdjustmentFilters>({});

  const debouncedCaseFilters = useDebouncedValue(caseFilters, 320);
  const debouncedAdjFilters = useDebouncedValue(adjFilters, 320);

  const [cases, setCases] = React.useState(initialCases);
  const [adjustments, setAdjustments] = React.useState(initialAdjustments);

  React.useEffect(() => {
    setCases(initialCases);
  }, [initialCases]);

  React.useEffect(() => {
    setAdjustments(initialAdjustments);
  }, [initialAdjustments]);

  const [casesLoading, setCasesLoading] = React.useState(false);
  const [adjLoading, setAdjLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setCasesLoading(true);
    getCases(debouncedCaseFilters).then((rows) => {
      if (!cancelled) {
        setCases(rows);
        setCasesLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedCaseFilters]);

  React.useEffect(() => {
    let cancelled = false;
    setAdjLoading(true);
    getAdjustments(debouncedAdjFilters).then((rows) => {
      if (!cancelled) {
        setAdjustments(rows);
        setAdjLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedAdjFilters]);

  const refresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const [caseModalOpen, setCaseModalOpen] = React.useState(false);
  const [caseModalMode, setCaseModalMode] = React.useState<"create" | "edit">(
    "create",
  );
  const [selectedCase, setSelectedCase] = React.useState<CaseTrackerRow | null>(
    null,
  );

  const [adjModalOpen, setAdjModalOpen] = React.useState(false);
  const [adjModalMode, setAdjModalMode] = React.useState<"create" | "edit">(
    "create",
  );
  const [selectedAdj, setSelectedAdj] =
    React.useState<ManualAdjustmentRow | null>(null);

  function openNewCase() {
    setSelectedCase(null);
    setCaseModalMode("create");
    setCaseModalOpen(true);
  }

  function openEditCase(row: CaseTrackerRow) {
    setSelectedCase(row);
    setCaseModalMode("edit");
    setCaseModalOpen(true);
  }

  async function handleDeleteCase(row: CaseTrackerRow) {
    if (
      !window.confirm(
        `Soft-delete this case for MSKU «${row.msku ?? row.id}»?`,
      )
    ) {
      return;
    }
    const res = await deleteCase(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Case removed.");
    refresh();
    setCases((prev) => prev.filter((c) => c.id !== row.id));
  }

  function openNewAdjustment() {
    setSelectedAdj(null);
    setAdjModalMode("create");
    setAdjModalOpen(true);
  }

  function openEditAdjustment(row: ManualAdjustmentRow) {
    setSelectedAdj(row);
    setAdjModalMode("edit");
    setAdjModalOpen(true);
  }

  async function handleDeleteAdjustment(row: ManualAdjustmentRow) {
    if (
      !window.confirm(
        `Soft-delete this adjustment for MSKU «${row.msku ?? row.id}»?`,
      )
    ) {
      return;
    }
    const res = await deleteAdjustment(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Adjustment removed.");
    refresh();
    setAdjustments((prev) => prev.filter((a) => a.id !== row.id));
  }

  function onCaseSaved() {
    refresh();
    getCases(debouncedCaseFilters).then(setCases);
  }

  function onAdjSaved() {
    refresh();
    getAdjustments(debouncedAdjFilters).then(setAdjustments);
  }

  const totalCases = cases.length;
  const openCases = React.useMemo(
    () =>
      cases.filter(
        (c) =>
          c.status === CaseStatus.OPEN || c.status === CaseStatus.IN_PROGRESS,
      ).length,
    [cases],
  );
  const totalAdjustments = adjustments.length;
  const netAdjQty = React.useMemo(
    () =>
      adjustments.reduce((sum, a) => sum + Number(a.qtyAdjusted ?? 0), 0),
    [adjustments],
  );

  // ── CSV export (active tab only) ─────────────────────────────
  function exportCasesCsv() {
    const header = [
      "MSKU",
      "ASIN",
      "FNSKU",
      "Title",
      "Recon Type",
      "Shipment ID",
      "Order ID",
      "Case ID",
      "Case URL",
      "Attachment URL",
      "Reimbursement ID",
      "Case Reason",
      "Units Claimed",
      "Units Approved",
      "Amount Claimed",
      "Amount Approved",
      "Currency",
      "Status",
      "Issue Date",
      "Raised Date",
      "Resolved Date",
      "Store",
      "Notes",
    ];
    const body = cases.map((c) => [
      c.msku ?? "",
      c.asin ?? "",
      c.fnsku ?? "",
      c.title ?? "",
      formatEnumLabel(c.reconType),
      c.shipmentId ?? "",
      c.orderId ?? "",
      c.referenceId ?? "",
      c.caseUrl ?? "",
      c.attachmentUrl ?? "",
      c.reimbursementId ?? "",
      c.caseReason ?? "",
      c.unitsClaimed,
      c.unitsApproved,
      c.amountClaimed ?? "",
      c.amountApproved ?? "",
      c.currency ?? "",
      formatEnumLabel(c.status),
      isoDate(c.issueDate),
      isoDate(c.raisedDate),
      isoDate(c.resolvedDate),
      c.store ?? "",
      c.notes ?? "",
    ]);
    downloadCsv([header, ...body], "cases.csv");
    toast.success("✅ Cases exported");
  }

  function exportAdjustmentsCsv() {
    const header = [
      "MSKU",
      "Original MSKU",
      "ASIN",
      "FNSKU",
      "Received As FNSKU",
      "Title",
      "Recon Type",
      "Adj Type",
      "Shipment ID",
      "Order ID",
      "Reimbursement ID",
      "Qty Before",
      "Qty Adjusted",
      "Qty After",
      "Amount",
      "Reason",
      "Verified By",
      "Source Doc",
      "Adj Date",
      "Store",
      "Notes",
    ];
    const body = adjustments.map((a) => [
      a.msku ?? "",
      a.originalMsku ?? "",
      a.asin ?? "",
      a.fnsku ?? "",
      a.receivedAsFnsku ?? "",
      a.title ?? "",
      formatEnumLabel(a.reconType),
      a.adjType === "RETURN_NEW_MSKU"
        ? "Return → New MSKU"
        : formatEnumLabel(a.adjType),
      a.shipmentId ?? "",
      a.orderId ?? "",
      a.referenceId ?? "",
      a.qtyBefore,
      a.qtyAdjusted,
      a.qtyAfter,
      a.amount ?? "",
      a.reason ?? "",
      a.verifiedBy ?? "",
      a.sourceDoc ?? "",
      isoDate(a.adjDate),
      a.store ?? "",
      a.notes ?? "",
    ]);
    downloadCsv([header, ...body], "manual_adjustments.csv");
    toast.success("✅ Adjustments exported");
  }

  function exportActiveCsv() {
    if (tab === "cases") exportCasesCsv();
    else exportAdjustmentsCsv();
  }

  const caseFiltersActive = Boolean(
    caseFilters.status ||
      caseFilters.reconType ||
      caseFilters.store?.trim() ||
      caseFilters.search?.trim(),
  );
  const adjFiltersActive = Boolean(
    adjFilters.reconType ||
      adjFilters.adjType ||
      adjFilters.store?.trim() ||
      adjFilters.search?.trim(),
  );

  return (
    <main className="w-full flex-1 space-y-6 p-4 md:p-6">
      <HeaderActions>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition",
              tab === "cases"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setTab("cases")}
          >
            Cases
            <Badge variant="secondary" className="font-mono text-[10px]">
              {cases.length}
            </Badge>
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition",
              tab === "adjustments"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setTab("adjustments")}
          >
            Adjustments
            <Badge variant="secondary" className="font-mono text-[10px]">
              {adjustments.length}
            </Badge>
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={exportActiveCsv}>
          ⬇ Export CSV
        </Button>
      </HeaderActions>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Total Cases"
          value={totalCases.toLocaleString()}
          accent="blue"
        />
        <SummaryCard
          label="Open Cases"
          value={openCases.toLocaleString()}
          accent="yellow"
        />
        <SummaryCard
          label="Total Adjustments"
          value={totalAdjustments.toLocaleString()}
          accent="purple"
        />
        <SummaryCard
          label="Net Adj Qty"
          value={netAdjQty.toLocaleString()}
          accent="teal"
        />
      </div>

      {tab === "cases" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Status
              </span>
              <Select
                value={caseFilters.status || ALL}
                onValueChange={(v) =>
                  setCaseFilters((f) => ({
                    ...f,
                    status: v === ALL ? "" : (v as CaseStatus),
                  }))
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {Object.values(CaseStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Recon type
              </span>
              <Select
                value={caseFilters.reconType || ALL}
                onValueChange={(v) =>
                  setCaseFilters((f) => ({
                    ...f,
                    reconType: v === ALL ? "" : (v as ReconType),
                  }))
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {Object.values(ReconType).map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-[160px] flex-1 gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Store
              </span>
              <Input
                placeholder="Contains…"
                value={caseFilters.store ?? ""}
                onChange={(e) =>
                  setCaseFilters((f) => ({ ...f, store: e.target.value }))
                }
              />
            </div>

            <div className="grid min-w-[200px] flex-[2] gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Search MSKU / ASIN / FNSKU
              </span>
              <Input
                placeholder="Server-side search…"
                value={caseFilters.search ?? ""}
                onChange={(e) =>
                  setCaseFilters((f) => ({ ...f, search: e.target.value }))
                }
              />
            </div>

            <Button type="button" className="gap-1.5" onClick={openNewCase}>
              <Plus className="size-4" />
              New case
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={!caseFiltersActive}
              onClick={() => setCaseFilters({})}
            >
              <X className="size-4" />
              Clear
            </Button>
          </div>

          {casesLoading ? (
            <p className="text-sm text-muted-foreground">Loading cases…</p>
          ) : null}

          <CasesTable
            data={cases}
            onEdit={openEditCase}
            onDelete={handleDeleteCase}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Recon type
              </span>
              <Select
                value={adjFilters.reconType || ALL}
                onValueChange={(v) =>
                  setAdjFilters((f) => ({
                    ...f,
                    reconType: v === ALL ? "" : (v as ReconType),
                  }))
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {Object.values(ReconType).map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Adj type
              </span>
              <Select
                value={adjFilters.adjType || ALL}
                onValueChange={(v) =>
                  setAdjFilters((f) => ({
                    ...f,
                    adjType: v === ALL ? "" : (v as AdjType),
                  }))
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All adj types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All adj types</SelectItem>
                  {Object.values(AdjType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ADJ_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-[160px] flex-1 gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Store
              </span>
              <Input
                placeholder="Contains…"
                value={adjFilters.store ?? ""}
                onChange={(e) =>
                  setAdjFilters((f) => ({ ...f, store: e.target.value }))
                }
              />
            </div>

            <div className="grid min-w-[200px] flex-[2] gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Search MSKU / ASIN / FNSKU
              </span>
              <Input
                placeholder="Server-side search…"
                value={adjFilters.search ?? ""}
                onChange={(e) =>
                  setAdjFilters((f) => ({ ...f, search: e.target.value }))
                }
              />
            </div>

            <Button
              type="button"
              className="gap-1.5"
              onClick={openNewAdjustment}
            >
              <Plus className="size-4" />
              New adjustment
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={!adjFiltersActive}
              onClick={() => setAdjFilters({})}
            >
              <X className="size-4" />
              Clear
            </Button>
          </div>

          {adjLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading adjustments…
            </p>
          ) : null}

          <AdjustmentsTable
            data={adjustments}
            onEdit={openEditAdjustment}
            onDelete={handleDeleteAdjustment}
          />
        </div>
      )}

      <CaseFormModal
        open={caseModalOpen}
        onOpenChange={setCaseModalOpen}
        mode={caseModalMode}
        caseRow={selectedCase}
        onSaved={onCaseSaved}
      />

      <AdjustmentFormModal
        open={adjModalOpen}
        onOpenChange={setAdjModalOpen}
        mode={adjModalMode}
        adjustment={selectedAdj}
        onSaved={onAdjSaved}
      />
    </main>
  );
}
