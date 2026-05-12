"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

import type {
  DataExplorerFilters,
  DataExplorerSummary,
} from "@/actions/data-explorer";
import { DataTable } from "@/components/data-explorer/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATA_EXPLORER_TABS,
  type DataExplorerTabId,
} from "@/lib/data-explorer-constants";
import {
  getDataExplorerColumns,
} from "@/lib/data-explorer-tab-columns";

const FI_LABEL =
  "text-[9px] font-bold uppercase tracking-[0.6px] text-[#9ca3af]";

const FI_INPUT =
  "h-[30px] rounded-[7px] border border-[#c8cdd8] bg-white px-2.5 text-[12px] text-[#0f1117] outline-none focus:border-[#1a56db]";

function buildQuery(opts: {
  tab: DataExplorerTabId;
  page: number;
  pageSize: number;
  filters: DataExplorerFilters;
  salesView: "fnsku" | "asin";
  fbaView: "details" | "summary";
}) {
  const p = new URLSearchParams();
  p.set("tab", opts.tab);
  p.set("page", String(opts.page));
  p.set("pageSize", String(opts.pageSize));
  const f = opts.filters;
  const set = (k: string, v?: string) => {
    const t = v?.trim();
    if (t) p.set(k, t);
  };
  set("from", f.dateFrom);
  set("to", f.dateTo);
  if (f.store && f.store !== "__all__") set("store", f.store);
  set("q", f.search);
  set("shipmentId", f.shipmentId);
  set("msku", f.msku);
  set("fnsku", f.fnsku);
  set("disposition", f.disposition);
  set("fc", f.fc);
  set("reason", f.reason);
  set("orderStatus", f.orderStatus);
  set("fulfillmentCenter", f.fulfillmentCenter);
  set("shipmentStatus", f.shipmentStatus);
  set("settlementId", f.settlementId);
  set("transactionStatus", f.transactionStatus);
  set("unitStatus", f.unitStatus);
  set("flag", f.flag);
  set("adjStore", f.adjStore);
  if (opts.tab === "sales_data" && opts.salesView !== "fnsku") {
    p.set("salesView", opts.salesView);
  }
  if (opts.tab === "fba_summary" && opts.fbaView !== "details") {
    p.set("fbaView", opts.fbaView);
  }
  return p.toString();
}

const cardToneTop: Record<string, string> = {
  blue: "border-t-[#1a56db]",
  green: "border-t-[#10b981]",
  yellow: "border-t-[#f59e0b]",
  teal: "border-t-[#0d9488]",
  purple: "border-t-[#8b5cf6]",
  orange: "border-t-[#f97316]",
  red: "border-t-[#ef4444]",
  gray: "border-t-[#9ca3af]",
};

