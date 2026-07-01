"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

import {
  getFcByFcSummary,
  type FcByFcPayload,
} from "@/actions/fc-transfer-reconciliation";
import { HeaderActions } from "@/components/layout/header-actions";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/Pagination";
import {
  ColumnsMenu,
  useColumnVisibility,
} from "@/components/shared/columns-menu";
import { cn } from "@/lib/utils";
import type {
  FcByFcDetail,
  FcByFcRow,
  FcByFcStats,
} from "@/lib/fc-transfer-reconciliation/by-fc-types";
import { FcDetailModal } from "@/components/fc-transfer-reconciliation/by-fc/fc-detail-modal";

const EMPTY_STATS: FcByFcStats = {
  fcCount: 0,
  totalIn: 0,
  totalOut: 0,
  totalNet: 0,
  totalDamagedIn: 0,
  busiestFc: "",
  unknownDispositionQty: 0,
};

// Columns + the sort key each maps to. The default sort (volume desc) is what the
// lib already returns; the header toggles re-sort the rows client-side.
type SortKey =
  | "fc"
  | "mskuCount"
  | "events"
  | "inQty"
  | "outQty"
  | "netQty"
  | "volume"
  | "damageIntakePct";

export const FC_BY_FC_COLUMNS = [
  { id: "fc", label: "FC" },
  { id: "mskuCount", label: "# MSKUs" },
  { id: "events", label: "# Events" },
  { id: "inQty", label: "In" },
  { id: "outQty", label: "Out" },
  { id: "netQty", label: "Net" },
  { id: "volume", label: "Volume" },
  { id: "damageIntakePct", label: "Damaged In %" },
  { id: "span", label: "Span" },
] as const;

const SORTABLE: Record<string, SortKey | undefined> = {
  fc: "fc",
  mskuCount: "mskuCount",
  events: "events",
  inQty: "inQty",
  outQty: "outQty",
  netQty: "netQty",
  volume: "volume",
  damageIntakePct: "damageIntakePct",
};

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

