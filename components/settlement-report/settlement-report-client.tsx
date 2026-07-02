"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getSettlementKpis,
  getSettlementList,
  getSettlementRows,
  getSettlementSummary,
  type SettlementColumnTotals,
  type SettlementKpis,
  type SettlementListRow,
  type SettlementOrdersRow,
  type SettlementOtherRow,
  type SettlementRefundsRow,
  type SettlementRowsResult,
  type SettlementSummaryRow,
} from "@/actions/settlement-report";
import {
  SETTLEMENT_ACCOUNT_TYPES,
  SETTLEMENT_ACCOUNT_TYPE_LABELS,
  SETTLEMENT_STORES,
} from "@/lib/upload-report-types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CellHoverPopover,
  CellHoverRow,
} from "@/components/shared/cell-hover-popover";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { HeaderActions } from "@/components/layout/header-actions";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { cn } from "@/lib/utils";

type Tab = "orders" | "refunds" | "other";
type View = "details" | "summary";

const ALL_SETTLEMENTS = "__all__";
const ALL_ACCOUNTS = "__all__";
const ALL_STORES = "__all__";

function accountLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (SETTLEMENT_ACCOUNT_TYPE_LABELS as Record<string, string>)[v] ?? v;
}

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyClass(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n < 0 ? "text-red-600" : "text-emerald-700";
}