function SummaryCards({ summary }: { summary: DataExplorerSummary }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {summary.cards.map((c) => (
        <div
          key={c.id}
          className={`min-w-[110px] flex-1 rounded-lg border border-[#e4e7ec] bg-white px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${cardToneTop[c.tone] ?? cardToneTop.blue} border-t-[3px]`}
        >
          <div className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.7px] text-[#9ca3af]">
            {c.label}
          </div>
          <div className="font-[family-name:var(--font-dm-mono)] text-[18px] font-bold leading-none tracking-tight text-[#0f1117]">
            {c.value}
          </div>
          {c.sub ? (
            <div className="mt-0.5 text-[9px] text-[#9ca3af]">{c.sub}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MiniTables({ summary }: { summary: DataExplorerSummary }) {
  if (!summary.miniTables?.length) return null;
  return (
    <div className="mb-3 grid gap-3 md:grid-cols-2">
      {summary.miniTables.map((t) => (
        <div
          key={t.title}
          className="rounded-lg border border-[#e4e7ec] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        >
          <div className="border-b border-[#e4e7ec] px-3 py-2 text-[12px] font-bold">
            {t.title}
          </div>
          <div className="max-h-[200px] overflow-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {t.headers.map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 bg-[#f8fafc] px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-[#9ca3af]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[#f1f5f9]">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2.5 py-1.5">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export type DataExplorerViewProps = {
  tab: DataExplorerTabId;
  page: number;
  pageSize: number;
  total: number;
  filters: DataExplorerFilters;
  salesView: "fnsku" | "asin";
  fbaView: "details" | "summary";
  stores: string[];
  filterOptions: {
    shippedShipmentIds: string[];
    shippedCostShipmentIds: string[];
    receiptShipmentIds: string[];
    salesFc: string[];
    transferFc: string[];
    reimbReasons: string[];
    gnrUnitStatuses: string[];
  };
  counts: Record<DataExplorerTabId, number>;
  lastUploadedAt: Partial<Record<DataExplorerTabId, string | Date | null>>;
  summary: DataExplorerSummary;
  rows: Record<string, unknown>[];
};

export function DataExplorerView({
  tab,
  page,
  pageSize,
  total,
  filters,
  salesView,
  fbaView,
  stores,
  filterOptions,
  counts,
  lastUploadedAt,
  summary,
  rows,
}: DataExplorerViewProps) {
  const router = useRouter();

  const [draft, setDraft] = React.useState<DataExplorerFilters>(filters);

  React.useEffect(() => {
    setDraft(filters);
  }, [filters, tab, page]);

  const navigate = React.useCallback(
    (next: {
      tab?: DataExplorerTabId;
      page?: number;
      pageSize?: number;
      filters?: DataExplorerFilters;
      salesView?: "fnsku" | "asin";
      fbaView?: "details" | "summary";
    }) => {
      const t = next.tab ?? tab;
      const pg = next.page ?? page;
      const ps = next.pageSize ?? pageSize;
      const f = next.filters ?? filters;
      const sv = next.salesView ?? salesView;
      const fv = next.fbaView ?? fbaView;
      router.push(
        `/data-explorer?${buildQuery({
          tab: t,
          page: pg,
          pageSize: ps,
          filters: f,
          salesView: sv,
          fbaView: fv,
        })}`,
      );
    },
    [filters, router, tab, page, pageSize, salesView, fbaView],
  );

  const apply = React.useCallback(() => {
    navigate({
      page: 1,
      filters: draft,
    });
  }, [draft, navigate]);

  const clear = React.useCallback(() => {
    setDraft({});
    navigate({
      page: 1,
      filters: {},
      salesView: "fnsku",
      fbaView: "details",
    });
  }, [navigate]);

  const rawLast = lastUploadedAt[tab];
  const lastLabel =
    rawLast == null
      ? "No upload logged for this report type yet."
      : `Last uploaded ${formatDistanceToNow(
          rawLast instanceof Date ? rawLast : new Date(rawLast),
          { addSuffix: true },
        )}`;

  const emptyCopy =
    counts[tab] === 0
      ? "No data uploaded for this report type yet."
      : "No rows match your filters.";

  const colSpecs = React.useMemo(
    () =>
      getDataExplorerColumns(tab, {
        salesView,
        fbaSummaryView: fbaView,
      }),
    [tab, salesView, fbaView],
  );

  const updateDraft = (patch: Partial<DataExplorerFilters>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const fi = (label: string, child: React.ReactNode) => (
    <div className="flex min-w-[140px] flex-col gap-1">
      <span className={FI_LABEL}>{label}</span>
      {child}
    </div>
  );

  const shipmentOptions =
    tab === "shipped_to_fba"
      ? filterOptions.shippedShipmentIds
      : tab === "shipped_cost"
        ? filterOptions.shippedCostShipmentIds
        : tab === "fba_receipts"
          ? filterOptions.receiptShipmentIds
          : [];

  const filterBar = (
    <div className="mb-3 flex flex-wrap items-end gap-2.5 rounded-[10px] border border-[#e4e7ec] bg-white px-[14px] py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {tab === "shipped_to_fba" ? (
        <>
          {fi(
            "Shipment ID",
            <select
              className={`${FI_INPUT} min-w-[180px]`}
              value={draft.shipmentId ?? ""}
              onChange={(e) =>
                updateDraft({ shipmentId: e.target.value || undefined })
              }
            >
              <option value="">All Shipments</option>
              {shipmentOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "MSKU",
            <Input
              className={FI_INPUT}
              value={draft.msku ?? ""}
              onChange={(e) => updateDraft({ msku: e.target.value })}
            />,
          )}
          {fi(
            "FNSKU",
            <Input
              className={FI_INPUT}
              value={draft.fnsku ?? ""}
              onChange={(e) => updateDraft({ fnsku: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "shipped_cost" ? (
        <>
          {fi(
            "Shipment ID",
            <select
              className={`${FI_INPUT} min-w-[180px]`}
              value={draft.shipmentId ?? ""}
              onChange={(e) =>
                updateDraft({ shipmentId: e.target.value || undefined })
              }
            >
              <option value="">All Shipments</option>
              {shipmentOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "From Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateFrom ?? ""}
              onChange={(e) => updateDraft({ dateFrom: e.target.value })}
            />,
          )}
          {fi(
            "To Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateTo ?? ""}
              onChange={(e) => updateDraft({ dateTo: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "sales_data" ? (
        <>
          {fi(
            "From Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateFrom ?? ""}
              onChange={(e) => updateDraft({ dateFrom: e.target.value })}
            />,
          )}
          {fi(
            "To Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateTo ?? ""}
              onChange={(e) => updateDraft({ dateTo: e.target.value })}
            />,
          )}
          {fi(
            "FC Location",
            <select
              className={`${FI_INPUT} min-w-[160px]`}
              value={draft.fc ?? ""}
              onChange={(e) => updateDraft({ fc: e.target.value || undefined })}
            >
              <option value="">All FCs</option>
              {filterOptions.salesFc.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
        </>
      ) : null}

      {tab === "fba_receipts" ? (
        <>
          {fi(
            "Shipment ID",
            <select
              className={`${FI_INPUT} min-w-[180px]`}
              value={draft.shipmentId ?? ""}
              onChange={(e) =>
                updateDraft({ shipmentId: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {shipmentOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "Disposition",
            <select
              className={FI_INPUT}
              value={draft.disposition ?? ""}
              onChange={(e) =>
                updateDraft({ disposition: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["SELLABLE", "UNSELLABLE", "DAMAGED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "MSKU",
            <Input
              className={FI_INPUT}
              value={draft.msku ?? ""}
              onChange={(e) => updateDraft({ msku: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "customer_returns" ||
      tab === "reimbursements" ||
      tab === "replacements" ||
      tab === "gnr_report" ? (
        <>
          {fi(
            "From Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateFrom ?? ""}
              onChange={(e) => updateDraft({ dateFrom: e.target.value })}
            />,
          )}
          {fi(
            "To Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateTo ?? ""}
              onChange={(e) => updateDraft({ dateTo: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "customer_returns" ? (
        <>
          {fi(
            "Disposition",
            <select
              className={FI_INPUT}
              value={draft.disposition ?? ""}
              onChange={(e) =>
                updateDraft({ disposition: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["SELLABLE", "UNSELLABLE", "DAMAGED", "CUSTOMER_DAMAGED"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>,
          )}
        </>
      ) : null}

      {tab === "reimbursements" ? (
        <>
          {fi(
            "Reason",
            <select
              className={`${FI_INPUT} min-w-[160px]`}
              value={draft.reason ?? ""}
              onChange={(e) =>
                updateDraft({ reason: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {filterOptions.reimbReasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
        </>
      ) : null}

      {tab === "fba_removals" ? (
        <>
          {fi(
            "Order Status",
            <select
              className={FI_INPUT}
              value={draft.orderStatus ?? ""}
              onChange={(e) =>
                updateDraft({ orderStatus: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["Completed", "Cancelled", "Pending", "Processing"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "Disposition",
            <select
              className={FI_INPUT}
              value={draft.disposition ?? ""}
              onChange={(e) =>
                updateDraft({ disposition: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["SELLABLE", "UNSELLABLE", "DAMAGED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
          {fi(
            "MSKU",
            <Input
              className={FI_INPUT}
              value={draft.msku ?? ""}
              onChange={(e) => updateDraft({ msku: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "fc_transfers" ? (
        <>
          {fi(
            "From Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateFrom ?? ""}
              onChange={(e) => updateDraft({ dateFrom: e.target.value })}
            />,
          )}
          {fi(
            "To Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateTo ?? ""}
              onChange={(e) => updateDraft({ dateTo: e.target.value })}
            />,
          )}
          {fi(
            "Fulfillment Center",
            <select
              className={FI_INPUT}
              value={draft.fulfillmentCenter ?? ""}
              onChange={(e) =>
                updateDraft({
                  fulfillmentCenter: e.target.value || undefined,
                })
              }
            >
              <option value="">All</option>
              {filterOptions.transferFc.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
        </>
      ) : null}

      {tab === "shipment_status" ? (
        <>
          {fi(
            "Status",
            <select
              className={FI_INPUT}
              value={draft.shipmentStatus ?? ""}
              onChange={(e) =>
                updateDraft({ shipmentStatus: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["Closed", "Receiving", "Working", "Shipped"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
        </>
      ) : null}

      {tab === "fba_summary" ? (
        <>
          {fi(
            "Disposition",
            <select
              className={FI_INPUT}
              value={draft.disposition ?? ""}
              onChange={(e) =>
                updateDraft({ disposition: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {["SELLABLE", "UNSELLABLE", "DAMAGED", "RESEARCH", "DEFECTIVE"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>,
          )}
          {fi(
            "MSKU",
            <Input
              className={FI_INPUT}
              value={draft.msku ?? ""}
              onChange={(e) => updateDraft({ msku: e.target.value })}
            />,
          )}
          {fi(
            "FNSKU",
            <Input
              className={FI_INPUT}
              value={draft.fnsku ?? ""}
              onChange={(e) => updateDraft({ fnsku: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "adjustments" ? (
        <>
          {fi(
            "MSKU",
            <Input
              className={FI_INPUT}
              value={draft.msku ?? ""}
              onChange={(e) => updateDraft({ msku: e.target.value })}
            />,
          )}
          {fi(
            "Flag",
            <Input
              className={FI_INPUT}
              value={draft.flag ?? ""}
              onChange={(e) => updateDraft({ flag: e.target.value })}
            />,
          )}
          {fi(
            "Store",
            <Input
              className={FI_INPUT}
              value={draft.adjStore ?? ""}
              onChange={(e) => updateDraft({ adjStore: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {tab === "gnr_report" ? (
        <>
          {fi(
            "Unit Status",
            <select
              className={FI_INPUT}
              value={draft.unitStatus ?? ""}
              onChange={(e) =>
                updateDraft({ unitStatus: e.target.value || undefined })
              }
            >
              <option value="">All</option>
              {filterOptions.gnrUnitStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>,
          )}
        </>
      ) : null}

      {tab === "payment_repository" ? (
        <>
          {fi(
            "Settlement ID",
            <Input
              className={FI_INPUT}
              value={draft.settlementId ?? ""}
              onChange={(e) => updateDraft({ settlementId: e.target.value })}
            />,
          )}
          {fi(
            "Transaction Status",
            <Input
              className={FI_INPUT}
              value={draft.transactionStatus ?? ""}
              onChange={(e) =>
                updateDraft({ transactionStatus: e.target.value })
              }
            />,
          )}
          {fi(
            "From Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateFrom ?? ""}
              onChange={(e) => updateDraft({ dateFrom: e.target.value })}
            />,
          )}
          {fi(
            "To Date",
            <Input
              type="date"
              className={FI_INPUT}
              value={draft.dateTo ?? ""}
              onChange={(e) => updateDraft({ dateTo: e.target.value })}
            />,
          )}
        </>
      ) : null}

      {[
        "fba_receipts",
        "sales_data",
        "customer_returns",
        "reimbursements",
        "replacements",
        "gnr_report",
        "fc_transfers",
        "shipped_to_fba",
        "shipped_cost",
        "fba_removals",
        "shipment_status",
        "fba_summary",
        "payment_repository",
      ].includes(tab) &&
      tab !== "adjustments" ? (
        <>
          {fi(
            "Store",
            <Select
              value={draft.store?.trim() ? draft.store : "__all__"}
              onValueChange={(v) =>
                updateDraft({ store: v === "__all__" ? undefined : v })
              }
            >
              <SelectTrigger className={`${FI_INPUT} h-[30px]`}>
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All stores</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
        </>
      ) : null}

      {![
        "adjustments",
        "shipped_to_fba",
        "shipped_cost",
        "fba_receipts",
        "sales_data",
        "customer_returns",
        "reimbursements",
        "fba_removals",
        "fc_transfers",
        "shipment_status",
        "fba_summary",
        "replacements",
        "gnr_report",
        "payment_repository",
      ].includes(tab) ? null : (
        <>
          {fi(
            "Search",
            <Input
              className={`${FI_INPUT} min-w-[200px]`}
              placeholder={
                tab === "shipment_status"
                  ? "Shipment ID / name…"
                  : "Search…"
              }
              value={draft.search ?? ""}
              onChange={(e) => updateDraft({ search: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />,
          )}
        </>
      )}

      <div className="ml-auto flex gap-2 pb-0.5">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg bg-[#1a56db] text-xs font-semibold hover:bg-[#1447c0]"
          onClick={apply}
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[#c8cdd8] text-xs font-semibold"
          onClick={clear}
        >
          ✕ Clear
        </Button>
      </div>
    </div>
  );

  return (
    <main className="font-[family-name:var(--font-dm-sans)] mx-auto w-full max-w-[1600px] flex-1 px-4 py-0 sm:px-6 lg:px-8">
      <div className="sticky top-0 z-50 -mx-4 border-b border-[#e4e7ec] bg-[#f1f5f9]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#f1f5f9]/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex shrink-0 flex-col">
            <h2 className="text-lg font-bold leading-tight tracking-tight text-[#0f1117] sm:text-xl">
              Data Explorer
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#9ca3af]">
              Quick Jump
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {DATA_EXPLORER_TABS.map(({ id, label }) => {
              const active = id === tab;
              const count = counts[id] ?? 0;
              return (
                <button
                  key={`qj-${id}`}
                  type="button"
                  onClick={() =>
                    navigate({
                      tab: id,
                      page: 1,
                      filters: {},
                      salesView: id === "sales_data" ? salesView : "fnsku",
                      fbaView: id === "fba_summary" ? fbaView : "details",
                    })
                  }
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-[#1a56db] bg-[#1a56db] text-white shadow-[0_2px_8px_rgba(26,86,219,0.3)]"
                      : "border-[#d1d5db] bg-white text-[#6b7280] hover:border-[#1a56db] hover:bg-[#eff6ff] hover:text-[#1a56db]"
                  }`}
                >
                  {label}
                  <span
                    className={`font-[family-name:var(--font-dm-mono)] text-[10px] font-normal ${
                      active ? "opacity-90" : "text-[#9ca3af]"
                    }`}
                  >
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3 pb-8">
        <div className="flex flex-wrap items-start justify-end gap-3">
          {tab === "sales_data" ? (
            <div className="flex gap-0.5 rounded-[9px] border border-[#e4e7ec] bg-[#f1f5f9] p-0.5">
              <button
                type="button"
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
                  salesView === "fnsku"
                    ? "bg-white text-[#0f1117] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#9ca3af]"
                }`}
                onClick={() =>
                  navigate({ page: 1, salesView: "fnsku", fbaView })
                }
              >
                By FNSKU
              </button>
              <button
                type="button"
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
                  salesView === "asin"
                    ? "bg-white text-[#0f1117] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#9ca3af]"
                }`}
                onClick={() => navigate({ page: 1, salesView: "asin", fbaView })}
              >
                By ASIN
              </button>
            </div>
          ) : null}
          {tab === "fba_summary" ? (
            <div className="flex gap-0.5 rounded-[9px] border border-[#e4e7ec] bg-[#f1f5f9] p-0.5">
              <button
                type="button"
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
                  fbaView === "details"
                    ? "bg-white text-[#0f1117] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#9ca3af]"
                }`}
                onClick={() =>
                  navigate({ page: 1, fbaView: "details", salesView })
                }
              >
                Details
              </button>
              <button
                type="button"
                className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold ${
                  fbaView === "summary"
                    ? "bg-white text-[#0f1117] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[#9ca3af]"
                }`}
                onClick={() =>
                  navigate({ page: 1, fbaView: "summary", salesView })
                }
              >
                Summary
              </button>
            </div>
          ) : null}
        </div>

        {filterBar}
        <p className="text-xs text-[#9ca3af]">{lastLabel}</p>

        <SummaryCards summary={summary} />
        {summary.progressPct != null ? (
          <div className="mb-3 text-[11px] text-[#4b5563]">
            <div className="mb-1 font-semibold">{summary.progressLabel}</div>
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded bg-[#e4e7ec]">
              <div
                className="h-full rounded bg-[#1a56db]"
                style={{ width: `${Math.min(100, summary.progressPct)}%` }}
              />
            </div>
          </div>
        ) : null}
        <MiniTables summary={summary} />

        <DataTable
          columnSpecs={colSpecs}
          rows={rows}
          page={page}
          pageSize={pageSize}
          total={total}
          emptyMessage={emptyCopy}
          onPageChange={(nextPage) =>
            navigate({
              page: nextPage,
              filters,
              salesView,
              fbaView,
            })
          }
          onPageSizeChange={(nextSize) =>
            navigate({
              page: 1,
              pageSize: nextSize,
              filters,
              salesView,
              fbaView,
            })
          }
        />
      </div>
    </main>
  );
}