export function FcByFcView({ viewSwitcher }: { viewSwitcher?: React.ReactNode }) {
  const [vis, setVis] = useColumnVisibility("fcTransferRecon.byFcCols", FC_BY_FC_COLUMNS);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [fc, setFc] = React.useState("");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);

  const [loading, setLoading] = React.useState(false);
  useTrackPending(loading);
  const [payload, setPayload] = React.useState<FcByFcPayload | null>(null);

  // Sort: default volume desc (busiest first — matches the lib's default order).
  const [sortKey, setSortKey] = React.useState<SortKey>("volume");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const [detailRow, setDetailRow] = React.useState<FcByFcRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFcByFcSummary({
        from: from || null,
        to: to || null,
        fc: fc || undefined,
        search: debouncedSearch || undefined,
      });
      setPayload(data);
    } finally {
      setLoading(false);
    }
  }, [from, to, fc, debouncedSearch]);

  // Lazy first-load (only on the By-FC path — this component mounts only when the
  // shell switches to ?view=fc, so the By-MSKU path never triggers this fetch).
  React.useEffect(() => {
    if (payload === null) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const detailsMap = React.useMemo(
    () => new Map<string, FcByFcDetail>(payload?.details ?? []),
    [payload],
  );

  const stats = payload?.stats ?? EMPTY_STATS;

  const sortedRows = React.useMemo(() => {
    const rows = (payload?.rows ?? []).slice();
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "fc") return a.fc.localeCompare(b.fc) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av !== bv) return (av - bv) * dir;
      // stable tiebreak: volume desc then FC asc (the lib's canonical order).
      if (a.volume !== b.volume) return b.volume - a.volume;
      return a.fc.localeCompare(b.fc);
    });
    return rows;
  }, [payload, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric columns default to desc (biggest first); FC defaults to asc.
      setSortDir(key === "fc" ? "asc" : "desc");
    }
  };

  function exportCsv() {
    const headers = [
      "FC", "# MSKUs", "# FNSKUs", "# Events",
      "In", "In Sellable", "In Unsellable",
      "Out", "Out Sellable", "Out Unsellable",
      "Net", "Volume", "Damaged In %", "Unknown Qty",
      "First Date", "Last Date",
    ];
    const dataRows = sortedRows.map((r) => [
      r.fc, r.mskuCount, r.fnskuCount, r.events,
      r.inQty, r.inSellable, r.inUnsellable,
      r.outQty, r.outSellable, r.outUnsellable,
      r.netQty, r.volume, (r.damageIntakePct * 100).toFixed(2), r.unknownQty,
      r.firstDate, r.lastDate,
    ]);
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const row of dataRows) lines.push(row.map(esc).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fc_transfer_by_fc.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  const show = (id: string) => vis?.[id] !== false;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <HeaderActions>
        {viewSwitcher}
        <ColumnsMenu columns={FC_BY_FC_COLUMNS} visibility={vis} onChange={setVis} />
        <Button variant="outline" size="sm" onClick={exportCsv}>⬇ Export CSV</Button>
        <Button variant="outline" size="sm" onClick={() => void reload()}>↻ Refresh</Button>
      </HeaderActions>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">By FC</h1>
        <p className="text-sm text-muted-foreground">
          FC-wise analysis summary — observable transfer flow per fulfillment center
          (descriptive, not reconciliation).
        </p>
      </div>

      <FilterBar
        from={from} setFrom={setFrom}
        to={to} setTo={setTo}
        fc={fc} setFc={setFc}
        search={search} setSearch={setSearch}
        onClear={() => { setFrom(""); setTo(""); setFc(""); setSearch(""); }}
      />

      {/* FC-flavored KPI cards. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="# FCs" border="slate" value={stats.fcCount.toLocaleString()} />
        <Card label="Total In" border="green" value={`+${stats.totalIn.toLocaleString()}`} />
        <Card label="Total Out" border="red" value={`-${stats.totalOut.toLocaleString()}`} />
        <Card
          label="Total Net" border="blue"
          value={(stats.totalNet > 0 ? "+" : "") + stats.totalNet.toLocaleString()}
        />
        <Card
          label="Damaged Received" border="rose"
          value={stats.totalDamagedIn.toLocaleString()}
          sub={stats.totalIn > 0 ? `${((stats.totalDamagedIn / stats.totalIn) * 100).toFixed(1)}% of in` : undefined}
        />
        <Card label="Busiest FC" border="violet" value={stats.busiestFc || "—"} mono />
      </div>

      {stats.unknownDispositionQty > 0 ? (
        <div>
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
            ⚠ {stats.unknownDispositionQty.toLocaleString()} units with unknown disposition (counted in In/Out totals only)
          </span>
        </div>
      ) : null}

      {loading || payload === null ? (
        <TableSkeleton rows={8} cols={7} />
      ) : sortedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <span className="text-3xl">🏬</span>
          <p className="text-sm font-semibold text-foreground">No FC activity</p>
          <p className="text-xs">No transfers match the current filters</p>
        </div>
      ) : (
        <ByFcTable
          rows={sortedRows}
          show={show}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          onDrill={(r) => { setDetailRow(r); setDetailOpen(true); }}
        />
      )}

      <FcDetailModal
        row={detailRow}
        detail={detailRow ? detailsMap.get(detailRow.fc) ?? null : null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

function ByFcTable({
  rows,
  show,
  sortKey,
  sortDir,
  onSort,
  onDrill,
}: {
  rows: FcByFcRow[];
  show: (id: string) => boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  onDrill: (r: FcByFcRow) => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  React.useEffect(() => { setPage(1); }, [rows, sortKey, sortDir]);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const SortHead = ({ id, label, align }: { id: string; label: string; align?: "right" }) => {
    const key = SORTABLE[id];
    const active = key && key === sortKey;
    return (
      <TableHead
        className={cn(
          "h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
          align === "right" && "text-right",
          key && "cursor-pointer select-none hover:text-slate-900",
        )}
        onClick={key ? () => onSort(key) : undefined}
      >
        <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
          {label}
          {key ? (
            active ? (
              sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
            ) : (
              <ChevronsUpDown className="size-3 text-slate-300" />
            )
          ) : null}
        </span>
      </TableHead>
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white">
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
            <TableRow>
              {show("fc") && <SortHead id="fc" label="FC" />}
              {show("mskuCount") && <SortHead id="mskuCount" label="# MSKUs" align="right" />}
              {show("events") && <SortHead id="events" label="# Events" align="right" />}
              {show("inQty") && <SortHead id="inQty" label="In (T/S/U)" align="right" />}
              {show("outQty") && <SortHead id="outQty" label="Out (T/S/U)" align="right" />}
              {show("netQty") && <SortHead id="netQty" label="Net" align="right" />}
              {show("volume") && <SortHead id="volume" label="Volume" align="right" />}
              {show("damageIntakePct") && <SortHead id="damageIntakePct" label="Damaged In %" align="right" />}
              {show("span") && <TableHead className="h-11 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Span</TableHead>}
              <TableHead className="h-11 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((r) => {
              const netCls = r.netQty > 0 ? "text-emerald-700" : r.netQty < 0 ? "text-red-600" : "text-muted-foreground";
              const netStr = (r.netQty > 0 ? "+" : "") + r.netQty;
              const dmgPct = r.damageIntakePct * 100;
              const dmgCls = dmgPct >= 10 ? "text-rose-700 font-bold" : dmgPct > 0 ? "text-amber-700 font-semibold" : "text-muted-foreground";
              return (
                <TableRow key={r.fc} className="hover:bg-slate-50">
                  {show("fc") && <TableCell className="font-mono text-[11px] font-semibold">{r.fc}</TableCell>}
                  {show("mskuCount") && <TableCell className="text-right font-mono text-[11px]">{r.mskuCount}</TableCell>}
                  {show("events") && <TableCell className="text-right font-mono text-[11px] text-muted-foreground">{r.events}</TableCell>}
                  {show("inQty") && (
                    <TableCell className="text-right font-mono text-[11px]">
                      <span className="font-bold text-emerald-700">+{r.inQty}</span>
                      <span className="ml-1 text-[9px] text-muted-foreground">S{r.inSellable}/U{r.inUnsellable}</span>
                    </TableCell>
                  )}
                  {show("outQty") && (
                    <TableCell className="text-right font-mono text-[11px]">
                      <span className="font-bold text-red-600">-{r.outQty}</span>
                      <span className="ml-1 text-[9px] text-muted-foreground">S{r.outSellable}/U{r.outUnsellable}</span>
                    </TableCell>
                  )}
                  {show("netQty") && <TableCell className={cn("text-right font-mono text-xs font-bold", netCls)}>{netStr}</TableCell>}
                  {show("volume") && <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{r.volume}</TableCell>}
                  {show("damageIntakePct") && (
                    <TableCell className={cn("text-right font-mono text-[11px]", dmgCls)}>
                      {dmgPct > 0 ? `${dmgPct.toFixed(1)}%` : "—"}
                    </TableCell>
                  )}
                  {show("span") && (
                    <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                      {r.firstDate || "—"} → {r.lastDate || "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onDrill(r)}
                      className="flex h-6 items-center gap-1 rounded bg-slate-700 px-2 text-[10px] font-bold text-white hover:bg-slate-800"
                      title="View FC detail"
                    >
                      <Search className="size-3" aria-hidden /> Detail
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalRows={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}

function FilterBar({
  from, setFrom, to, setTo, fc, setFc, search, setSearch, onClear,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  fc: string; setFc: (v: string) => void;
  search: string; setSearch: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-[11px] font-semibold text-muted-foreground">From</span>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">To</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
      <span className="text-[11px] font-semibold text-muted-foreground">FC</span>
      <Input value={fc} onChange={(e) => setFc(e.target.value)} placeholder="e.g. PHX7" className="h-8 w-[110px] text-xs" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 MSKU / FNSKU / ASIN"
        className="h-8 max-w-[260px] text-xs"
      />
      <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={onClear}>Clear</Button>
    </div>
  );
}

function Card({
  label, border, value, sub, mono,
}: {
  label: string;
  border: "blue" | "green" | "red" | "slate" | "rose" | "violet";
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  const b =
    border === "blue" ? "border-t-blue-600" :
    border === "green" ? "border-t-emerald-500" :
    border === "red" ? "border-t-red-500" :
    border === "rose" ? "border-t-rose-500" :
    border === "violet" ? "border-t-violet-500" : "border-t-slate-400";
  const c =
    border === "blue" ? "text-blue-600" :
    border === "green" ? "text-emerald-700" :
    border === "red" ? "text-red-600" :
    border === "rose" ? "text-rose-700" :
    border === "violet" ? "text-violet-700" : "text-slate-600";
  return (
    <div className={cn("flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm border-t-[3px]", b)}>
      <div className="mb-1 text-center text-[8.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-col items-center">
        <span className={cn("font-bold leading-none", mono ? "font-mono text-base" : "font-mono text-lg", c)}>{value}</span>
        {sub ? <span className="mt-0.5 text-[8px] text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}