function num(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

export function SettlementReportClient({
  settlements,
}: {
  settlements: SettlementListRow[];
}) {
  const [view, setView] = React.useState<View>("details");
  const [tab, setTab] = React.useState<Tab>("orders");
  const [settlementId, setSettlementId] = React.useState<string>(ALL_SETTLEMENTS);
  const [accountType, setAccountType] = React.useState<string>(ALL_ACCOUNTS);
  const [store, setStore] = React.useState<string>(ALL_STORES);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(15);

  const [settlementList, setSettlementList] =
    React.useState<SettlementListRow[]>(settlements);
  const [kpis, setKpis] = React.useState<SettlementKpis>({});
  const [data, setData] = React.useState<
    | SettlementRowsResult<SettlementOrdersRow>
    | SettlementRowsResult<SettlementRefundsRow>
    | SettlementRowsResult<SettlementOtherRow>
    | null
  >(null);
  const [summary, setSummary] = React.useState<SettlementSummaryRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  useTrackPending(loading);

  const settlementIdOrNull =
    settlementId === ALL_SETTLEMENTS ? null : settlementId;
  const accountTypeOrNull =
    accountType === ALL_ACCOUNTS ? null : accountType;
  const storeOrNull = store === ALL_STORES ? null : store;

  const filters = React.useMemo(
    () => ({
      tab,
      settlementId: settlementIdOrNull,
      accountType: accountTypeOrNull,
      store: storeOrNull,
      page,
      limit,
    }),
    [tab, settlementIdOrNull, accountTypeOrNull, storeOrNull, page, limit],
  );

  // Reload the settlement dropdown whenever the Account Type or Store
  // selection changes so that only matching settlement-ids are offered.
  // Reset the chosen settlement if it no longer exists in the filtered list.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getSettlementList({
          accountType: accountTypeOrNull,
          store: storeOrNull,
        });
        if (cancelled) return;
        setSettlementList(next);
        if (
          settlementId !== ALL_SETTLEMENTS &&
          !next.some((s) => s.settlement_id === settlementId)
        ) {
          setSettlementId(ALL_SETTLEMENTS);
          setPage(1);
        }
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Failed to refresh settlements.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountTypeOrNull, storeOrNull]);

  React.useEffect(() => {
    if (view !== "details") return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    (async () => {
      try {
        const [k, d] = await Promise.all([
          getSettlementKpis(filters),
          getSettlementRows(filters),
        ]);
        if (cancelled) return;
        setKpis(k);
        setData(d);
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Failed to load settlement data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, filters]);

  React.useEffect(() => {
    if (view !== "summary") return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    (async () => {
      try {
        const s = await getSettlementSummary({
          settlementId: settlementIdOrNull,
          accountType: accountTypeOrNull,
          store: storeOrNull,
        });
        if (cancelled) return;
        setSummary(s);
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Failed to load summary.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, settlementIdOrNull, accountTypeOrNull, storeOrNull]);

  function changeTab(next: string) {
    setTab(next as Tab);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <HeaderActions>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition",
              view === "details"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1 text-xs font-semibold transition",
              view === "summary"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("summary")}
          >
            Summary
          </button>
        </div>
      </HeaderActions>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Settlement Breakup
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Amazon settlement summary — orders, refunds, and other line items.
            Posted-date driven; matches the ledger one-for-one.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            Account
          </span>
          <Select
            value={accountType}
            onValueChange={(v) => {
              setAccountType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS}>All accounts</SelectItem>
              {SETTLEMENT_ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {SETTLEMENT_ACCOUNT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Store
          </span>
          <Select
            value={store}
            onValueChange={(v) => {
              setStore(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="All stores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STORES}>All stores</SelectItem>
              {SETTLEMENT_STORES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Settlement
          </span>
          <Select
            value={settlementId}
            onValueChange={(v) => {
              setSettlementId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[260px] text-xs">
              <SelectValue placeholder="All settlements" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SETTLEMENTS}>
                All settlements ({settlementList.length})
              </SelectItem>
              {settlementList.map((s) => (
                <SelectItem key={s.settlement_id} value={s.settlement_id}>
                  {s.settlement_id}
                  {s.start_date ? ` · ${s.start_date}` : ""}
                  {s.end_date ? ` → ${s.end_date}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {view === "summary" ? (
        <SummarySection
          rows={summary}
          loading={loading}
        />
      ) : (
        <>
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
      </Tabs>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tab !== "other" ? (
          <>
            <SummaryCard
              label="Unique Orders"
              value={num(kpis.unique_orders)}
              accent="blue"
            />
            <SummaryCard
              label="Unique SKUs"
              value={num(kpis.unique_skus)}
              accent="teal"
            />
            <SummaryCard
              label={tab === "refunds" ? "Refund Qty" : "Order Qty"}
              value={num(kpis.total_qty)}
              accent="purple"
            />
            <SummaryCard
              label="Net Amount"
              value={money(kpis.net_amount)}
              accent={
                Number(kpis.net_amount ?? 0) < 0 ? "red" : "green"
              }
            />
          </>
        ) : (
          <>
            <SummaryCard
              label="Rows"
              value={num(kpis.row_count)}
              accent="blue"
            />
            <SummaryCard
              label="Tx Types"
              value={num(kpis.tx_types)}
              accent="teal"
            />
            <SummaryCard
              label="Settlements"
              value={num(kpis.settlements)}
              accent="purple"
            />
            <SummaryCard
              label="Net Amount"
              value={money(kpis.net_amount)}
              accent={
                Number(kpis.net_amount ?? 0) < 0 ? "red" : "green"
              }
            />
          </>
        )}
      </section>

      {loading || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
              <table className="min-w-max text-xs whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
                  {tab === "refunds" ? (
                    <RefundsHead totals={kpis.totals} />
                  ) : tab === "orders" ? (
                    <OrdersHead totals={kpis.totals} />
                  ) : (
                    <OtherHead totals={kpis.totals} />
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tab === "orders" ? 13 : tab === "refunds" ? 12 : 11}
                        className="py-12 text-center text-muted-foreground"
                      >
                        No rows for this tab / settlement.
                      </td>
                    </tr>
                  ) : tab === "refunds" ? (
                    (data.rows as SettlementRefundsRow[]).map((r, i) => (
                      <RefundsRow key={`${r.order_id}|${r.sku}|${i}`} row={r} />
                    ))
                  ) : tab === "orders" ? (
                    (data.rows as SettlementOrdersRow[]).map((r, i) => (
                      <OrdersRow
                        key={`${r.settlement_id}|${r.order_id}|${r.sku}|${i}`}
                        row={r}
                      />
                    ))
                  ) : (
                    (data.rows as SettlementOtherRow[]).map((r, i) => (
                      <OtherRow
                        key={`${r.settlement_id}|${r.amount_description}|${i}`}
                        row={r}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {data.total.toLocaleString()} rows · Page {page} of {totalPages}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Rows per page
              </span>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(1)}
              >
                First
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(totalPages)}
              >
                Last
              </Button>
            </div>
          </div>
        </>
      )}
        </>
      )}
    </main>
  );
}

function SummarySection({
  rows,
  loading,
}: {
  rows: SettlementSummaryRow[] | null;
  loading: boolean;
}) {
  if (loading || rows === null) {
    return <Skeleton className="h-96 w-full" />;
  }
  const totals = rows.reduce(
    (acc, r) => {
      acc.order_qty += r.order_qty;
      acc.order_sales += Number(r.order_sales);
      acc.order_fba_fees += Number(r.order_fba_fees);
      acc.order_commission += Number(r.order_commission);
      acc.order_variable_fee += Number(r.order_variable_fee);
      acc.order_other += Number(r.order_other);
      acc.order_total += Number(r.order_total);
      acc.refund_qty += r.refund_qty;
      acc.refund_sales += Number(r.refund_sales);
      acc.refund_fba_fees += Number(r.refund_fba_fees);
      acc.refund_commission += Number(r.refund_commission);
      acc.refund_variable_fee += Number(r.refund_variable_fee);
      acc.refund_other += Number(r.refund_other);
      acc.refund_total += Number(r.refund_total);
      acc.other_amount += Number(r.other_amount);
      acc.net_amount += Number(r.net_amount);
      if (r.bank_matched) {
        const amt = Number(r.bank_amount_usd);
        const varUsd = Number(r.bank_variance_usd);
        if (Number.isFinite(amt)) acc.bank_amount_usd += amt;
        if (Number.isFinite(varUsd)) acc.bank_variance_usd += varUsd;
      }
      return acc;
    },
    {
      order_qty: 0, order_sales: 0, order_fba_fees: 0, order_commission: 0,
      order_variable_fee: 0, order_other: 0, order_total: 0,
      refund_qty: 0, refund_sales: 0, refund_fba_fees: 0, refund_commission: 0,
      refund_variable_fee: 0, refund_other: 0, refund_total: 0,
      other_amount: 0, net_amount: 0,
      bank_amount_usd: 0, bank_variance_usd: 0,
    },
  );
  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="max-h-[72vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-max text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
            <tr>
              <HeadCell>Settlement</HeadCell>
              <HeadCell>Account</HeadCell>
              <HeadCell>Store</HeadCell>
              <HeadCell align="center">Period</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_qty} totalKind="num">Qty</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_sales} totalKind="money">Sales</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_fba_fees} totalKind="money">FBA Fees</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_commission} totalKind="money">Commission</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_variable_fee} totalKind="money">Var. Fee</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_other} totalKind="money">Other</HeadCell>
              <HeadCell align="right" tone="orders" total={totals.order_total} totalKind="money">Total</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_qty} totalKind="num">Qty</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_sales} totalKind="money">Sales</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_fba_fees} totalKind="money">FBA Fees</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_commission} totalKind="money">Commission</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_variable_fee} totalKind="money">Var. Fee</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_other} totalKind="money">Other</HeadCell>
              <HeadCell align="right" tone="refunds" total={totals.refund_total} totalKind="money">Total</HeadCell>
              <HeadCell align="right" total={totals.other_amount} totalKind="money">Other $</HeadCell>
              <HeadCell align="right" total={totals.net_amount} totalKind="money">Net</HeadCell>
              <HeadCell align="left"  tone="bank">Bank Date</HeadCell>
              <HeadCell align="left"  tone="bank">Bank Description</HeadCell>
              <HeadCell align="right" tone="bank" total={totals.bank_amount_usd} totalKind="money">Bank Amt USD</HeadCell>
              <HeadCell align="right" tone="bank" total={totals.bank_variance_usd} totalKind="money">Variance USD</HeadCell>
              <HeadCell align="right" tone="bank">FX Rate</HeadCell>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={25} className="py-12 text-center text-muted-foreground">
                  No settlements found.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const oBg = "bg-emerald-50/60";
                const rBg = "bg-rose-50/60";
                const bBg = "bg-sky-50/60";
                const linked = r.bank_matched === true;
                const isCad =
                  (r.store ?? "").toUpperCase() === "CA";
                return (
                <tr key={r.settlement_id} className="border-b border-border/50 hover:bg-slate-50">
                  <td className="px-2 py-2 font-mono text-[11px] font-semibold">{r.settlement_id}</td>
                  <td className="px-2 py-2 text-[11px]">{accountLabel(r.account_type)}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">{r.store || "—"}</td>
                  <td className="px-2 py-2 text-center font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {r.start_date || "—"}
                    {r.end_date ? ` → ${r.end_date}` : ""}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg)}>{num(r.order_qty)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg, moneyClass(r.order_sales))}>{money(r.order_sales)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg, moneyClass(r.order_fba_fees))}>{money(r.order_fba_fees)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg, moneyClass(r.order_commission))}>{money(r.order_commission)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg, moneyClass(r.order_variable_fee))}>{money(r.order_variable_fee)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", oBg, moneyClass(r.order_other))}>{money(r.order_other)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums font-bold", oBg, moneyClass(r.order_total))}>{money(r.order_total)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg)}>{num(r.refund_qty)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg, moneyClass(r.refund_sales))}>{money(r.refund_sales)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg, moneyClass(r.refund_fba_fees))}>{money(r.refund_fba_fees)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg, moneyClass(r.refund_commission))}>{money(r.refund_commission)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg, moneyClass(r.refund_variable_fee))}>{money(r.refund_variable_fee)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", rBg, moneyClass(r.refund_other))}>{money(r.refund_other)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums font-bold", rBg, moneyClass(r.refund_total))}>{money(r.refund_total)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", moneyClass(r.other_amount))}>{money(r.other_amount)}</td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums font-bold", moneyClass(r.net_amount))}>{money(r.net_amount)}</td>
                  {/* Bank link — all cells blank when unlinked, per spec. */}
                  <td className={cn("px-2 py-2 text-left font-mono text-[11px]", bBg)}>
                    {linked ? r.bank_txn_date ?? "" : ""}
                  </td>
                  <td
                    className={cn("max-w-[240px] px-2 py-2 text-left text-[11px]", bBg)}
                    title={linked ? r.bank_description ?? "" : ""}
                  >
                    <span className="block truncate">
                      {linked ? r.bank_description ?? "" : ""}
                    </span>
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", bBg, linked ? moneyClass(r.bank_amount_usd) : "")}>
                    {linked ? money(r.bank_amount_usd) : ""}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", bBg, linked ? moneyClass(r.bank_variance_usd) : "")}>
                    {linked ? money(r.bank_variance_usd) : ""}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", bBg)}>
                    {linked ? (isCad && r.bank_fx_rate ? Number(r.bank_fx_rate).toFixed(4) : "—") : ""}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeadCell({
  align = "left",
  children,
  total,
  totalKind,
  tone,
}: {
  align?: "left" | "right" | "center";
  children: React.ReactNode;
  total?: unknown;
  totalKind?: "num" | "money";
  tone?: "orders" | "refunds" | "bank";
}) {
  const totalText =
    total === undefined || total === null
      ? null
      : totalKind === "money"
        ? money(total)
        : num(total);
  const totalCls =
    Number(total) === 0 ? "text-muted-foreground" : "text-blue-800";
  const labelCls =
    tone === "orders"
      ? "text-emerald-900"
      : tone === "refunds"
        ? "text-rose-900"
        : tone === "bank"
          ? "text-sky-900"
          : "text-muted-foreground";
  const bgCls =
    tone === "orders"
      ? "bg-emerald-100"
      : tone === "refunds"
        ? "bg-rose-100"
        : tone === "bank"
          ? "bg-sky-100"
          : "";
  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wide",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        bgCls,
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          align === "right" ? "items-end" : align === "center" ? "items-center" : "items-start",
        )}
      >
        <span className={labelCls}>{children}</span>
        {totalText !== null ? (
          <span
            className={cn(
              "mt-0.5 font-mono text-[10px] font-semibold normal-case tracking-normal",
              totalCls,
            )}
          >
            {totalText}
          </span>
        ) : null}
      </div>
    </th>
  );
}

function OrdersHead({ totals }: { totals?: SettlementColumnTotals }) {
  return (
    <tr>
      <HeadCell>Settlement</HeadCell>
      <HeadCell>Account</HeadCell>
      <HeadCell>Store</HeadCell>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right" total={totals?.qty} totalKind="num">Qty</HeadCell>
      <HeadCell align="right" total={totals?.sales} totalKind="money">Sales</HeadCell>
      <HeadCell align="right" total={totals?.fba_fees} totalKind="money">FBA Fees</HeadCell>
      <HeadCell align="right" total={totals?.fba_commission} totalKind="money">Commission</HeadCell>
      <HeadCell align="right" total={totals?.variable_fee} totalKind="money">Var. Fee</HeadCell>
      <HeadCell align="right" total={totals?.other_charges} totalKind="money">Other</HeadCell>
      <HeadCell align="right" total={totals?.total_amount} totalKind="money">Total</HeadCell>
    </tr>
  );
}

function OrdersRow({ row }: { row: SettlementOrdersRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.settlement_id || "—"}</td>
      <td className="px-2 py-1.5 text-[10px]">{accountLabel(row.account_type)}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.store || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.posted_date || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sku || "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.qty}</td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.sales_amount))}>
        {money(row.sales_amount)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.fba_fees))}>
        {money(row.fba_fees)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.fba_commission))}>
        {money(row.fba_commission)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.variable_fee))}>
        {money(row.variable_fee)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.other_charges))}>
        {money(row.other_charges)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums font-bold", moneyClass(row.total_amount))}>
        {money(row.total_amount)}
      </td>
    </tr>
  );
}

function RefundsHead({ totals }: { totals?: SettlementColumnTotals }) {
  return (
    <tr>
      <HeadCell>Account</HeadCell>
      <HeadCell>Store</HeadCell>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right" total={totals?.qty} totalKind="num">Qty</HeadCell>
      <HeadCell align="right" total={totals?.sales} totalKind="money">Sales</HeadCell>
      <HeadCell align="right" total={totals?.fba_fees} totalKind="money">FBA Fees</HeadCell>
      <HeadCell align="right" total={totals?.fba_commission} totalKind="money">Commission</HeadCell>
      <HeadCell align="right" total={totals?.variable_fee} totalKind="money">Var. Fee</HeadCell>
      <HeadCell align="right" total={totals?.other_charges} totalKind="money">Other</HeadCell>
      <HeadCell align="right" total={totals?.total_amount} totalKind="money">Total</HeadCell>
    </tr>
  );
}

function RefundsRow({ row }: { row: SettlementRefundsRow }) {
  const breakdown = Array.isArray(row.refund_breakdown) ? row.refund_breakdown : [];
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 text-[10px]">{accountLabel(row.account_type)}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.store || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.posted_date || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sku || "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {breakdown.length > 1 ? (
          <CellHoverPopover
            trigger={row.qty}
            title="Refund breakdown"
            count={breakdown.length}
            side="left"
            width={360}
          >
            {breakdown.map((b, i) => (
              <div
                key={i}
                className="border-b border-border/60 px-2 py-1 last:border-b-0"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono">
                    {b.settlement_id || "—"}
                  </span>
                  <span className="font-mono tabular-nums">{b.qty}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {b.posted_date || "—"}
                  {b.order_item_code ? ` · ${b.order_item_code}` : ""}
                </div>
              </div>
            ))}
          </CellHoverPopover>
        ) : (
          row.qty
        )}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.sales_amount))}>
        {money(row.sales_amount)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.fba_fees))}>
        {money(row.fba_fees)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.fba_commission))}>
        {money(row.fba_commission)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.variable_fee))}>
        {money(row.variable_fee)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.other_charges))}>
        {money(row.other_charges)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums font-bold", moneyClass(row.total_amount))}>
        {money(row.total_amount)}
      </td>
    </tr>
  );
}

function OtherHead({ totals }: { totals?: SettlementColumnTotals }) {
  return (
    <tr>
      <HeadCell>Settlement</HeadCell>
      <HeadCell>Account</HeadCell>
      <HeadCell>Store</HeadCell>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Tx Type</HeadCell>
      <HeadCell>Amount Type</HeadCell>
      <HeadCell>Description</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right" total={totals?.qty} totalKind="num">Qty</HeadCell>
      <HeadCell align="right" total={totals?.amount} totalKind="money">Amount</HeadCell>
    </tr>
  );
}

function OtherRow({ row }: { row: SettlementOtherRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.settlement_id || "—"}</td>
      <td className="px-2 py-1.5 text-[10px]">{accountLabel(row.account_type)}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.store || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.posted_date || "—"}</td>
      <td className="px-2 py-1.5 text-[10px]">{row.transaction_type || "—"}</td>
      <td className="px-2 py-1.5 text-[10px]">{row.amount_type || "—"}</td>
      <td className="px-2 py-1.5 text-[10px]">{row.amount_description || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sku || "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{row.qty}</td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyClass(row.amount))}>
        {money(row.amount)}
      </td>
    </tr>
  );
}

// `CellHoverRow` re-exported for cross-tab future use.
void CellHoverRow;
