"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getSettlementKpis,
  getSettlementRows,
  type SettlementKpis,
  type SettlementListRow,
  type SettlementOrdersRow,
  type SettlementOtherRow,
  type SettlementRefundsRow,
  type SettlementRowsResult,
} from "@/actions/settlement-report";
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
import { cn } from "@/lib/utils";

type Tab = "orders" | "refunds" | "other";

const ALL_SETTLEMENTS = "__all__";

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
  const [tab, setTab] = React.useState<Tab>("orders");
  const [settlementId, setSettlementId] = React.useState<string>(ALL_SETTLEMENTS);
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(100);

  const [kpis, setKpis] = React.useState<SettlementKpis>({});
  const [data, setData] = React.useState<
    | SettlementRowsResult<SettlementOrdersRow>
    | SettlementRowsResult<SettlementRefundsRow>
    | SettlementRowsResult<SettlementOtherRow>
    | null
  >(null);
  const [loading, setLoading] = React.useState(true);

  const filters = React.useMemo(
    () => ({
      tab,
      settlementId:
        settlementId === ALL_SETTLEMENTS ? null : settlementId,
      page,
      limit,
    }),
    [tab, settlementId, page, limit],
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
  }, [filters]);

  function changeTab(next: string) {
    setTab(next as Tab);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Settlement Report
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Amazon settlement summary — orders, refunds, and other line items.
            Posted-date driven; matches the ledger one-for-one.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                All settlements ({settlements.length})
              </SelectItem>
              {settlements.map((s) => (
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
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
                  {tab === "refunds" ? (
                    <RefundsHead />
                  ) : tab === "orders" ? (
                    <OrdersHead />
                  ) : (
                    <OtherHead />
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tab === "other" ? 9 : 10}
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

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {data.total.toLocaleString()} rows · Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
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
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function HeadCell({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function OrdersHead() {
  return (
    <tr>
      <HeadCell>Settlement</HeadCell>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right">Qty</HeadCell>
      <HeadCell align="right">Sales</HeadCell>
      <HeadCell align="right">FBA Fees</HeadCell>
      <HeadCell align="right">Commission</HeadCell>
      <HeadCell align="right">Var. Fee</HeadCell>
      <HeadCell align="right">Other</HeadCell>
      <HeadCell align="right">Total</HeadCell>
    </tr>
  );
}

function OrdersRow({ row }: { row: SettlementOrdersRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.settlement_id || "—"}</td>
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

function RefundsHead() {
  return (
    <tr>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right">Qty</HeadCell>
      <HeadCell align="right">Sales</HeadCell>
      <HeadCell align="right">FBA Fees</HeadCell>
      <HeadCell align="right">Commission</HeadCell>
      <HeadCell align="right">Var. Fee</HeadCell>
      <HeadCell align="right">Other</HeadCell>
      <HeadCell align="right">Total</HeadCell>
    </tr>
  );
}

function RefundsRow({ row }: { row: SettlementRefundsRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.posted_date || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sku || "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.refund_breakdown.length > 1 ? (
          <CellHoverPopover
            trigger={row.qty}
            title="Refund breakdown"
            count={row.refund_breakdown.length}
            side="left"
            width={360}
          >
            {row.refund_breakdown.map((b, i) => (
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

function OtherHead() {
  return (
    <tr>
      <HeadCell>Settlement</HeadCell>
      <HeadCell>Posted</HeadCell>
      <HeadCell>Tx Type</HeadCell>
      <HeadCell>Amount Type</HeadCell>
      <HeadCell>Description</HeadCell>
      <HeadCell>Order ID</HeadCell>
      <HeadCell>SKU</HeadCell>
      <HeadCell align="right">Qty</HeadCell>
      <HeadCell align="right">Amount</HeadCell>
    </tr>
  );
}

function OtherRow({ row }: { row: SettlementOtherRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.settlement_id || "—"}</td>
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
