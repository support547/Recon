"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  getFeesReimbursementsData,
  getFeesReimbursementsInboundShipments,
  getFeesReimbursementsSettlementList,
  type FeesReimbDataPayload,
  type FeesReimbFilters,
  type FeesReimbLine,
  type FeesReimbSettlementListItem,
  type InboundShipmentPayload,
  type InboundShipmentRow,
} from "@/actions/fees-reimbursements";
import type {
  FeesReimbGroup,
  GroupAgg,
} from "@/lib/payment-reconciliation/fees-reimbursements";
import {
  SETTLEMENT_ACCOUNT_TYPES,
  SETTLEMENT_ACCOUNT_TYPE_LABELS,
  SETTLEMENT_STORES,
} from "@/lib/upload-report-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderActions } from "@/components/layout/header-actions";
import { cn } from "@/lib/utils";

type Tab = "ALL" | FeesReimbGroup;
type View = "details" | "summary";
type SummarySubView = "overview" | "inbound";

const ALL_SETTLEMENTS = "__all__";
const ALL_ACCOUNTS = "__all__";
const ALL_STORES = "__all__";

const GROUP_LABEL: Record<FeesReimbGroup, string> = {
  INBOUND: "Inbound & Carrier",
  REIMBURSEMENT: "Reimbursements",
  REVERSAL: "Reversals & Clawbacks",
  OTHER_FEE: "Other Fees",
  TAX_RETROCHARGE: "Tax True-ups",
  UNCATEGORIZED: "Uncategorized",
};

const SUMMARY_GROUP_ORDER: FeesReimbGroup[] = [
  "INBOUND",
  "REIMBURSEMENT",
  "REVERSAL",
  "OTHER_FEE",
  "TAX_RETROCHARGE",
];

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

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

type SortKey = "postedDate" | "settlementId" | "category" | "amount";

