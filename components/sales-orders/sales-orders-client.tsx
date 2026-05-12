"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getSalesOrders,
  type SalesOrderRow,
  type SalesOrdersPayload,
} from "@/actions/sales-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CellHoverPopover,
  CellHoverRow,
} from "@/components/shared/cell-hover-popover";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { cn } from "@/lib/utils";

function money(v: unknown, fallback = "—"): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return fallback;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyCls(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n < 0 ? "text-red-600" : "text-emerald-700";
}

function num(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

const SORT_KEYS = [
  "order_id",
  "sku",
  "qty",
  "amount",
  "sale_last",
  "refund_qty",
  "refund_total",
  "final_qty",
  "final_amount",
  "per_book_shipped",
  "per_book_profit",
  "settlement_posted",
  "delivery_location",
] as const;

type SortKey = (typeof SORT_KEYS)[number];

export function SalesOrdersClient({
  initialPayload,
}: {
  initialPayload: SalesOrdersPayload;
}) {
  const [payload, setPayload] = React.useState(initialPayload);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("sale_last");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [limit] = React.useState(50);
  const [loading, setLoading] = React.useState(false);

  const filters = React.useMemo(
    () => ({
      q: search.trim() || undefined,
      sort,
      dir,
      page,
      limit,
    }),
    [search, sort, dir, page, limit],
  );

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      (async () => {
        try {
          const next = await getSalesOrders(filters);
          if (!cancelled) setPayload(next);
        } catch (e) {
          if (!cancelled) {
            toast.error(e instanceof Error ? e.message : "Load failed.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filters]);

  function toggleSort(key: SortKey) {
    if (key === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDir("desc");
    }
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(payload.total / payload.limit));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Sales Orders</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Order-level rollup w/ settlement match, refund detection, and
            per-book profit vs shipped cost.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Orders"
          value={num(payload.total)}
          sub={`${num(payload.sum_qty)} units`}
          accent="blue"
        />
        <SummaryCard
          label="Refund Qty"
          value={num(payload.sum_refund_qty)}
          sub={money(payload.sum_refund_total)}
          accent="red"
        />
        <SummaryCard
          label="Final Net"
          value={money(payload.sum_final_amount)}
          sub={`${num(payload.sum_final_qty)} final units`}
          accent={payload.sum_final_amount < 0 ? "red" : "green"}
        />
        <SummaryCard
          label="Book Profit"
          value={money(payload.sum_book_profit_total)}
          sub={payload.sum_amount_currency}
          accent={payload.sum_book_profit_total < 0 ? "red" : "teal"}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="🔍 Search order, SKU, title, ASIN, publisher, FC, purchase id"
          className="h-8 max-w-[420px] flex-1 text-xs"
        />
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
          {payload.total.toLocaleString()} orders · page {page}/{totalPages}
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
                  <Head sort={sort} dir={dir} k="order_id" onSort={toggleSort}>
                    Order ID
                  </Head>
                  <Head sort={sort} dir={dir} k="sku" onSort={toggleSort}>
                    SKU
                  </Head>
                  <Head>Title</Head>
                  <Head align="right" sort={sort} dir={dir} k="qty" onSort={toggleSort}>
                    Qty
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="refund_qty" onSort={toggleSort}>
                    Refunds
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="final_qty" onSort={toggleSort}>
                    Final Qty
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="amount" onSort={toggleSort}>
                    Amount
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="refund_total" onSort={toggleSort}>
                    Refund $
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="final_amount" onSort={toggleSort}>
                    Net
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="per_book_shipped" onSort={toggleSort}>
                    Cost/Book
                  </Head>
                  <Head align="right" sort={sort} dir={dir} k="per_book_profit" onSort={toggleSort}>
                    Profit/Book
                  </Head>
                  <Head sort={sort} dir={dir} k="sale_last" onSort={toggleSort}>
                    Last Sale
                  </Head>
                  <Head sort={sort} dir={dir} k="delivery_location" onSort={toggleSort}>
                    FC
                  </Head>
                </tr>
              </thead>
              <tbody>
                {payload.rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-muted-foreground">
                      No orders.
                    </td>
                  </tr>
                ) : (
                  payload.rows.map((r) => (
                    <Row key={`${r.order_id}|${r.sku}`} row={r} />
                  ))
                )}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-border bg-muted/70 font-semibold">
                <tr>
                  <td className="px-2 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Totals · {payload.rows.length} shown
                  </td>
                  <td />
                  <td />
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {num(payload.sum_qty)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-red-600">
                    {num(payload.sum_refund_qty)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {num(payload.sum_final_qty)}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", moneyCls(payload.sum_amount))}>
                    {money(payload.sum_amount)}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", moneyCls(payload.sum_refund_total))}>
                    {money(payload.sum_refund_total)}
                  </td>
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", moneyCls(payload.sum_final_amount))}>
                    {money(payload.sum_final_amount)}
                  </td>
                  <td />
                  <td className={cn("px-2 py-2 text-right font-mono tabular-nums", moneyCls(payload.sum_book_profit_total))}>
                    {money(payload.sum_book_profit_total)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 text-xs">
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
    </main>
  );
}

function Head({
  align = "left",
  children,
  k,
  sort,
  dir,
  onSort,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
  k?: SortKey;
  sort?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (key: SortKey) => void;
}) {
  const sortable = !!k && !!onSort;
  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => k && onSort?.(k)}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted",
            sort === k ? "text-foreground" : "",
          )}
        >
          {children}
          {sort === k ? <span>{dir === "asc" ? "↑" : "↓"}</span> : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Row({ row }: { row: SalesOrderRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.order_id}</td>
      <td className="px-2 py-1.5 font-mono text-[11px] font-semibold text-blue-600">
        {row.sku}
      </td>
      <td
        className="max-w-[180px] truncate px-2 py-1.5 text-[11px]"
        title={row.listing_title ?? ""}
      >
        {row.listing_title ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.settlement_qty_breakdown && row.settlement_qty_breakdown.length > 0 ? (
          <CellHoverPopover
            trigger={num(row.qty)}
            title="Settlement breakdown"
            count={row.settlement_qty_breakdown.length}
            side="left"
            width={340}
          >
            {row.settlement_qty_breakdown.map((s, i) => (
              <div
                key={i}
                className="border-b border-border/60 px-2 py-1 last:border-b-0"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono">{s.settlement_id ?? "—"}</span>
                  <span className="font-mono tabular-nums">{s.qty}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {s.posted_date ?? "—"}
                </div>
              </div>
            ))}
          </CellHoverPopover>
        ) : (
          num(row.qty)
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-red-600">
        {row.refund_qty && row.refund_qty > 0 && row.refund_qty_breakdown && row.refund_qty_breakdown.length > 0 ? (
          <CellHoverPopover
            trigger={`-${row.refund_qty}`}
            title="Refund breakdown"
            count={row.refund_qty_breakdown.length}
            side="left"
            width={340}
            triggerClassName="text-red-600"
          >
            {row.refund_qty_breakdown.map((s, i) => (
              <div key={i} className="border-b border-border/60 px-2 py-1 last:border-b-0">
                <div className="flex justify-between gap-2">
                  <span className="font-mono">{s.settlement_id ?? "—"}</span>
                  <span className="font-mono tabular-nums">{s.qty}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {s.posted_date ?? "—"}
                </div>
              </div>
            ))}
          </CellHoverPopover>
        ) : row.refund_qty && row.refund_qty > 0 ? (
          `-${row.refund_qty}`
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold">
        {row.final_qty}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyCls(row.amount))}>
        {money(row.amount)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums", moneyCls(row.refund_total))}>
        {money(row.refund_total ?? 0)}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums font-bold", moneyCls(row.final_amount))}>
        {money(row.final_amount)}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.shipped_cost_breakdown && row.shipped_per_book_usd != null ? (
          <CellHoverPopover
            trigger={money(row.shipped_per_book_usd)}
            title="Shipped cost breakdown"
            side="left"
            width={300}
          >
            <CellHoverRow
              left="Final net price"
              right={money(row.shipped_cost_breakdown.final_net_price_usd ?? 0)}
            />
            <CellHoverRow
              left="Commission"
              right={money(row.shipped_cost_breakdown.commission_usd ?? 0)}
            />
            <CellHoverRow
              left="Supplier shipping"
              right={money(row.shipped_cost_breakdown.supplier_shipping_usd ?? 0)}
            />
            <CellHoverRow
              left="Warehouse prep"
              right={money(row.shipped_cost_breakdown.warehouse_prep_usd ?? 0)}
            />
            <CellHoverRow
              left="Inbound place"
              right={money(
                row.shipped_cost_breakdown.inventory_place_inbound_usd ?? 0,
              )}
            />
            <CellHoverRow
              left="Expert charges"
              right={money(row.shipped_cost_breakdown.expert_charges_usd ?? 0)}
            />
            <CellHoverRow
              left="Other charges"
              right={money(row.shipped_cost_breakdown.other_charges_usd ?? 0)}
            />
            <CellHoverRow
              left="Total per book"
              right={money(row.shipped_per_book_usd)}
            />
          </CellHoverPopover>
        ) : (
          money(row.shipped_per_book_usd ?? 0)
        )}
      </td>
      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums font-bold", moneyCls(row.per_book_profit_usd))}>
        {money(row.per_book_profit_usd ?? 0)}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sale_last ?? "—"}</td>
      <td
        className="max-w-[120px] truncate px-2 py-1.5 text-[11px]"
        title={row.delivery_location ?? ""}
      >
        {row.delivery_location ?? "—"}
      </td>
    </tr>
  );
}
