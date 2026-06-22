"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getInboundReconData,
  type InboundReconPayload,
  type InboundReconRow,
} from "@/actions/inbound-recon";
import { SETTLEMENT_STORES } from "@/lib/upload-report-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ALL_STORES = "__all__";

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

type ReconSortKey =
  | "shipmentId"
  | "createDate"
  | "closeDate"
  | "totalSkus"
  | "unitsExpected"
  | "unitsLocated"
  | "status"
  | "totalCharges"
  | string;

export function InboundReconClient({
  initialPayload,
}: {
  initialPayload: InboundReconPayload;
}) {
  const [store, setStore] = React.useState<string>(ALL_STORES);
  const [data, setData] = React.useState<InboundReconPayload>(initialPayload);
  const [loading, setLoading] = React.useState(false);

  const storeOrNull = store === ALL_STORES ? null : store;

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const next = await getInboundReconData({ store: storeOrNull });
        if (cancelled) return;
        setData(next);
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error
            ? e.message
            : "Failed to load inbound reconciliation.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeOrNull]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Inbound Reconciliation
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Shipped to FBA universe joined to Shipment Status and inbound
            settlement charges per shipment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            Store
          </span>
          <Select value={store} onValueChange={setStore}>
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
        </div>
      </header>

      <InboundReconTable data={data} loading={loading} />
    </main>
  );
}