export function FeesReimbursementsClient({
  initialPayload,
  initialSettlements,
}: {
  initialPayload: FeesReimbDataPayload;
  initialSettlements: FeesReimbSettlementListItem[];
}) {
  const [view, setView] = React.useState<View>("details");
  const [tab, setTab] = React.useState<Tab>("ALL");
  const [accountType, setAccountType] = React.useState<string>(ALL_ACCOUNTS);
  const [store, setStore] = React.useState<string>(ALL_STORES);
  const [settlementId, setSettlementId] = React.useState<string>(ALL_SETTLEMENTS);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "postedDate",
    dir: "desc",
  });

  const [data, setData] = React.useState<FeesReimbDataPayload>(initialPayload);
  const [settlementList, setSettlementList] =
    React.useState<FeesReimbSettlementListItem[]>(initialSettlements);
  const [loading, setLoading] = React.useState(false);

  const [summarySubView, setSummarySubView] =
    React.useState<SummarySubView>("overview");
  const [inboundData, setInboundData] =
    React.useState<InboundShipmentPayload | null>(null);
  const [inboundLoading, setInboundLoading] = React.useState(false);

  const accountOrNull = accountType === ALL_ACCOUNTS ? null : accountType;
  const storeOrNull = store === ALL_STORES ? null : store;
  const settlementOrNull =
    settlementId === ALL_SETTLEMENTS ? null : settlementId;

  const filters = React.useMemo<FeesReimbFilters>(
    () => ({
      group: tab,
      accountType: accountOrNull,
      store: storeOrNull,
      settlementId: settlementOrNull,
      search: debouncedSearch || null,
    }),
    [tab, accountOrNull, storeOrNull, settlementOrNull, debouncedSearch],
  );

  // Refresh settlement dropdown when account/store change.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getFeesReimbursementsSettlementList({
          accountType: accountOrNull,
          store: storeOrNull,
        });
        if (cancelled) return;
        setSettlementList(next);
        if (
          settlementId !== ALL_SETTLEMENTS &&
          !next.some((s) => s.settlementId === settlementId)
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
  }, [accountOrNull, storeOrNull]);

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
        const next = await getFeesReimbursementsData(filters);
        if (cancelled) return;
        setData(next);
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Failed to load fees data.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  React.useEffect(() => {
    if (view !== "summary" || summarySubView !== "inbound") return;
    let cancelled = false;
    (async () => {
      setInboundLoading(true);
      try {
        const next = await getFeesReimbursementsInboundShipments({
          accountType: accountOrNull,
          store: storeOrNull,
          settlementId: settlementOrNull,
        });
        if (cancelled) return;
        setInboundData(next);
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error ? e.message : "Failed to load inbound shipments.",
        );
      } finally {
        if (!cancelled) setInboundLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    view,
    summarySubView,
    accountOrNull,
    storeOrNull,
    settlementOrNull,
  ]);

  const { summary, lines } = data;

  const allGroupsAgg = React.useMemo(() => {
    let lineCount = 0;
    let total = 0;
    for (const g of SUMMARY_GROUP_ORDER) {
      const grp = summary.groups[g];
      lineCount += grp.lineCount;
      total += grp.total;
    }
    return { lineCount, total };
  }, [summary]);

  const sortedLines = React.useMemo(() => {
    const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const cmpNum = (a: number, b: number) => a - b;
    const list = lines.slice();
    list.sort((a, b) => {
      let r = 0;
      switch (sort.key) {
        case "postedDate":
          r = cmpStr(a.postedDate ?? "", b.postedDate ?? "");
          break;
        case "settlementId":
          r = cmpStr(a.settlementId ?? "", b.settlementId ?? "");
          break;
        case "category":
          r = cmpStr(a.category, b.category);
          break;
        case "amount":
          r = cmpNum(a.amount, b.amount);
          break;
      }
      return sort.dir === "asc" ? r : -r;
    });
    return list;
  }, [lines, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedLines.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLines = sortedLines.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const colTotals = React.useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const l of sortedLines) {
      qty += l.quantityPurchased ?? 0;
      amount += l.amount;
    }
    return { qty, amount };
  }, [sortedLines]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

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
            Fees &amp; Reimbursements
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Settlement charges that aren&apos;t Orders or Refunds — inbound,
            reimbursements, reversals, fees, and tax true-ups. Posted-date driven.
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
                <SelectItem key={s.settlementId} value={s.settlementId}>
                  {s.settlementId}
                  {s.startDate ? ` · ${s.startDate}` : ""}
                  {s.endDate ? ` → ${s.endDate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 description / SKU / shipment"
            className="h-8 w-[240px] text-xs"
          />
        </div>
      </header>

      {summary.uncategorizedDescriptions.length > 0 ? (
        <UncategorizedWarning
          group={summary.groups.UNCATEGORIZED}
          descriptions={summary.uncategorizedDescriptions}
        />
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <GroupKpiCard
          label="Total"
          tone="total"
          lineCount={allGroupsAgg.lineCount}
          total={allGroupsAgg.total}
          active={tab === "ALL"}
          onClick={() => setTab("ALL")}
        />
        <GroupKpiCard
          label={GROUP_LABEL.INBOUND}
          tone="neutral"
          lineCount={summary.groups.INBOUND.lineCount}
          total={summary.groups.INBOUND.total}
          active={tab === "INBOUND"}
          onClick={() => setTab("INBOUND")}
        />
        <GroupKpiCard
          label={GROUP_LABEL.REIMBURSEMENT}
          tone="green"
          lineCount={summary.groups.REIMBURSEMENT.lineCount}
          total={summary.groups.REIMBURSEMENT.total}
          active={tab === "REIMBURSEMENT"}
          onClick={() => setTab("REIMBURSEMENT")}
        />
        <GroupKpiCard
          label={GROUP_LABEL.REVERSAL}
          tone="red"
          lineCount={summary.groups.REVERSAL.lineCount}
          total={summary.groups.REVERSAL.total}
          active={tab === "REVERSAL"}
          onClick={() => setTab("REVERSAL")}
        />
        <GroupKpiCard
          label={GROUP_LABEL.OTHER_FEE}
          tone="neutral"
          lineCount={summary.groups.OTHER_FEE.lineCount}
          total={summary.groups.OTHER_FEE.total}
          active={tab === "OTHER_FEE"}
          onClick={() => setTab("OTHER_FEE")}
        />
      </section>

      {view === "summary" ? (
        <SummaryView
          summary={summary}
          loading={loading}
          subView={summarySubView}
          onSubViewChange={setSummarySubView}
          inboundData={inboundData}
          inboundLoading={inboundLoading}
        />
      ) : loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DetailsTable
          lines={pagedLines}
          totalLines={sortedLines.length}
          colTotals={colTotals}
          page={safePage}
          pageSize={pageSize}
          totalPages={totalPages}
          sort={sort}
          onToggleSort={toggleSort}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}
    </main>
  );
}

type CardTone = "total" | "green" | "red" | "neutral";

function GroupKpiCard({
  label,
  tone,
  lineCount,
  total,
  active,
  onClick,
}: {
  label: string;
  tone: CardTone;
  lineCount: number;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  const borderTop =
    tone === "total"
      ? "border-t-slate-700"
      : tone === "green"
        ? "border-t-emerald-500"
        : tone === "red"
          ? "border-t-red-500"
          : "border-t-slate-400";

  const totalColor =
    tone === "green"
      ? total < 0
        ? "text-red-600"
        : "text-emerald-700"
      : tone === "red"
        ? "text-red-600"
        : total < 0
          ? "text-red-600"
          : tone === "total"
            ? "text-slate-900"
            : "text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition border-t-[3px]",
        borderTop,
        tone === "total" ? "ring-1 ring-slate-100" : null,
        active
          ? "ring-2 ring-blue-300"
          : "hover:border-slate-300",
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-lg font-bold leading-tight tabular-nums", totalColor)}>
        {money(total)}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {num(lineCount)}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
          Lines
        </span>
      </div>
    </button>
  );
}

function UncategorizedWarning({
  group,
  descriptions,
}: {
  group: GroupAgg;
  descriptions: string[];
}) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-700" />
        <span className="font-semibold">
          {num(group.lineCount)} uncategorized charge lines ({money(group.total)})
        </span>
      </div>
      <div className="mt-1.5 text-xs text-amber-900/80">
        New <code className="font-mono">amountDescription</code> values not yet mapped
        — add them to <code className="font-mono">classifyChargeLine</code>:
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {descriptions.map((d) => (
          <li
            key={d}
            className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-mono text-[11px] text-amber-900"
          >
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailsTable({
  lines,
  totalLines,
  colTotals,
  page,
  pageSize,
  totalPages,
  sort,
  onToggleSort,
  onPageChange,
  onPageSizeChange,
}: {
  lines: FeesReimbLine[];
  totalLines: number;
  colTotals: { qty: number; amount: number };
  page: number;
  pageSize: number;
  totalPages: number;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggleSort: (k: SortKey) => void;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  return (
    <>
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
          <table className="min-w-max text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
              <tr>
                <HeadCell sortKey="settlementId" sort={sort} onToggle={onToggleSort}>
                  Settlement
                </HeadCell>
                <HeadCell>Account</HeadCell>
                <HeadCell>Store</HeadCell>
                <HeadCell sortKey="postedDate" sort={sort} onToggle={onToggleSort}>
                  Posted
                </HeadCell>
                <HeadCell sortKey="category" sort={sort} onToggle={onToggleSort}>
                  Category
                </HeadCell>
                <HeadCell>Description</HeadCell>
                <HeadCell>SKU</HeadCell>
                <HeadCell>Shipment ID</HeadCell>
                <HeadCell align="right" total={colTotals.qty} totalKind="num">
                  Qty
                </HeadCell>
                <HeadCell
                  align="right"
                  total={colTotals.amount}
                  totalKind="money"
                  sortKey="amount"
                  sort={sort}
                  onToggle={onToggleSort}
                >
                  Amount
                </HeadCell>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No lines match the current filters.
                  </td>
                </tr>
              ) : (
                lines.map((l) => <LineRow key={l.id} row={l} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {totalLines.toLocaleString()} rows · Page {page} of {totalPages}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map((n) => (
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
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          >
            First
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            Last
          </Button>
        </div>
      </div>
    </>
  );
}

function LineRow({ row }: { row: FeesReimbLine }) {
  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">
        {row.settlementId || "—"}
      </td>
      <td className="px-2 py-1.5 text-[10px]">{accountLabel(row.accountType)}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.store || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">
        {row.postedDate || "—"}
      </td>
      <td className="px-2 py-1.5 text-[10px]">
        <span className="rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono">
          {row.category || "—"}
        </span>
      </td>
      <td className="px-2 py-1.5 text-[10px]">{row.amountDescription || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.sku || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">
        {row.shipmentId || "—"}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {row.quantityPurchased ?? "—"}
      </td>
      <td
        className={cn(
          "px-2 py-1.5 text-right font-mono tabular-nums font-semibold",
          moneyClass(row.amount),
        )}
      >
        {money(row.amount)}
      </td>
    </tr>
  );
}

function HeadCell({
  align = "left",
  children,
  total,
  totalKind,
  sortKey,
  sort,
  onToggle,
}: {
  align?: "left" | "right" | "center";
  children: React.ReactNode;
  total?: unknown;
  totalKind?: "num" | "money";
  sortKey?: SortKey;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onToggle?: (k: SortKey) => void;
}) {
  const totalText =
    total === undefined || total === null
      ? null
      : totalKind === "money"
        ? money(total)
        : num(total);
  const totalCls =
    Number(total) === 0 ? "text-muted-foreground" : "text-blue-800";

  const isSortable = !!sortKey && !!sort && !!onToggle;
  const isActive = isSortable && sort!.key === sortKey;

  const label = isSortable ? (
    <button
      type="button"
      onClick={() => onToggle!(sortKey!)}
      className={cn(
        "inline-flex items-center gap-0.5 font-bold uppercase tracking-wide",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
      {isActive ? (
        <span className="text-[9px]">{sort!.dir === "asc" ? "▲" : "▼"}</span>
      ) : null}
    </button>
  ) : (
    <span className="text-muted-foreground">{children}</span>
  );

  return (
    <th
      className={cn(
        "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wide",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          align === "right"
            ? "items-end"
            : align === "center"
              ? "items-center"
              : "items-start",
        )}
      >
        {label}
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

function SummaryView({
  summary,
  loading,
  subView,
  onSubViewChange,
  inboundData,
  inboundLoading,
}: {
  summary: FeesReimbDataPayload["summary"];
  loading: boolean;
  subView: SummarySubView;
  onSubViewChange: (s: SummarySubView) => void;
  inboundData: InboundShipmentPayload | null;
  inboundLoading: boolean;
}) {
  const subOptions: Array<{ value: SummarySubView; label: string }> = [
    { value: "overview", label: "Overview" },
    { value: "inbound", label: "Inbound" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          {subOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition",
                subView === opt.value
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => onSubViewChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {subView === "overview" ? (
        <SummaryOverview summary={summary} loading={loading} />
      ) : (
        <InboundShipmentsTable data={inboundData} loading={inboundLoading} />
      )}
    </div>
  );
}

function SummaryOverview({
  summary,
  loading,
}: {
  summary: FeesReimbDataPayload["summary"];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      {SUMMARY_GROUP_ORDER.map((g) => (
        <GroupSection key={g} group={summary.groups[g]} />
      ))}
      {summary.groups.UNCATEGORIZED.lineCount > 0 ? (
        <GroupSection group={summary.groups.UNCATEGORIZED} />
      ) : null}
      <TaxFootnote group={summary.groups.TAX_RETROCHARGE} />
    </div>
  );
}

type InboundSortKey = "shipmentId" | "dateFrom" | "total" | string;

function InboundShipmentsTable({
  data,
  loading,
}: {
  data: InboundShipmentPayload | null;
  loading: boolean;
}) {
  const [sort, setSort] = React.useState<{
    key: InboundSortKey;
    dir: "asc" | "desc";
  }>({ key: "total", dir: "desc" });

  if (loading || !data) return <Skeleton className="h-96 w-full" />;

  const { shipments, chargeTypes } = data;

  const sorted = shipments.slice().sort((a, b) => {
    let r = 0;
    const key = sort.key;
    if (key === "shipmentId") {
      r = a.shipmentId.localeCompare(b.shipmentId);
    } else if (key === "dateFrom") {
      r = (a.dateFrom ?? "").localeCompare(b.dateFrom ?? "");
    } else if (key === "total") {
      r = a.total - b.total;
    } else {
      // charge-type column
      const av = a.amountsByType[key] ?? 0;
      const bv = b.amountsByType[key] ?? 0;
      r = av - bv;
    }
    return sort.dir === "asc" ? r : -r;
  });

  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const t of chargeTypes) colTotals[t] = 0;
  for (const s of sorted) {
    for (const t of chargeTypes) {
      colTotals[t] += s.amountsByType[t] ?? 0;
    }
    grandTotal += s.total;
  }

  const toggleSort = (key: InboundSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-foreground">
          {num(shipments.length)} unique shipments
        </span>
        <span className="text-muted-foreground">
          Net inbound spend{" "}
          <span className={cn("font-mono font-semibold", moneyClass(grandTotal))}>
            {money(grandTotal)}
          </span>
        </span>
      </div>
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
          <table className="min-w-max text-xs whitespace-nowrap">
            <thead className="sticky top-0 z-10 border-b border-border bg-slate-50">
              <tr>
                <InboundHeadCell
                  active={sort.key === "shipmentId"}
                  dir={sort.dir}
                  onClick={() => toggleSort("shipmentId")}
                >
                  Shipment ID
                </InboundHeadCell>
                <InboundHeadCell
                  active={sort.key === "dateFrom"}
                  dir={sort.dir}
                  onClick={() => toggleSort("dateFrom")}
                >
                  From – To
                </InboundHeadCell>
                {chargeTypes.map((t) => (
                  <InboundHeadCell
                    key={t}
                    align="right"
                    active={sort.key === t}
                    dir={sort.dir}
                    onClick={() => toggleSort(t)}
                    total={colTotals[t]}
                  >
                    {t}
                  </InboundHeadCell>
                ))}
                <InboundHeadCell
                  align="right"
                  active={sort.key === "total"}
                  dir={sort.dir}
                  onClick={() => toggleSort("total")}
                  total={grandTotal}
                >
                  Total
                </InboundHeadCell>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + chargeTypes.length + 1}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No inbound shipments under current filters.
                  </td>
                </tr>
              ) : (
                sorted.map((s) => (
                  <InboundRow
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
                  <td className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wide">
                    Totals
                  </td>
                  <td className="px-2 py-2"></td>
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
                      moneyClass(grandTotal),
                    )}
                  >
                    {money(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}

function InboundRow({
  row,
  chargeTypes,
}: {
  row: InboundShipmentRow;
  chargeTypes: string[];
}) {
  const dateLabel =
    row.dateFrom && row.dateTo && row.dateFrom !== row.dateTo
      ? `${row.dateFrom} → ${row.dateTo}`
      : row.dateFrom ?? row.dateTo ?? "—";

  return (
    <tr className="border-b border-border/50 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-mono text-[10px]">{row.shipmentId}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
        {dateLabel}
      </td>
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
          moneyClass(row.total),
        )}
      >
        {money(row.total)}
      </td>
    </tr>
  );
}

function InboundHeadCell({
  children,
  align = "left",
  active,
  dir,
  onClick,
  total,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  total?: number;
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

function TaxFootnote({ group }: { group: GroupAgg }) {
  if (group.lineCount === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <span className="font-semibold">Tax true-ups:</span>{" "}
      <span className="font-mono">{money(group.total)}</span>{" "}
      <span className="text-muted-foreground">
        ({num(group.lineCount)} lines · should net to ~$0)
      </span>
    </div>
  );
}

function GroupSection({ group }: { group: GroupAgg }) {
  const label = GROUP_LABEL[group.group];
  if (group.lineCount === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{label}</h3>
          <span className="text-xs text-muted-foreground">No lines</span>
        </header>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {num(group.lineCount)} lines
          </span>
          <span
            className={cn("font-mono text-sm font-semibold", moneyClass(group.total))}
          >
            {money(group.total)}
          </span>
        </div>
      </header>
      <table className="w-full caption-bottom text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </th>
            <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lines
            </th>
            <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {group.categories.map((c) => (
            <tr key={c.category} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-mono">{c.category || "(empty)"}</td>
              <td className="px-3 py-1.5 text-right font-mono">{num(c.lineCount)}</td>
              <td
                className={cn(
                  "px-3 py-1.5 text-right font-mono",
                  moneyClass(c.total),
                )}
              >
                {money(c.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
