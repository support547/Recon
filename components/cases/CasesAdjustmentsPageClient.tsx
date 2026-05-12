"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CaseStatus, ReconType } from "@prisma/client";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import type {
  AdjustmentFilters,
  CaseFilters,
  CaseTrackerRow,
  ManualAdjustmentRow,
} from "@/actions/cases";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALL = "__all__";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
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

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="border-b border-border pb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Cases & adjustments
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Track seller cases and manual inventory corrections. Filters query the
          database; tables add sorting, client filtering, and pagination.
        </p>
      </div>

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

      <Tabs defaultValue="cases" className="gap-6">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="cases" className="gap-2">
            Cases
            <Badge variant="secondary" className="font-mono text-[10px]">
              {cases.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="gap-2">
            Adjustments
            <Badge variant="secondary" className="font-mono text-[10px]">
              {adjustments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="space-y-4">
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
          </div>

          {casesLoading ? (
            <p className="text-sm text-muted-foreground">Loading cases…</p>
          ) : null}

          <CasesTable
            data={cases}
            onEdit={openEditCase}
            onDelete={handleDeleteCase}
          />
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-4">
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
        </TabsContent>
      </Tabs>

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
