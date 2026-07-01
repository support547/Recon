"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PermissionModule } from "@prisma/client";
import { Link2, Link2Off, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteBankTransaction,
  getBankReconciliationKpis,
  getBankTransactions,
  unmatchBankTransaction,
} from "@/actions/bank-reconciliation";
import type {
  BankDirectionFilter,
  BankMatchStatusFilter,
  BankReconciliationKpis,
  BankSourceCategoryFilter,
  BankTransactionFilters,
  BankTransactionRow,
} from "@/lib/bank/types";
import { useCanDelete } from "@/components/auth/permissions-context";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BankReconAddModal } from "./bank-recon-add-modal";
import { BankReconDetailModal } from "./bank-recon-detail-modal";
import { BankReconFormModal } from "./bank-recon-form-modal";
import { BankReconMatchModal } from "./bank-recon-match-modal";

function fmtUsd(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(v: Date | string | null | undefined): string {
  if (v == null) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function fmtCurrency(
  amount: string | number | null | undefined,
  currency: "USD" | "CAD" | null | undefined,
): string {
  if (amount == null) return "—";
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const symbol = currency === "CAD" ? "C$" : "$";
  return `${sign}${symbol}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const MATCH_STATUS_OPTIONS: Array<{
  key: BankMatchStatusFilter | "ALL";
  label: string;
  className: string;
}> = [
  { key: "ALL", label: "All", className: "border-slate-300 bg-white text-slate-700" },
  {
    key: "UNMATCHED",
    label: "Unmatched",
    className: "border-amber-300 bg-amber-100 text-amber-800",
  },
  {
    key: "MATCHED",
    label: "Matched",
    className: "border-emerald-300 bg-emerald-100 text-emerald-800",
  },
  {
    key: "DISCREPANCY",
    label: "Discrepancy",
    className: "border-red-300 bg-red-100 text-red-800",
  },
];

const CATEGORY_OPTIONS: Array<{
  key: BankSourceCategoryFilter | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "USA_PAYOUT", label: "USA payout" },
  { key: "CA_PAYOUT", label: "CA payout" },
  { key: "MX_PAYOUT", label: "Mexico" },
  { key: "OTHER", label: "Other" },
];

const DIRECTION_OPTIONS: Array<{
  key: BankDirectionFilter | "ALL";
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "CREDIT", label: "Credits" },
  { key: "DEBIT", label: "Debits" },
];

function statusBadge(status: BankMatchStatusFilter): string {
  switch (status) {
    case "UNMATCHED":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "MATCHED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "DISCREPANCY":
      return "bg-red-100 text-red-800 border-red-200";
  }
}

function categoryBadge(cat: BankSourceCategoryFilter): {
  label: string;
  className: string;
} {
  switch (cat) {
    case "USA_PAYOUT":
      return {
        label: "USA",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      };
    case "CA_PAYOUT":
      return {
        label: "CA",
        className: "bg-purple-100 text-purple-800 border-purple-200",
      };
    case "MX_PAYOUT":
      return {
        label: "MX",
        className: "bg-orange-100 text-orange-800 border-orange-200",
      };
    default:
      return {
        label: "Other",
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type Props = {
  initialItems: BankTransactionRow[];
  initialKpis: BankReconciliationKpis;
};

export function BankReconClient({ initialItems, initialKpis }: Props) {
  const router = useRouter();

  const [filters, setFilters] = React.useState<BankTransactionFilters>({});
  const debouncedFilters = useDebouncedValue(filters, 320);

  const [items, setItems] = React.useState<BankTransactionRow[]>(initialItems);
  const [kpis, setKpis] = React.useState(initialKpis);
  const [loading, setLoading] = React.useState(false);
  useTrackPending(loading);

  const [statusFilter, setStatusFilter] = React.useState<
    BankMatchStatusFilter | "ALL"
  >("ALL");
  const [categoryFilter, setCategoryFilter] = React.useState<
    BankSourceCategoryFilter | "ALL"
  >("ALL");
  const [directionFilter, setDirectionFilter] = React.useState<
    BankDirectionFilter | "ALL"
  >("ALL");

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  React.useEffect(() => {
    setKpis(initialKpis);
  }, [initialKpis]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q: BankTransactionFilters = { ...debouncedFilters };
    if (statusFilter !== "ALL") q.matchStatus = statusFilter;
    if (categoryFilter !== "ALL") q.sourceCategory = categoryFilter;
    if (directionFilter !== "ALL") q.direction = directionFilter;
    Promise.all([
      getBankTransactions(q),
      getBankReconciliationKpis(),
    ]).then(([rows, k]) => {
      if (cancelled) return;
      setItems(rows);
      setKpis(k);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedFilters, statusFilter, categoryFilter, directionFilter]);

  const refresh = React.useCallback(() => {
    router.refresh();
    const q: BankTransactionFilters = { ...filters };
    if (statusFilter !== "ALL") q.matchStatus = statusFilter;
    if (categoryFilter !== "ALL") q.sourceCategory = categoryFilter;
    if (directionFilter !== "ALL") q.direction = directionFilter;
    Promise.all([
      getBankTransactions(q),
      getBankReconciliationKpis(),
    ]).then(([rows, k]) => {
      setItems(rows);
      setKpis(k);
    });
  }, [router, filters, statusFilter, categoryFilter, directionFilter]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<"create" | "edit">("create");
  const [formSelected, setFormSelected] =
    React.useState<BankTransactionRow | null>(null);

  const [matchOpen, setMatchOpen] = React.useState(false);
  const [matchSelected, setMatchSelected] =
    React.useState<BankTransactionRow | null>(null);

  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const canDelete = useCanDelete(PermissionModule.RECONCILIATION);

  function openCreate() {
    setFormSelected(null);
    setFormMode("create");
    setFormOpen(true);
  }
  function openEdit(row: BankTransactionRow) {
    setFormSelected(row);
    setFormMode("edit");
    setFormOpen(true);
  }
  function openMatch(row: BankTransactionRow) {
    setMatchSelected(row);
    setMatchOpen(true);
  }
  function openDetail(row: BankTransactionRow) {
    if (!row.matchedSettlementId) return;
    setDetailId(row.id);
    setDetailOpen(true);
  }

  async function handleUnmatch(row: BankTransactionRow) {
    if (!window.confirm(`Unmatch settlement ${row.matchedSettlementId}?`)) {
      return;
    }
    const res = await unmatchBankTransaction(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Unmatched.");
    refresh();
  }

  async function handleDelete(row: BankTransactionRow) {
    if (
      !window.confirm(
        `Soft-delete bank transaction from ${fmtDate(row.txnDate)}?`,
      )
    ) {
      return;
    }
    const res = await deleteBankTransaction(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Transaction removed.");
    refresh();
  }

  const [addOpen, setAddOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  function openAdd() {
    setAddOpen(true);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/bank-reconciliation/import", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as {
        error?: string;
        rowsInserted?: number;
        rowsSkipped?: number;
        totalInFile?: number;
        counts?: {
          usaPayout: number;
          caPayout: number;
          mxPayout: number;
          other: number;
          credits: number;
          debits: number;
        };
        warnings?: string[];
      };
      if (!res.ok) {
        toast.error(body.error ?? "Import failed.");
        return;
      }
      const c = body.counts;
      const detail = c
        ? ` · USA ${c.usaPayout}, CA ${c.caPayout}, MX ${c.mxPayout}, Other ${c.other} · ${c.credits} credits / ${c.debits} debits`
        : "";
      toast.success(
        `Imported ${body.rowsInserted ?? 0}, skipped ${body.rowsSkipped ?? 0} duplicates.${detail}`,
      );
      if (body.warnings && body.warnings.length) {
        for (const w of body.warnings.slice(0, 3)) {
          toast.warning(w);
        }
      }
      setAddOpen(false);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="border-b border-border pb-6">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Bank Transactions
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Import your USD bank statement, review Amazon deposits by store, and
            match each seller-payout deposit to its settlement. USA deposits
            match by amount (with tolerance); CAD deposits are linked manually
            and an implied FX rate is computed.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard
            label="Unmatched Payouts"
            value={kpis.unmatchedPayouts.count.toLocaleString()}
            sub={fmtUsd(kpis.unmatchedPayouts.sumUsd)}
            accent="orange"
          />
          <SummaryCard
            label="Matched"
            value={kpis.matched.count.toLocaleString()}
            sub={fmtUsd(kpis.matched.sumUsd)}
            accent="green"
          />
          <SummaryCard
            label="Discrepancies"
            value={kpis.discrepancies.count.toLocaleString()}
            sub={`|Δ| ${fmtUsd(kpis.discrepancies.sumAbsVarianceUsd)}`}
            accent="red"
          />
          <SummaryCard
            label="CA Payouts (USD)"
            value={kpis.caSummary.count.toLocaleString()}
            sub={fmtUsd(kpis.caSummary.sumUsdReceived)}
            accent="blue"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid min-w-[220px] flex-[2] gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Search description / settlement
            </span>
            <Input
              placeholder="AMAZON.C27… / settlement id / bank ref…"
              value={filters.search ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              From
            </span>
            <Input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateFrom: e.target.value || null,
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              To
            </span>
            <Input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateTo: e.target.value || null,
                }))
              }
            />
          </div>
          <Button type="button" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" />
            Add Transactions
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Status:
            </span>
            {MATCH_STATUS_OPTIONS.map((opt) => {
              const on = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                    on
                      ? opt.className
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Category:
            </span>
            {CATEGORY_OPTIONS.map((opt) => {
              const on = categoryFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCategoryFilter(opt.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                    on
                      ? "border-indigo-400 bg-indigo-100 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
            <span className="mx-2 h-4 w-px bg-slate-200" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Direction:
            </span>
            {DIRECTION_OPTIONS.map((opt) => {
              const on = directionFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDirectionFilter(opt.key)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                    on
                      ? "border-indigo-400 bg-indigo-100 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading transactions…
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1180px] caption-bottom text-sm">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Amount USD</th>
                  <th className="px-3 py-2 text-center">Category</th>
                  <th className="px-3 py-2 text-left">Settlement</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Var USD / FX</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No transactions. Import a bank statement or add one
                      manually.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const cat = categoryBadge(row.sourceCategory);
                    const isCredit = row.direction === "CREDIT";
                    const bankCcy = (row.detectedCurrency as "USD" | "CAD" | null) ?? null;
                    return (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          {fmtDate(row.txnDate)}
                        </td>
                        <td className="max-w-[260px] px-3 py-2">
                          <div className="truncate text-xs" title={row.description ?? ""}>
                            {row.description ?? "—"}
                          </div>
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums",
                            isCredit ? "text-emerald-700" : "text-red-700",
                          )}
                        >
                          {fmtUsd(row.amountUsd)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center">
                          <Badge variant="outline" className={cat.className}>
                            {cat.label}
                          </Badge>
                          {!row.matchable ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              non-matchable
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                          {row.matchedSettlementId ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.settlementExpected == null
                            ? "—"
                            : fmtCurrency(row.settlementExpected, bankCcy)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.sourceCategory === "CA_PAYOUT" && row.impliedFxRate
                            ? `FX ${Number(row.impliedFxRate).toFixed(4)}`
                            : row.varianceUsd
                              ? fmtUsd(row.varianceUsd)
                              : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center">
                          {row.matchable || row.matchStatus !== "UNMATCHED" ? (
                            <Badge
                              variant="outline"
                              className={statusBadge(row.matchStatus)}
                            >
                              {row.matchStatus}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {row.matchable && !row.matchedSettlementId ? (
                              <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-800 hover:border-emerald-500 hover:bg-emerald-100"
                                title="Select settlement"
                                onClick={() => openMatch(row)}
                              >
                                <Link2 className="size-3.5" aria-hidden />
                                Select
                              </button>
                            ) : null}
                            {row.matchedSettlementId ? (
                              <>
                                <button
                                  type="button"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-500"
                                  title="View settlement"
                                  onClick={() => openDetail(row)}
                                >
                                  <Receipt className="size-3.5" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  className="flex size-[26px] items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-500"
                                  title="Unmatch"
                                  onClick={() => handleUnmatch(row)}
                                >
                                  <Link2Off className="size-3.5" aria-hidden />
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              className="flex size-[26px] items-center justify-center rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-500"
                              title="Edit"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </button>
                            {canDelete ? (
                              <button
                                type="button"
                                className="flex size-[26px] items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-700 hover:border-red-500"
                                title="Delete"
                                onClick={() => handleDelete(row)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {items.length.toLocaleString()} rows loaded (max 1,000). Narrow
            filters if you need older data.
          </p>
        </div>

        <BankReconAddModal
          open={addOpen}
          onOpenChange={setAddOpen}
          importing={importing}
          onSelectManual={() => {
            setAddOpen(false);
            openCreate();
          }}
          onSelectFile={handleImportFile}
        />
        <BankReconFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          mode={formMode}
          item={formSelected}
          onSaved={refresh}
        />
        <BankReconMatchModal
          open={matchOpen}
          onOpenChange={setMatchOpen}
          bankTxn={matchSelected}
          onMatched={refresh}
        />
        <BankReconDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          bankTxnId={detailId}
        />
      </main>
    </>
  );
}