function InboundReconTable({
  data,
  loading,
}: {
  data: InboundReconPayload;
  loading: boolean;
}) {
  const [sort, setSort] = React.useState<{
    key: ReconSortKey;
    dir: "asc" | "desc";
  }>({ key: "createDate", dir: "desc" });

  const { rows, chargeTypes, kpis, unmatchedChargeCount, unmatchedChargeAmount } =
    data;

  const sorted = React.useMemo(() => {
    const list = rows.slice();
    list.sort((a, b) => {
      let r = 0;
      const k = sort.key;
      if (k === "shipmentId") r = a.shipmentId.localeCompare(b.shipmentId);
      else if (k === "createDate")
        r = (a.createDate ?? "").localeCompare(b.createDate ?? "");
      else if (k === "closeDate")
        r = (a.closeDate ?? "").localeCompare(b.closeDate ?? "");
      else if (k === "totalSkus")
        r = (a.totalSkus ?? -1) - (b.totalSkus ?? -1);
      else if (k === "unitsExpected")
        r = (a.unitsExpected ?? -1) - (b.unitsExpected ?? -1);
      else if (k === "unitsLocated")
        r = (a.unitsLocated ?? -1) - (b.unitsLocated ?? -1);
      else if (k === "status")
        r = (a.status ?? "").localeCompare(b.status ?? "");
      else if (k === "totalCharges") r = a.totalCharges - b.totalCharges;
      else {
        r = (a.amountsByType[k] ?? 0) - (b.amountsByType[k] ?? 0);
      }
      return sort.dir === "asc" ? r : -r;
    });
    return list;
  }, [rows, sort]);

  const colTotals: Record<string, number> = {};
  for (const t of chargeTypes) colTotals[t] = 0;
  let totalChargesSum = 0;
  for (const s of sorted) {
    for (const t of chargeTypes) colTotals[t] += s.amountsByType[t] ?? 0;
    totalChargesSum += s.totalCharges;
  }

  const toggleSort = (key: ReconSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ReconKpiCard
          label="# Shipments"
          value={num(kpis.shipments)}
          tone="neutral"
        />
        <ReconKpiCard
          label="Total Inbound Charges"
          value={money(kpis.totalCharges)}
          tone={kpis.totalCharges < 0 ? "red" : "green"}
        />
        <ReconKpiCard
          label="Shipments Charged"
          value={num(kpis.shipmentsCharged)}
          tone="neutral"
        />
        <ReconKpiCard
          label="Shipments Not Charged"
          value={num(kpis.shipmentsNotCharged)}
          tone={kpis.shipmentsNotCharged > 0 ? "amber" : "neutral"}
        />
        <ReconKpiCard
          label="Shipments With Shortage"
          value={num(kpis.shipmentsWithShortage)}
          tone={kpis.shipmentsWithShortage > 0 ? "red" : "neutral"}
        />
      </section>

      {unmatchedChargeCount > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">{num(unmatchedChargeCount)}</span>{" "}
          inbound charges totaling{" "}
          <span className="font-mono font-semibold">
            {money(unmatchedChargeAmount)}
          </span>{" "}
          reference shipments not present in Shipped to FBA (under the current
          store filter).
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
            <table className="min-w-max text-xs whitespace-nowrap">
              <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
                <tr>
                  <ReconHeadCell
                    active={sort.key === "shipmentId"}
                    dir={sort.dir}
                    onClick={() => toggleSort("shipmentId")}
                  >
                    Shipment ID
                  </ReconHeadCell>
                  <ReconHeadCell
                    active={sort.key === "createDate"}
                    dir={sort.dir}
                    onClick={() => toggleSort("createDate")}
                  >
                    Create Date
                  </ReconHeadCell>
                  <ReconHeadCell
                    active={sort.key === "closeDate"}
                    dir={sort.dir}
                    onClick={() => toggleSort("closeDate")}
                  >
                    Close Date
                  </ReconHeadCell>
                  <ReconHeadCell
                    align="right"
                    active={sort.key === "totalSkus"}
                    dir={sort.dir}
                    onClick={() => toggleSort("totalSkus")}
                  >
                    # MSKUs
                  </ReconHeadCell>
                  <ReconHeadCell
                    align="right"
                    active={sort.key === "unitsExpected"}
                    dir={sort.dir}
                    onClick={() => toggleSort("unitsExpected")}
                  >
                    Total Qty
                  </ReconHeadCell>
                  <ReconHeadCell
                    align="right"
                    active={sort.key === "unitsLocated"}
                    dir={sort.dir}
                    onClick={() => toggleSort("unitsLocated")}
                  >
                    Units Located
                  </ReconHeadCell>
                  <ReconHeadCell
                    active={sort.key === "status"}
                    dir={sort.dir}
                    onClick={() => toggleSort("status")}
                  >
                    Status
                  </ReconHeadCell>
                  {chargeTypes.map((t) => (
                    <ReconHeadCell
                      key={t}
                      align="right"
                      active={sort.key === t}
                      dir={sort.dir}
                      onClick={() => toggleSort(t)}
                      money={colTotals[t]}
                    >
                      {t}
                    </ReconHeadCell>
                  ))}
                  <ReconHeadCell
                    align="right"
                    active={sort.key === "totalCharges"}
                    dir={sort.dir}
                    onClick={() => toggleSort("totalCharges")}
                    money={totalChargesSum}
                  >
                    Total Charges
                  </ReconHeadCell>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + chargeTypes.length + 1}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No shipments in universe under current filters.
                    </td>
                  </tr>
                ) : (
                  sorted.map((s) => (
                    <InboundReconRowView
                      key={s.shipmentId}
                      row={s}
                      chargeTypes={chargeTypes}
                    />
                  ))
                )}
              </tbody>
              {sorted.length > 0 ? (
                <tfoot className="border-t border-border bg-slate-50">
                  <tr>
                    <td
                      className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide"
                      colSpan={7}
                    >
                      Totals
                    </td>
                    {chargeTypes.map((t) => (
                      <td
                        key={t}
                        className={cn(
                          "px-2 py-2 text-right font-mono tabular-nums font-semibold",
                          moneyClass(colTotals[t]),
                        )}
                      >
                        {money(colTotals[t])}
                      </td>
                    ))}
                    <td
                      className={cn(
                        "px-2 py-2 text-right font-mono tabular-nums font-bold",
                        moneyClass(totalChargesSum),
                      )}
                    >
                      {money(totalChargesSum)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InboundReconRowView({
  row,
  chargeTypes,
}: {
  row: InboundReconRow;
  chargeTypes: string[];
}) {
  const shortage = row.hasShortage;
  return (
    <tr
      className={cn(
        "border-b border-border/50 hover:bg-slate-50",
        shortage ? "bg-amber-50/40" : null,
      )}
    >
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.shipmentId}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
        {row.createDate ?? "—"}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
        {row.closeDate ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.totalSkus ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.unitsExpected ?? "—"}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right font-mono tabular-nums",
          shortage ? "text-amber-700 font-semibold" : null,
        )}
      >
        {row.unitsLocated ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-[10px]">{row.status ?? "—"}</td>
      {chargeTypes.map((t) => {
        const v = row.amountsByType[t];
        if (v === undefined) {
          return (
            <td
              key={t}
              className="px-2 py-1.5 text-right font-mono text-slate-300"
            >
              —
            </td>
          );
        }
        return (
          <td
            key={t}
            className={cn(
              "px-2 py-1.5 text-right font-mono tabular-nums",
              moneyClass(v),
            )}
          >
            {money(v)}
          </td>
        );
      })}
      <td
        className={cn(
          "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
          moneyClass(row.totalCharges),
        )}
      >
        {row.hasCharges ? money(row.totalCharges) : "—"}
      </td>
    </tr>
  );
}

function ReconHeadCell({
  children,
  align = "left",
  active,
  dir,
  onClick,
  money: total,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  money?: number;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wide",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          align === "right" ? "items-end" : "items-start",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-0.5 font-bold uppercase tracking-wide",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {children}
          {active ? (
            <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>
          ) : null}
        </button>
        {total !== undefined ? (
          <span
            className={cn(
              "mt-0.5 font-mono text-[10px] font-semibold normal-case tracking-normal",
              total === 0 ? "text-muted-foreground" : "text-blue-800",
            )}
          >
            {money(total)}
          </span>
        ) : null}
      </div>
    </th>
  );
}

function ReconKpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: "neutral" | "green" | "red" | "amber";
}) {
  const border =
    tone === "green"
      ? "border-t-emerald-500"
      : tone === "red"
        ? "border-t-red-500"
        : tone === "amber"
          ? "border-t-amber-500"
          : "border-t-slate-400";
  const valueColor =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-600"
        : tone === "amber"
          ? "text-amber-700"
          : "text-foreground";
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm border-t-[3px]",
        border,
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-bold leading-tight tabular-nums",
          valueColor,
        )}
      >
        {value}
      </div>
    </div>
  );
}
