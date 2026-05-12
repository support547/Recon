"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import {
  getSalesReconRollup,
  type SalesReconRollupResult,
  type SalesReconRollupRow,
} from "@/actions/sales-recon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CellHoverPopover,
} from "@/components/shared/cell-hover-popover";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { cn } from "@/lib/utils";

type Tab = "orders" | "refunds";

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
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
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

export function SalesReconClient({
  initialPayload,
}: {
  initialPayload: SalesReconRollupResult;
}) {
  const [tab, setTab] = React.useState<Tab>("orders");
  const [search, setSearch] = React.useState("");
  const [payload, setPayload] = React.useState(initialPayload);
  const [loading, setLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const next = await getSalesReconRollup();
      setPayload(next);
      toast.success("Refreshed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = tab === "orders" ? payload.orders : payload.refunds;
    if (!q) return src;
    return src.filter(
      (r) =>
        r.order_id.toLowerCase().includes(q) ||
        r.sku_norm.toLowerCase().includes(q),
    );
  }, [payload, tab, search]);

  const totals = React.useMemo(() => totalsFor(filtered), [filtered]);
  const ordersTotals = React.useMemo(
    () => totalsFor(payload.orders),
    [payload.orders],
  );
  const refundsTotals = React.useMemo(
    () => totalsFor(payload.refunds),
    [payload.refunds],
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Sales Reconciliation
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Settlement-level orders + refunds rolled up by normalized (order_id,
            sku). Source: Settlement Report.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw
            className={cn("size-3.5", loading ? "animate-spin" : "")}
            aria-hidden
          />
          Refresh
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Orders Rows"
          value={num(payload.orders.length)}
          sub={`${num(ordersTotals.qty)} units`}
          accent="green"
        />
        <SummaryCard
          label="Orders Net"
          value={money(ordersTotals.total)}
          sub={`Sales ${money(ordersTotals.sales)}`}
          accent={ordersTotals.total < 0 ? "red" : "green"}
        />
        <SummaryCard
          label="Refund Rows"
          value={num(payload.refunds.length)}
          sub={`${num(refundsTotals.qty)} units`}
          accent="red"
        />
        <SummaryCard
          label="Refunds Net"
          value={money(refundsTotals.total)}
          sub={`Sales ${money(refundsTotals.sales)}`}
          accent={refundsTotals.total < 0 ? "red" : "green"}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search Order ID / SKU"
          className="h-8 max-w-[320px] flex-1 text-xs"
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="orders">
              Orders ({payload.orders.length})
            </TabsTrigger>
            <TabsTrigger value="refunds">
              Refunds ({payload.refunds.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
          {filtered.length.toLocaleString()} rows
        </span>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
                <tr>
                  <Head>Order ID</Head>
                  <Head>SKU</Head>
                  <Head align="right">Qty</Head>
                  <Head align="right">Sales</Head>
                  <Head align="right">FBA Fees</Head>
                  <Head align="right">Commission</Head>
                  <Head align="right">Var. Fee</Head>
                  <Head align="right">Other</Head>
                  <Head align="right">Net Total</Head>
                  <Head>Settlements</Head>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No rows. Upload settlement report to populate.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, i) => (
                    <Row key={`${r.order_id}|${r.sku_norm}|${i}`} row={r} />
                  ))
                )}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-border bg-muted/70 font-semibold">
                <tr>
                  <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Totals · {filtered.length} rows
                  </td>
                  <td />
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {num(totals.qty)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.sales),
                    )}
                  >
                    {money(totals.sales)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.fbaFees),
                    )}
                  >
                    {money(totals.fbaFees)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.commission),
                    )}
                  >
                    {money(totals.commission)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.variableFee),
                    )}
                  >
                    {money(totals.variableFee)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.other),
                    )}
                  >
                    {money(totals.other)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular-nums",
                      moneyClass(totals.total),
                    )}
                  >
                    {money(totals.total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function Head({
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

function Row({ row }: { row: SalesReconRollupRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id}</td>
      <td className="px-2 py-1.5 font-mono text-[11px] font-semibold text-blue-600">
        {row.sku_norm}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {num(row.qty)}
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
      <td className="px-2 py-1.5 font-mono text-[10px]">
        <SettlementsCell ids={row.settlement_ids} />
      </td>
    </tr>
  );
}

function SettlementsCell({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="text-muted-foreground">—</span>;
  const first = ids[0];
  if (ids.length === 1) return <span>{first}</span>;
  return (
    <CellHoverPopover
      trigger={
        <span>
          {first}{" "}
          <span className="text-[9px] text-muted-foreground">
            +{ids.length - 1}
          </span>
        </span>
      }
      title="Settlement IDs"
      count={ids.length}
      side="left"
      width={320}
    >
      {ids.map((id, i) => (
        <div
          key={i}
          className="border-b border-border/60 px-2 py-1 last:border-b-0 font-mono"
        >
          {id}
        </div>
      ))}
    </CellHoverPopover>
  );
}

type Totals = {
  qty: number;
  sales: number;
  fbaFees: number;
  commission: number;
  variableFee: number;
  other: number;
  total: number;
};

function totalsFor(rows: SalesReconRollupRow[]): Totals {
  const t: Totals = {
    qty: 0,
    sales: 0,
    fbaFees: 0,
    commission: 0,
    variableFee: 0,
    other: 0,
    total: 0,
  };
  for (const r of rows) {
    t.qty += r.qty || 0;
    t.sales += Number(r.sales_amount) || 0;
    t.fbaFees += Number(r.fba_fees) || 0;
    t.commission += Number(r.fba_commission) || 0;
    t.variableFee += Number(r.variable_fee) || 0;
    t.other += Number(r.other_charges) || 0;
    t.total += Number(r.total_amount) || 0;
  }
  return t;
}
