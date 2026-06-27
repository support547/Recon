"use client";

import * as React from "react";
import { FileText, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  getGnrReconV2Data,
  type GnrReconV2Payload,
} from "@/actions/gnr-reconciliation-v2";
import { HeaderActions } from "@/components/layout/header-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/shared/loading-skeletons";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/gnr-reconciliation/shared/status-badge";
import {
  GnrV2StatusBadge,
  GNR_V2_STATUS_LABEL,
  GNR_V2_STATUS_SHORT,
  GNR_V2_GROUP_META,
  GNR_V2_GROUP_BORDER,
} from "@/components/gnr-reconciliation/fba-recon-tab/status-badge-v2";
import { GNR_V2_ACTION_GROUPS, aggregateAsinRows } from "@/lib/gnr-reconciliation/v2/formula";
import { ColumnsMenu, useColumnVisibility } from "@/components/shared/columns-menu";
import { CellHoverPopover, CellHoverRow } from "@/components/shared/cell-hover-popover";
import { RemarksCell } from "@/components/shared/remarks-cell";
import { Pagination } from "@/components/shared/Pagination";
import { RaiseCaseModalV2 } from "@/components/gnr-reconciliation/fba-recon-tab/modals/raise-case-modal-v2";
import { AdjustModalV2 } from "@/components/gnr-reconciliation/fba-recon-tab/modals/adjust-modal-v2";
import { AsinDetailSheet } from "@/components/gnr-reconciliation/fba-recon-tab/asin-detail-sheet";
import { Eye } from "lucide-react";
import type {
  GnrV2ActionGroup,
  GnrV2AsinRow,
  GnrV2Row,
  GnrV2Status,
} from "@/lib/gnr-reconciliation/v2/types";

/** Statuses that represent an unreconciled row needing a case / adjustment. */
const NEEDS_ACTION_STATUS = new Set<GnrV2Row["status"]>([
  "claim-inbound",
  "take-action",
  "over-accounted",
  "review",
  "no-snapshot",
]);

const ALL = "__all__";

export const GNR_V2_COLUMNS = [
  { id: "gnr_date", label: "GNR Date" },
  { id: "used_msku", label: "Used MSKU" },
  { id: "used_fnsku", label: "Used FNSKU" },
  { id: "orig_fnsku", label: "Orig FNSKU" },
  { id: "asin", label: "ASIN" },
  { id: "condition", label: "Condition" },
  { id: "gnr_succeeded", label: "Succ" },
  { id: "gnr_failed", label: "Fail" },
  { id: "expected_in", label: "Exp In" },
  { id: "gnr_in", label: "Actual" },
  { id: "inbound_gap", label: "Gap" },
  { id: "sales", label: "Sales" },
  { id: "returns", label: "Returns" },
  { id: "removals", label: "Removals" },
  { id: "reimb_qty", label: "Reimb Qty" },
  { id: "adj", label: "Manual Adj" },
  { id: "case_appr", label: "Case Qty" },
  { id: "computed_end", label: "Computed End" },
  { id: "ledger_end", label: "Ledger End" },
  { id: "wh_events", label: "W/H Events" },
  { id: "adjustments", label: "Ledger Adj" },
  { id: "status", label: "Status" },
  { id: "days", label: "Days" },
  { id: "remarks", label: "Remarks" },
  { id: "actions", label: "Action" },
] as const;

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

/** Unified client filter: everything, one action group, or one granular status. */
type ClientFilter =
  | { kind: "all" }
  | { kind: "group"; group: GnrV2ActionGroup }
  | { kind: "status"; status: GnrV2Status };

/** Encode a ClientFilter as a single Select value string (and back). */
const GROUP_PREFIX = "group:";
function filterToSelectValue(f: ClientFilter): string {
  if (f.kind === "all") return ALL;
  if (f.kind === "group") return `${GROUP_PREFIX}${f.group}`;
  return f.status;
}
function selectValueToFilter(v: string): ClientFilter {
  if (v === ALL) return { kind: "all" };
  if (v.startsWith(GROUP_PREFIX)) {
    return { kind: "group", group: v.slice(GROUP_PREFIX.length) as GnrV2ActionGroup };
  }
  return { kind: "status", status: v as GnrV2Status };
}
/** True when a row passes the active client filter. */
function rowMatchesFilter(r: GnrV2Row, f: ClientFilter): boolean {
  if (f.kind === "all") return true;
  if (f.kind === "group") return r.actionGroup === f.group;
  return r.status === f.status;
}

// Columns with a clickable column-total in the header (mirrors Replacement Recon):
// each total sums the column over the card-scoped rows, and clicking it narrows
// to rows with a non-zero value in that column (multi-select, AND predicate).
type QtyCol =
  | "gnr_succeeded"
  | "gnr_failed"
  | "expected_in"
  | "gnr_in"
  | "inbound_gap"
  | "sales"
  | "returns"
  | "removals"
  | "wh_events"
  | "adjustments"
  | "reimb_qty"
  | "adj"
  | "case_appr";

// SIGNED display accessor. The Computed-End contributors read the row's SIGNED
// display fields verbatim (the single source of truth set in formula.ts) — no
// sign is re-applied here, so the column total can never drift from
// computedEnding. The non-zero filter predicate is sign-agnostic, so signing
// these does not change which rows a click selects.
const QTY_ACCESSOR: Record<QtyCol, (r: GnrV2Row) => number> = {
  gnr_succeeded: (r) => r.succeededQty,
  gnr_failed: (r) => r.failedQty,
  expected_in: (r) => r.expectedInQty,
  gnr_in: (r) => r.actualIn,
  inbound_gap: (r) => r.inboundGap,
  sales: (r) => r.salesSigned,
  returns: (r) => r.returnsSigned,
  removals: (r) => r.removalsSigned,
  wh_events: (r) => r.whEventsSigned,
  adjustments: (r) => r.ledgerAdjSigned,
  reimb_qty: (r) => r.reimbSigned,
  adj: (r) => r.adjSigned,
  case_appr: (r) => r.caseClaimedQty, // raised (claimed) qty — shown immediately
};

// Computed-End component columns — these signed totals sum to the Computed End
// header total (asserted in formula.test.ts). W/H Events, Ledger Adj, Case Appr
// and gap are NOT components.
const COMPUTED_END_COLS: QtyCol[] = [
  "gnr_in",
  "sales",
  "returns",
  "removals",
  "reimb_qty",
  "adj",
];

const QTY_COLS = Object.keys(QTY_ACCESSOR) as QtyCol[];

function isQtyCol(id: string): id is QtyCol {
  return id in QTY_ACCESSOR;
}

/** Render a signed integer with an explicit + / − (0 stays "0"). */
function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/**
 * The Computed-End equation for a row using its signed fields:
 * Actual In − Sales + Returns − Removals − Reimb Qty ± Manual Adj.
 * W/H Events / Ledger Adj / Case are NOT part of the sum. The sum is
 * computedEnding by construction (formula.ts). First term unsigned; the rest
 * carry an operator.
 */
function computedEndEquation(r: GnrV2Row): string {
  const term = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);
  return (
    `${r.actualIn} ${term(r.salesSigned)} ${term(r.returnsSigned)} ` +
    `${term(r.removalsSigned)} ${term(r.reimbSigned)} ${term(r.adjSigned)} ` +
    `= ${r.computedEnding}`
  );
}

/** Header total for a column. Gap is a plain signed sum (actual − expected). */
function columnTotal(rows: GnrV2Row[], col: QtyCol): number {
  let t = 0;
  for (const r of rows) t += QTY_ACCESSOR[col](r);
  return t;
}

export function FbaReconTable({
  initialPayload,
  initialRemarks = {},
  onSaveRemark,
  view: viewProp,
  onViewChange,
}: {
  initialPayload: GnrReconV2Payload;
  /** usedMsku|usedFnsku → remark text. */
  initialRemarks?: Record<string, string>;
  /** Persist a remark; returns ok flag (client wires saveGnrReconRemark). */
  onSaveRemark?: (
    usedMsku: string,
    usedFnsku: string,
    next: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Controlled By MSKU / By ASIN view (parent hides its tab row in ASIN). */
  view?: "msku" | "asin";
  onViewChange?: (v: "msku" | "asin") => void;
}) {
  const [rows, setRows] = React.useState(initialPayload.rows);
  const [stats, setStats] = React.useState(initialPayload.stats);
  const [loading, setLoading] = React.useState(false);

  // By MSKU (current per-used-SKU table) vs By ASIN (placeholder for now).
  // Controlled by the parent when provided; otherwise self-managed.
  const [viewInner, setViewInner] = React.useState<"msku" | "asin">("msku");
  const view = viewProp ?? viewInner;
  const setView = React.useCallback(
    (v: "msku" | "asin") => {
      setViewInner(v);
      onViewChange?.(v);
    },
    [onViewChange],
  );

  // Remarks keyed `${usedMsku}|${usedFnsku}` (matches the old analysis table).
  const [remarks, setRemarks] = React.useState<Record<string, string>>(initialRemarks);
  React.useEffect(() => setRemarks(initialRemarks), [initialRemarks]);
  const saveRemark = React.useCallback(
    async (usedMsku: string, usedFnsku: string, next: string) => {
      if (!onSaveRemark) return { ok: false as const, error: "Remarks unavailable" };
      const res = await onSaveRemark(usedMsku, usedFnsku, next);
      if (res.ok) {
        setRemarks((prev) => ({ ...prev, [`${usedMsku}|${usedFnsku}`]: next }));
      }
      return res;
    },
    [onSaveRemark],
  );

  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounced(search, 280);
  // Unified client-side filter: all rows / one action group / one granular status.
  // Cards, group chips and the Status dropdown all drive this single state.
  const [filter, setFilter] = React.useState<ClientFilter>({ kind: "all" });

  const [vis, setVis] = useColumnVisibility("gnrReconV2.cols", GNR_V2_COLUMNS);
  const show = (id: string) => vis[id] !== false;

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);

  // Sort key. Default "gnr_date" desc (newest grading first). Entering the
  // Take-Action group switches to "days" desc so the oldest waiting/pending
  // items surface first; clicking the GNR Date header switches back to date.
  const [sortKey, setSortKey] = React.useState<"gnr_date" | "days">("gnr_date");
  const [gnrDateDesc, setGnrDateDesc] = React.useState(true);

  // Per-row action modals (Raise Case / Adjust), mirroring Returns Recon.
  const [caseRow, setCaseRow] = React.useState<GnrV2Row | null>(null);
  const [adjustRow, setAdjustRow] = React.useState<GnrV2Row | null>(null);
  // ASIN drill-down sheet (By ASIN view).
  const [asinDetail, setAsinDetail] = React.useState<GnrV2AsinRow | null>(null);

  // Clickable column-total filter: each key narrows to rows with a non-zero
  // value in that column (multi-select, AND), mirroring Replacement Recon.
  const [qtyFilter, setQtyFilter] = React.useState<Set<QtyCol>>(new Set());
  const toggleQtyCol = (c: QtyCol) => {
    setQtyFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
    setPage(1);
  };

  // Apply a client filter from any control (card, chip, dropdown). Entering the
  // Take-Action group defaults the sort to days-desc; any other filter resets to
  // the GNR-Date sort.
  const applyFilter = React.useCallback((f: ClientFilter) => {
    setFilter(f);
    setSortKey(f.kind === "group" && f.group === "take-action" ? "days" : "gnr_date");
    setPage(1);
  }, []);

  // Status / group filtering is client-side, so the server always returns the
  // full set (only search narrows it) — that keeps the card counts complete.
  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGnrReconV2Data({
        search: debouncedSearch || undefined,
        status: "",
      });
      setRows(data.rows);
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  const skipFirst = React.useRef(true);
  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    void reload();
  }, [reload]);

  // Card / dropdown scope first; column totals are summed over this set.
  const cardRows = React.useMemo(
    () => rows.filter((r) => rowMatchesFilter(r, filter)),
    [rows, filter],
  );

  // Then the clickable column-total filter narrows further.
  const filteredRows = React.useMemo(() => {
    if (qtyFilter.size === 0) return cardRows;
    return cardRows.filter((r) => [...qtyFilter].every((c) => QTY_ACCESSOR[c](r) !== 0));
  }, [cardRows, qtyFilter]);

  // ── By ASIN view rows (client-side aggregation over all rows) ──
  const asinRows = React.useMemo(() => {
    const all = aggregateAsinRows(rows);
    const term = debouncedSearch.trim().toLowerCase();
    return all.filter((a) => {
      // Status / group filter (asin-level dominant status).
      if (filter.kind === "group" && a.actionGroup !== filter.group) return false;
      if (filter.kind === "status" && a.status !== filter.status) return false;
      // Search across ASIN + title + member MSKU/FNSKU.
      if (term) {
        const hit =
          a.asin.toLowerCase().includes(term) ||
          a.title.toLowerCase().includes(term) ||
          a.members.some(
            (m) =>
              m.usedMsku.toLowerCase().includes(term) ||
              m.usedFnsku.toLowerCase().includes(term),
          );
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, filter, debouncedSearch]);

  // ASIN column totals (over the filtered ASIN set). Ledger-side totals are
  // suppressed ("—") when ANY shown ASIN has partial / no ledger coverage —
  // a partial ledger total is misleading.
  const asinTotals = React.useMemo(() => {
    const s = (pick: (a: (typeof asinRows)[number]) => number) =>
      asinRows.reduce((acc, a) => acc + pick(a), 0);
    const ledgerSuppressed = asinRows.some((a) => a.ledgerEnding === null);
    return {
      expectedInQty: s((a) => a.expectedInQty),
      actualIn: s((a) => a.actualIn),
      inboundGap: s((a) => a.inboundGap),
      computedEnding: s((a) => a.computedEnding),
      ledgerEnding: ledgerSuppressed ? null : s((a) => a.ledgerEnding ?? 0),
      variance: ledgerSuppressed ? null : s((a) => a.variance ?? 0),
    };
  }, [asinRows]);

  // Sort. "days" desc (oldest action items first; the 999 no-date sentinel sorts
  // last) inside Take Action; otherwise GNR Date with header-toggled direction.
  const sortedRows = React.useMemo(() => {
    if (sortKey === "days") {
      return [...filteredRows].sort((a, b) => {
        const ad = a.daysSince === 999 ? -1 : a.daysSince; // sentinel → last
        const bd = b.daysSince === 999 ? -1 : b.daysSince;
        return bd - ad; // desc
      });
    }
    const dir = gnrDateDesc ? -1 : 1;
    return [...filteredRows].sort((a, b) => {
      if (a.gnrDate === b.gnrDate) return 0;
      if (!a.gnrDate) return 1; // undated last
      if (!b.gnrDate) return -1;
      return a.gnrDate < b.gnrDate ? dir : -dir;
    });
  }, [filteredRows, sortKey, gnrDateDesc]);

  // Column totals over the card-scoped set (before the column-total filter).
  // Signed per QTY_ACCESSOR; gap totals claimable (positive) units only.
  const totals = React.useMemo(() => {
    const t = Object.fromEntries(QTY_COLS.map((c) => [c, 0])) as Record<QtyCol, number>;
    for (const c of QTY_COLS) t[c] = columnTotal(cardRows, c);
    return t;
  }, [cardRows]);

  // Computed-End header total = Σ computedEnding. Because each row's
  // computedEnding is the exact sum of its signed display fields, this equals
  // the sum of the actualIn / sales / returns / removals / reimb / adj / case
  // column totals — asserted in formula.test.ts. (gap is NOT a
  // contributor and doesn't enter this sum.)
  const computedEndTotal = React.useMemo(
    () => cardRows.reduce((s, r) => s + r.computedEnding, 0),
    [cardRows],
  );

  // Ledger-End header total = Σ ledgerEnding over rows that have ledger data
  // (null = "No data" rows are skipped).
  const ledgerEndTotal = React.useMemo(
    () => cardRows.reduce((s, r) => s + (r.ledgerEnding ?? 0), 0),
    [cardRows],
  );

  // Reset to page 1 whenever the visible row set changes (filter/search/reload).
  // This is the React-sanctioned "adjust state during render" pattern: storing
  // the previous identity in state and correcting synchronously avoids the
  // cascading re-render an effect would cause. See react.dev/learn/you-might-not-need-an-effect.
  const [prevRows, setPrevRows] = React.useState(filteredRows);
  if (prevRows !== filteredRows) {
    setPrevRows(filteredRows);
    if (page !== 1) setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function exportCsv() {
    // "actions" is a UI-only column with no exportable value — exclude it so the
    // header count matches the fixed row array below. "Action Group" is appended
    // (it's a derived field, not a visible table column).
    const headers = [
      ...GNR_V2_COLUMNS.filter((c) => c.id !== "actions").map((c) => c.label),
      "Action Group",
    ];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of sortedRows) {
      lines.push(
        [
          r.gnrDate,
          r.usedMsku,
          r.usedFnsku,
          r.origFnsku,
          r.asin,
          r.usedCondition,
          r.succeededQty,
          r.failedQty,
          r.expectedInQty,
          r.actualIn,
          r.inboundGap, // plain computed number (pre-window state lives in Status)
          r.salesSigned,
          r.returnsSigned,
          r.removalsSigned,
          r.reimbSigned,
          r.adjSigned,
          r.caseClaimedQty,
          r.isMixedSku ? "" : r.computedEnding,
          r.ledgerEnding ?? "",
          r.whEventsSigned,
          r.ledgerAdjSigned,
          r.status,
          r.daysSince === 999 ? "" : r.daysSince,
          remarks[`${r.usedMsku}|${r.usedFnsku}`] ?? "",
          r.actionGroup,
        ]
          .map(esc)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fba_recon_v2.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("✅ CSV exported");
  }

  return (
    <div className="space-y-4">
      {/* Page top-bar actions — By MSKU / By ASIN toggle (like Returns Recon)
          plus Columns / Export / Refresh / Clear, rendered into the header slot. */}
      <HeaderActions>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setView("msku")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "msku"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            By MSKU
          </button>
          <button
            type="button"
            onClick={() => setView("asin")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              view === "asin"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            By ASIN
          </button>
        </div>
        {view === "msku" ? (
          <>
            <ColumnsMenu columns={GNR_V2_COLUMNS} visibility={vis} onChange={setVis} />
            <Button variant="outline" size="sm" className="text-xs" onClick={exportCsv}>
              ⬇ Export CSV
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => void reload()}>
              ↻ Refresh
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" className="text-xs" onClick={exportCsv}>
              ⬇ Export CSV
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => void reload()}>
              ↻ Refresh
            </Button>
          </>
        )}
      </HeaderActions>

      {/* Account-wide reason-3 arrivals sanity banner (both views). */}
      {stats.reason3Warn ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="text-sm leading-none">⚠️</span>
          <div>
            <span className="font-bold">Reason-3 arrivals look off.</span>{" "}
            Inventory-adjustment reason 3 total{" "}
            <b className="font-mono">{stats.totalReason3Qty.toLocaleString()}</b> vs expected graded
            in (Succeeded + Failed){" "}
            <b className="font-mono">{stats.totalExpectedIn.toLocaleString()}</b> — off by{" "}
            <b className="font-mono">
              {stats.totalExpectedIn > 0
                ? `${Math.round((Math.abs(stats.totalReason3Qty - stats.totalExpectedIn) / stats.totalExpectedIn) * 100)}%`
                : "—"}
            </b>
            . Check for missing/duplicated inventory_adjustments before trusting inbound gaps.
          </div>
        </div>
      ) : null}

      {/* Summary header — Total + 3 group cards. SKU-level counts; drives the
          shared status/group filter for BOTH the MSKU and ASIN tables. */}
      <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        <StatCard
          accent="total"
          label="Total SKUs"
          count={stats.totalSkus}
          active={filter.kind === "all"}
          onClick={() => applyFilter({ kind: "all" })}
        />
        {GNR_V2_ACTION_GROUPS.map((g) => {
          const meta = GNR_V2_GROUP_META[g];
          const cardActive =
            (filter.kind === "group" && filter.group === g) ||
            (filter.kind === "status" && meta.members.includes(filter.status));
          return (
            <GroupCard
              key={g}
              accent={g}
              label={meta.label}
              count={stats.byGroup[g]}
              active={cardActive}
              onClick={() => applyFilter({ kind: "group", group: g })}
              chips={meta.members
                .filter((s) => stats.byStatus[s] > 0)
                .map((s) => ({
                  key: s,
                  label: GNR_V2_STATUS_SHORT[s],
                  title: GNR_V2_STATUS_LABEL[s],
                  count: stats.byStatus[s],
                  active: filter.kind === "status" && filter.status === s,
                  onClick: () => applyFilter({ kind: "status", status: s }),
                }))}
            />
          );
        })}
      </div>

      {view === "asin" ? (
        <div className="space-y-4">
          {/* Toolbar — Status + search + clear (ASIN-level filtering). */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
            <Select
              value={filterToSelectValue(filter)}
              onValueChange={(v) => applyFilter(selectValueToFilter(v))}
            >
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase">Action group</SelectLabel>
                  {GNR_V2_ACTION_GROUPS.map((g) => (
                    <SelectItem key={g} value={`${GROUP_PREFIX}${g}`}>
                      {GNR_V2_GROUP_META[g].label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                {GNR_V2_ACTION_GROUPS.map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel className="text-[10px] uppercase">{GNR_V2_GROUP_META[g].label}</SelectLabel>
                    {GNR_V2_GROUP_META[g].members.map((s) => (
                      <SelectItem key={s} value={s}>{GNR_V2_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ASIN / Used MSKU / FNSKU"
              className="h-8 max-w-[260px] text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => {
                setSearch("");
                applyFilter({ kind: "all" });
              }}
            >
              Clear
            </Button>
          </div>

          {asinRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <span className="text-3xl">🧩</span>
              <p className="text-sm font-semibold text-foreground">No ASINs</p>
              <p className="text-xs">Adjust filters or upload a Grade &amp; Resell report.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full caption-bottom text-sm">
                <thead className="bg-slate-100 [&_tr]:border-b-2 [&_tr]:border-slate-300">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    <th className="px-3 py-2.5 text-left">ASIN</th>
                    <th className="px-3 py-2.5 text-left">Title</th>
                    <th className="px-3 py-2.5 text-left">Conditions</th>
                    <th className="px-3 py-2.5 text-right">SKUs</th>
                    <th className="px-3 py-2.5 text-right">Exp In</th>
                    <th className="px-3 py-2.5 text-right">Actual</th>
                    <th className="px-3 py-2.5 text-right">Gap</th>
                    <th className="px-3 py-2.5 text-right">Computed</th>
                    <th className="px-3 py-2.5 text-right">Ledger</th>
                    <th className="px-3 py-2.5 text-right">Variance</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {asinRows.map((a) => (
                    <tr key={a.asin} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-[11px] font-semibold">{a.asin}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        <span className="block max-w-[280px] truncate" title={a.title || undefined}>
                          {a.title || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.conditions.slice(0, 2).map((c) => (
                            <ConditionBadge key={c} value={c} />
                          ))}
                          {a.conditions.length > 2 ? (
                            <span className="text-[10px] text-muted-foreground">+{a.conditions.length - 2}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {a.memberCount}
                        {a.mixedCount > 0 ? (
                          <span className="ml-1 text-[9px] text-slate-400">(+{a.mixedCount}m)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{a.expectedInQty}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{a.actualIn}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-xs",
                          a.inboundGap < 0 ? "font-bold text-red-700" : a.inboundGap > 0 ? "font-bold text-blue-700" : "text-slate-400",
                        )}
                      >
                        {a.inboundGap === 0 ? "0" : signed(a.inboundGap)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{a.computedEnding}</td>
                      <td
                        className="px-3 py-2 text-right font-mono text-xs"
                        title={a.ledgerNote || undefined}
                      >
                        {a.ledgerEnding ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono text-xs",
                          a.variance === null ? "text-slate-400" : a.variance < 0 ? "font-bold text-red-700" : a.variance > 0 ? "font-bold text-purple-700" : "text-slate-500",
                        )}
                        title={a.ledgerNote || undefined}
                      >
                        {a.variance === null ? "—" : a.variance > 0 ? `+${a.variance}` : a.variance}
                      </td>
                      <td className={cn("border-l-4 px-3 py-2", GNR_V2_GROUP_BORDER[a.actionGroup])}>
                        <GnrV2StatusBadge status={a.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-[11px]"
                          onClick={() => setAsinDetail(a)}
                        >
                          <Eye className="size-3.5" aria-hidden />
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-mono text-xs font-bold">
                  <tr>
                    <td className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-slate-600" colSpan={3}>
                      Totals · {asinRows.length} ASIN{asinRows.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {asinRows.reduce((s, a) => s + a.memberCount, 0)}
                    </td>
                    <td className="px-3 py-2 text-right">{asinTotals.expectedInQty}</td>
                    <td className="px-3 py-2 text-right">{asinTotals.actualIn}</td>
                    <td className="px-3 py-2 text-right">{asinTotals.inboundGap === 0 ? "0" : signed(asinTotals.inboundGap)}</td>
                    <td className="px-3 py-2 text-right">{asinTotals.computedEnding}</td>
                    <td className="px-3 py-2 text-right" title={asinTotals.ledgerEnding === null ? "Some ASINs lack a covering ledger snapshot" : undefined}>
                      {asinTotals.ledgerEnding ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {asinTotals.variance === null ? "—" : asinTotals.variance > 0 ? `+${asinTotals.variance}` : asinTotals.variance}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Toolbar — Status + search only (top-bar holds the action buttons). */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-[11px] font-semibold text-muted-foreground">Status</span>
        <Select
          value={filterToSelectValue(filter)}
          onValueChange={(v) => applyFilter(selectValueToFilter(v))}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Statuses</SelectItem>
            {/* Group-level options. */}
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase">Action group</SelectLabel>
              {GNR_V2_ACTION_GROUPS.map((g) => (
                <SelectItem key={g} value={`${GROUP_PREFIX}${g}`}>
                  {GNR_V2_GROUP_META[g].label} ({stats.byGroup[g]})
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            {/* Granular statuses, grouped under their action group. */}
            {GNR_V2_ACTION_GROUPS.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel className="text-[10px] uppercase">
                  {GNR_V2_GROUP_META[g].label}
                </SelectLabel>
                {GNR_V2_GROUP_META[g].members.map((s) => (
                  <SelectItem key={s} value={s}>
                    {GNR_V2_STATUS_LABEL[s]} ({stats.byStatus[s]})
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Used MSKU / FNSKU / ASIN"
          className="h-8 max-w-[260px] text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-xs"
          onClick={() => {
            setSearch("");
            applyFilter({ kind: "all" });
            setQtyFilter(new Set());
          }}
        >
          Clear
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : sortedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <span className="text-3xl">♻</span>
          <p className="text-sm font-semibold text-foreground">No FBA Recon data</p>
          <p className="text-xs">Adjust filters or upload a Grade &amp; Resell report</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-white">
            <table className="w-full caption-bottom text-sm">
              <TableHeader className="sticky top-14 z-20 bg-slate-100 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.12),0_1px_0_rgba(15,23,42,0.08)] [&_tr]:border-b-2 [&_tr]:border-slate-300">
                <TableRow>
                  {GNR_V2_COLUMNS.filter((c) => show(c.id)).map((c) => {
                    const right = RIGHT_COLS.has(c.id);
                    return (
                      <TableHead
                        key={c.id}
                        className={cn(
                          "h-12 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-wider text-slate-700",
                          right && "text-right",
                        )}
                      >
                        <div className={cn("flex flex-col gap-0.5", right ? "items-end" : "items-start")}>
                          {c.id === "gnr_date" ? (
                            <button
                              type="button"
                              onClick={() => {
                                // First click off the days-sort just claims the
                                // GNR-Date sort; subsequent clicks flip direction.
                                if (sortKey !== "gnr_date") setSortKey("gnr_date");
                                else setGnrDateDesc((d) => !d);
                              }}
                              title="Sort by GNR Date"
                              className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-blue-700"
                            >
                              {c.label}
                              <span className="text-[9px]">
                                {sortKey === "gnr_date" ? (gnrDateDesc ? "▼" : "▲") : "↕"}
                              </span>
                            </button>
                          ) : (
                            <span>{c.label}</span>
                          )}
                          {isQtyCol(c.id) ? (
                            <span className="normal-case tracking-normal">
                              <TotalButton
                                colId={c.id}
                                total={totals[c.id]}
                                active={qtyFilter.has(c.id)}
                                onToggle={toggleQtyCol}
                              />
                            </span>
                          ) : c.id === "computed_end" ? (
                            <span
                              className="font-mono text-[11px] font-bold tabular-nums text-slate-700"
                              title="Σ Computed End = sum of the Actual / Sales / Returns / Removals / Reimb Qty / Manual Adj column totals"
                            >
                              {computedEndTotal.toLocaleString()}
                            </span>
                          ) : c.id === "ledger_end" ? (
                            <span
                              className="font-mono text-[11px] font-bold tabular-nums text-slate-700"
                              title="Σ Ledger End over rows with ledger data (No-data rows excluded)"
                            >
                              {ledgerEndTotal.toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.map((r) => {
                  const isManual = r.usedMsku.startsWith("Manual: ");
                  const displayMsku = isManual
                    ? r.usedMsku.replace(/^Manual: /, "")
                    : r.usedMsku;
                  const rowBg =
                    r.status === "take-action"
                      ? "bg-red-50/40"
                      : r.status === "claim-inbound"
                        ? "bg-blue-50/30"
                        : r.status === "over-accounted"
                          ? "bg-purple-50/30"
                          : r.status === "review"
                            ? "bg-pink-50/30"
                            : r.status === "mixed-sku"
                              ? "bg-slate-50/60 text-slate-500"
                              : "";
                  return (
                    <TableRow
                      key={`${r.usedMsku}|${r.usedFnsku}`}
                      className={cn("hover:bg-slate-50", rowBg)}
                    >
                      {show("gnr_date") && (
                        <TableCell className="font-mono text-[10px] text-slate-600">
                          {r.gnrDate ? (
                            r.gnrDates.length > 1 ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help underline decoration-dotted underline-offset-2">
                                    {r.gnrDate}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-[11px]">
                                  <div className="space-y-0.5 font-mono">
                                    {r.gnrDates.map((d) => (
                                      <div key={d.date} className="flex justify-between gap-3">
                                        <span>{d.date}</span>
                                        <span className="text-slate-300">×{d.qty}</span>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              r.gnrDate
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                      )}
                      {show("used_msku") && (
                        <TableCell className="font-mono text-[11px] font-semibold">
                          <span className="block max-w-[180px] truncate" title={r.usedMsku}>
                            {displayMsku}
                          </span>
                        </TableCell>
                      )}
                      {show("used_fnsku") && (
                        <TableCell className="font-mono text-[10px] text-slate-600">
                          {r.usedFnsku}
                        </TableCell>
                      )}
                      {show("orig_fnsku") && (
                        <TableCell className="font-mono text-[10px] text-slate-500">
                          {r.origFnsku}
                        </TableCell>
                      )}
                      {show("asin") && (
                        <TableCell className="font-mono text-[10px]">{r.asin}</TableCell>
                      )}
                      {show("condition") && (
                        <TableCell>
                          <ConditionBadge value={r.usedCondition} />
                        </TableCell>
                      )}
                      {show("gnr_succeeded") && (
                        <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                          {r.succeededQty}
                        </TableCell>
                      )}
                      {show("gnr_failed") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.failedQty > 0 ? "font-semibold text-red-600" : "text-slate-400",
                          )}
                        >
                          {r.failedQty || "—"}
                        </TableCell>
                      )}
                      {show("expected_in") && (
                        <TableCell className="text-right font-mono text-xs font-semibold text-slate-700">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{r.expectedInQty}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[11px]">
                              <div className="space-y-1">
                                <div>Succeeded: {r.succeededQty}</div>
                                <div>+ Failed: {r.failedQty}</div>
                                <div className="border-t border-slate-600 pt-1">
                                  <b>= Expected In: {r.expectedInQty}</b>
                                </div>
                                <div className="text-slate-300">
                                  Both re-enter as inventory adj reason 3
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      )}
                      {show("gnr_in") && (
                        <TableCell className="text-right font-mono text-xs">
                          {r.gnrInQty > 0 || r.gnrInEvents.length > 0 ? (
                            <CellHoverPopover
                              side="left"
                              width={320}
                              title="GNR In (inv adj reason 3)"
                              count={r.gnrInEvents.length}
                              triggerClassName="font-bold text-emerald-700"
                              trigger={<span>{r.actualIn}</span>}
                            >
                              {r.gnrInEvents.length === 0 ? (
                                <div className="px-2 py-1 text-slate-500">No events</div>
                              ) : (
                                r.gnrInEvents.map((e, i) => (
                                  <CellHoverRow
                                    key={`${e.referenceId}-${e.adjDate}-${i}`}
                                    left={
                                      <span className="truncate">
                                        {e.adjDate || "—"}
                                        {e.fc ? ` · ${e.fc}` : ""}
                                        {e.disposition ? ` · ${e.disposition}` : ""}
                                      </span>
                                    }
                                    right={`+${e.qty}`}
                                  />
                                ))
                              )}
                            </CellHoverPopover>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </TableCell>
                      )}
                      {show("inbound_gap") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            // Gap = Actual − Expected. Negative = missing inbound
                            // (claimable, red; amber when pre-window). Positive =
                            // extra / unrecorded arrivals (review, blue).
                            r.inboundGap < 0 && r.inboundNote !== "pre-window"
                              ? "bg-red-50 font-bold text-red-700"
                              : r.inboundGap < 0
                                ? "font-semibold text-amber-700"
                                : r.inboundGap > 0
                                  ? "bg-blue-50 font-bold text-blue-700"
                                  : "text-slate-400",
                          )}
                        >
                          {r.inboundGap < 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {/* Numeric only — the pre-window state shows via the
                                    amber color + tooltip, not inline text, so the
                                    column stays a clean computed number. */}
                                <span className="cursor-help">−{Math.abs(r.inboundGap)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[11px]">
                                <div className="space-y-1">
                                  <div>GNR In (reason 3): {r.gnrInQty}</div>
                                  <div>− Expected In: {r.expectedInQty}</div>
                                  <div className="border-t border-slate-600 pt-1">
                                    <b>Gap: {r.inboundGap}</b>
                                  </div>
                                  {r.inboundNote === "pre-window" ? (
                                    <div className="text-amber-300">
                                      Covered by opening balance ({r.openingBal}) — not a claim
                                    </div>
                                  ) : (
                                    <div className="text-red-300">
                                      Graded but never re-added → reimbursable
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : r.inboundGap > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">+{r.inboundGap}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[11px]">
                                <div className="space-y-1">
                                  <div>GNR In (reason 3): {r.gnrInQty}</div>
                                  <div>− Expected In: {r.expectedInQty}</div>
                                  <div className="border-t border-slate-600 pt-1">
                                    <b>Gap: {r.inboundGap}</b>
                                  </div>
                                  <div className="text-blue-300">
                                    Extra / unrecorded grading — review
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </TableCell>
                      )}
                      {show("sales") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.salesSigned !== 0 ? "font-semibold text-red-600" : "text-slate-400",
                          )}
                        >
                          {r.salesSigned !== 0 ? (
                            <SalesDetailPopover row={r} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("returns") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.returnsSigned !== 0 ? "font-semibold text-emerald-600" : "text-slate-400",
                          )}
                        >
                          {r.returnsSigned !== 0 ? (
                            <ReturnDetailPopover row={r} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("removals") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.removalsSigned !== 0 ? "font-semibold text-red-600" : "text-slate-400",
                          )}
                        >
                          {r.removalsSigned !== 0 ? (
                            <RemovalDetailPopover row={r} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("reimb_qty") && (
                        <TableCell className="text-right font-mono text-xs">
                          {r.reimbQty !== 0 || r.reimbAmount !== 0 ? (
                            <CellHoverPopover
                              side="left"
                              width={260}
                              title="Reimbursement"
                              triggerClassName="font-bold text-red-600"
                              trigger={<span>{signed(r.reimbSigned)}</span>}
                            >
                              <CellHoverRow left="Reimb Qty (signed)" right={signed(r.reimbSigned)} />
                              <CellHoverRow left="Reimb $ (signed)" right={`$${(-r.reimbAmount).toFixed(2)}`} />
                            </CellHoverPopover>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                      )}
                      {show("adj") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.adjSigned !== 0 ? "font-semibold text-blue-700" : "text-slate-400",
                          )}
                        >
                          {r.adjSigned !== 0 ? (
                            r.adjReasons ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{signed(r.adjSigned)}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-[11px]">
                                  {r.adjReasons}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              signed(r.adjSigned)
                            )
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("case_appr") && (
                        <TableCell className="text-right font-mono text-xs">
                          {r.caseCount > 0 ? (
                            <CellHoverPopover
                              side="left"
                              width={280}
                              title="Case detail"
                              count={r.caseCount}
                              triggerClassName="font-bold text-teal-700"
                              // Show the RAISED (claimed) qty immediately — no waiting
                              // for approval. Approval detail lives in the hover.
                              trigger={<span>{r.caseClaimedQty || `${r.caseCount} case${r.caseCount > 1 ? "s" : ""}`}</span>}
                            >
                              <CellHoverRow left="Claimed Qty" right={r.caseClaimedQty} />
                              <CellHoverRow left="Approved Qty" right={r.caseApprovedQty} />
                              <CellHoverRow
                                left="Approved $"
                                right={`$${r.caseApprovedAmount.toFixed(2)}`}
                              />
                              {r.caseTopStatus ? (
                                <CellHoverRow left="Status" right={r.caseTopStatus} />
                              ) : null}
                              {r.caseIds ? <CellHoverRow left="Case ID(s)" right={r.caseIds} /> : null}
                              {r.caseReasons ? (
                                <CellHoverRow left="Reason" right={r.caseReasons} />
                              ) : null}
                            </CellHoverPopover>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                      )}
                      {show("computed_end") && (
                        <TableCell className="text-right font-mono text-xs">
                          {r.isMixedSku ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-slate-400">—</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-[11px]">
                                Used FNSKU equals the original FNSKU, so GNR stock is
                                mixed with regular stock. Reconcile this SKU in Full
                                Inventory Recon instead.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-slate-700">
                                  {r.computedEnding}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-[11px]">
                                <div className="space-y-1">
                                  <div className="font-mono">{computedEndEquation(r)}</div>
                                  <div className="grid grid-cols-[auto_auto] gap-x-3 text-slate-300">
                                    <span>Actual In</span><span className="text-right">{signed(r.actualIn)}</span>
                                    <span>Sales</span><span className="text-right">{signed(r.salesSigned)}</span>
                                    <span>Returns</span><span className="text-right">{signed(r.returnsSigned)}</span>
                                    <span>Removals</span><span className="text-right">{signed(r.removalsSigned)}</span>
                                    <span>Reimb Qty</span><span className="text-right">{signed(r.reimbSigned)}</span>
                                    <span>Manual Adj</span><span className="text-right">{signed(r.adjSigned)}</span>
                                  </div>
                                  <div className="border-t border-slate-600 pt-1 text-[10px] text-slate-400">
                                    W/H Events / Ledger Adj / Case are not in this sum.
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                      {show("ledger_end") && (
                        <TableCell className="text-right font-mono text-xs">
                          {r.ledgerEnding !== null ? (
                            <CellHoverPopover
                              side="left"
                              width={240}
                              title="Ledger End (fba_summary)"
                              triggerClassName={cn(
                                r.ledgerEnding > 0
                                  ? "font-semibold text-emerald-700"
                                  : r.ledgerEnding < 0
                                    ? "font-semibold text-red-600"
                                    : "text-slate-500",
                              )}
                              trigger={<span>{r.ledgerEnding}</span>}
                            >
                              <CellHoverRow left="Ledger Date" right={r.ledgerDate || "—"} />
                              {r.ledgerDispositions.length > 0 ? (
                                r.ledgerDispositions.map((d) => (
                                  <CellHoverRow
                                    key={d.disposition}
                                    left={d.disposition}
                                    right={String(d.qty)}
                                  />
                                ))
                              ) : (
                                <CellHoverRow left="Disposition" right="—" />
                              )}
                            </CellHoverPopover>
                          ) : (
                            <span className="text-[10px] text-slate-400">No data</span>
                          )}
                        </TableCell>
                      )}
                      {show("wh_events") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.whEventsSigned !== 0 ? "font-semibold text-slate-700" : "text-slate-400",
                          )}
                        >
                          {r.whEventsSigned !== 0 ? (
                            <WhEventsPopover row={r} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("adjustments") && (
                        <TableCell
                          className={cn(
                            "text-right font-mono text-xs",
                            r.ledgerAdjSigned !== 0 ? "font-semibold text-slate-700" : "text-slate-400",
                          )}
                        >
                          {r.ledgerAdjSigned !== 0 ? (
                            <AdjustmentsPopover row={r} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}
                      {show("status") && (
                        <TableCell>
                          <GnrV2StatusBadge
                            status={r.status}
                            title={
                              r.variance === null
                                ? `Variance: n/a → ${r.status}`
                                : `Ledger ${r.ledgerEnding} − Computed ${r.computedEnding} = ${
                                    r.variance > 0 ? `+${r.variance}` : r.variance
                                  } → ${r.status}`
                            }
                          />
                        </TableCell>
                      )}
                      {show("days") && (
                        <TableCell className="text-right font-mono text-xs text-slate-500">
                          {r.daysSince === 999 ? "—" : r.daysSince}
                        </TableCell>
                      )}
                      {show("remarks") && (
                        <TableCell>
                          {onSaveRemark ? (
                            <RemarksCell
                              value={remarks[`${r.usedMsku}|${r.usedFnsku}`] ?? ""}
                              onSave={(next) => saveRemark(r.usedMsku, r.usedFnsku, next)}
                            />
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {show("actions") && (
                        <TableCell className="px-3">
                          {/* Raise Case / Adjust — same flow as Returns Recon.
                              Highlighted when the row needs action; muted otherwise.
                              Mixed-SKU rows are reconciled elsewhere → disabled. */}
                          <div className="flex justify-center gap-1">
                            {(() => {
                              const needs = NEEDS_ACTION_STATUS.has(r.status);
                              return (
                                <>
                                  <button
                                    type="button"
                                    title="Raise Case"
                                    disabled={r.isMixedSku}
                                    onClick={() => setCaseRow(r)}
                                    className={cn(
                                      "flex size-[26px] items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                      needs
                                        ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100"
                                        : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
                                    )}
                                  >
                                    <FileText className="size-3.5" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    title="Adjust"
                                    disabled={r.isMixedSku}
                                    onClick={() => setAdjustRow(r)}
                                    className={cn(
                                      "flex size-[26px] items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                                      needs
                                        ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100"
                                        : "border-border bg-background text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground",
                                    )}
                                  >
                                    <Wrench className="size-3.5" aria-hidden />
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          </div>
          <Pagination
            page={safePage}
            pageSize={pageSize}
            totalRows={sortedRows.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      )}
      </>
      )}

      {/* Per-row action modals — reload on save so the new case / adjustment
          shows up in the Case Appr / Manual Adj columns and the cards. */}
      <RaiseCaseModalV2
        row={caseRow}
        open={caseRow !== null}
        onOpenChange={(o) => {
          if (!o) setCaseRow(null);
        }}
        onSaved={() => void reload()}
      />
      <AdjustModalV2
        row={adjustRow}
        open={adjustRow !== null}
        onOpenChange={(o) => {
          if (!o) setAdjustRow(null);
        }}
        onSaved={() => void reload()}
      />

      {/* ASIN drill-down (By ASIN view). */}
      <AsinDetailSheet
        row={asinDetail}
        remarks={remarks}
        open={asinDetail !== null}
        onOpenChange={(o) => {
          if (!o) setAsinDetail(null);
        }}
      />
    </div>
  );
}

// ── Flow detail popovers (Sales / Returns / Removals) ───────
// Each shows the underlying matched transactions whose Σ qty equals the cell's
// signed value (same cutoff + pair-matching, attached in the action).

/** Order ID cell: monospace, click to copy. Renders "—" when blank. */
function OrderIdCell({ orderId }: { orderId: string }) {
  if (!orderId) return <span className="text-slate-400">—</span>;
  return (
    <button
      type="button"
      title="Click to copy Order ID"
      onClick={() => {
        void navigator.clipboard?.writeText(orderId);
        toast.success("📋 Order ID copied");
      }}
      className="max-w-[150px] truncate font-mono text-[10px] text-blue-700 hover:underline"
    >
      {orderId}
    </button>
  );
}

/** Shared 4-column detail grid header. `amountHead` toggles the 4th column. */
function DetailHead({ fourth }: { fourth: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 border-b px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span>Date</span>
      <span>Order ID</span>
      <span className="text-right">Qty</span>
      <span className="text-right">{fourth}</span>
    </div>
  );
}

/** "+N more" footer when the matched list was capped (totalCount > shown). */
function MoreRow({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <div className="px-2 py-1 text-center text-[10px] italic text-muted-foreground">
      +{(total - shown).toLocaleString()} more
    </div>
  );
}

function SalesDetailPopover({ row }: { row: GnrV2Row }) {
  const { rows, totalCount } = row.salesDetails;
  const totalAmount = rows.reduce((s, d) => s + d.amount, 0);
  return (
    <CellHoverPopover
      side="left"
      width={360}
      title="Sales detail"
      count={totalCount}
      triggerClassName="font-semibold text-red-600"
      trigger={<span>{signed(row.salesSigned)}</span>}
    >
      <DetailHead fourth="Amount" />
      {rows.map((d, i) => (
        <div
          key={`${d.orderId}-${d.date}-${i}`}
          className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <span className="font-mono text-[10px] text-slate-600">{d.date || "—"}</span>
          <OrderIdCell orderId={d.orderId} />
          <span className="text-right font-mono tabular-nums">{d.qty}</span>
          <span className="text-right font-mono tabular-nums">${d.amount.toFixed(2)}</span>
        </div>
      ))}
      <MoreRow shown={rows.length} total={totalCount} />
      <div className="mt-1 flex justify-between border-t px-2 pt-1 font-mono text-[11px] font-bold tabular-nums">
        <span>Total</span>
        <span>
          {row.salesQty} · ${totalAmount.toFixed(2)}
        </span>
      </div>
    </CellHoverPopover>
  );
}

function ReturnDetailPopover({ row }: { row: GnrV2Row }) {
  const { rows, totalCount } = row.returnDetails;
  return (
    <CellHoverPopover
      side="left"
      width={360}
      title="Returns detail"
      count={totalCount}
      triggerClassName="font-semibold text-emerald-600"
      trigger={<span>{signed(row.returnsSigned)}</span>}
    >
      <DetailHead fourth="Disposition" />
      {rows.map((d, i) => (
        <div
          key={`${d.orderId}-${d.date}-${i}`}
          className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <span className="font-mono text-[10px] text-slate-600">{d.date || "—"}</span>
          <OrderIdCell orderId={d.orderId} />
          <span className="text-right font-mono tabular-nums">{d.qty}</span>
          <span className="text-right text-[10px] text-slate-600">{d.disposition || "—"}</span>
        </div>
      ))}
      <MoreRow shown={rows.length} total={totalCount} />
      <div className="mt-1 flex justify-between border-t px-2 pt-1 font-mono text-[11px] font-bold tabular-nums">
        <span>Total</span>
        <span>{row.returnQty}</span>
      </div>
    </CellHoverPopover>
  );
}

function RemovalDetailPopover({ row }: { row: GnrV2Row }) {
  const { rows, totalCount } = row.removalDetails;
  return (
    <CellHoverPopover
      side="left"
      width={360}
      title="Removals detail"
      count={totalCount}
      triggerClassName="font-semibold text-red-600"
      trigger={<span>{signed(row.removalsSigned)}</span>}
    >
      <DetailHead fourth="Source" />
      {rows.map((d, i) => (
        <div
          key={`${d.orderId}-${d.date}-${i}`}
          className="grid grid-cols-[auto_1fr_auto_auto] items-baseline gap-x-3 border-b border-border/60 px-2 py-1 last:border-b-0"
        >
          <span className="font-mono text-[10px] text-slate-600">{d.date || "—"}</span>
          <OrderIdCell orderId={d.orderId} />
          <span className="text-right font-mono tabular-nums">{d.qty}</span>
          <span className="text-right text-[10px] text-slate-600">
            {d.source === "shipment" ? "shipment" : "removal-order"}
          </span>
        </div>
      ))}
      <MoreRow shown={rows.length} total={totalCount} />
      <div className="mt-1 flex justify-between border-t px-2 pt-1 font-mono text-[11px] font-bold tabular-nums">
        <span>Total</span>
        <span>{row.removalQty}</span>
      </div>
    </CellHoverPopover>
  );
}

// ── W/H Events + Adjustments popovers ───────────────────────

function WhEventsPopover({ row }: { row: GnrV2Row }) {
  const b = row.whBreakdown;
  const line = (label: string, n: number) => (
    <div className="flex justify-between gap-3 px-2 py-1">
      <span className="text-foreground">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">{signed(n)}</span>
    </div>
  );
  return (
    <CellHoverPopover
      side="left"
      width={240}
      title="Warehouse events (ledger)"
      triggerClassName={row.whEventsSigned < 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}
      trigger={<span>{signed(row.whEventsSigned)}</span>}
    >
      {/* Found is the only + side; the rest subtract. */}
      {line("Found", b.found)}
      {line("Lost", -b.lost)}
      {line("Damaged", -b.damaged)}
      {line("Disposed", -b.disposed)}
      <div className="mt-1 flex justify-between border-t px-2 pt-1 font-mono text-[11px] font-bold tabular-nums">
        <span>Net</span>
        <span>{signed(row.whEventsSigned)}</span>
      </div>
    </CellHoverPopover>
  );
}

function AdjustmentsPopover({ row }: { row: GnrV2Row }) {
  const b = row.ledgerAdjBreakdown;
  const line = (label: string, n: number) => (
    <div className="flex justify-between gap-3 px-2 py-1">
      <span className="text-foreground">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">{signed(n)}</span>
    </div>
  );
  return (
    <CellHoverPopover
      side="left"
      width={300}
      title="Ledger adjustments (fba_summary)"
      triggerClassName={row.ledgerAdjSigned < 0 ? "font-bold text-red-600" : "font-bold text-slate-700"}
      trigger={<span>{signed(row.ledgerAdjSigned)}</span>}
    >
      {/* (other + unknown) − Actual In; reason-3 already shown as Actual In. */}
      {line("Other Events", b.other)}
      {line("Unknown Events", b.unknown)}
      {line("less Actual In", -b.actualIn)}
      <div className="mt-1 flex justify-between border-t px-2 pt-1 font-mono text-[11px] font-bold tabular-nums">
        <span>= Net</span>
        <span>{signed(row.ledgerAdjSigned)}</span>
      </div>
    </CellHoverPopover>
  );
}

const RIGHT_COLS = new Set<string>([
  "gnr_succeeded",
  "gnr_failed",
  "expected_in",
  "gnr_in",
  "inbound_gap",
  "sales",
  "returns",
  "removals",
  "wh_events",
  "adjustments",
  "reimb_qty",
  "adj",
  "case_appr",
  "computed_end",
  "ledger_end",
  "days",
]);

function TotalButton({
  colId,
  total,
  active,
  onToggle,
}: {
  colId: QtyCol;
  total: number;
  active: boolean;
  onToggle: (c: QtyCol) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(colId)}
      title="Click to show only rows with a value in this column"
      className={cn(
        "rounded font-mono text-[11px] font-bold tabular-nums transition",
        active
          ? "bg-blue-600 px-1.5 py-0.5 text-white"
          : "px-1 py-0.5 text-blue-600 hover:bg-blue-50",
      )}
    >
      {total.toLocaleString()}
    </button>
  );
}

type CardAccent = "total" | "resolved" | GnrV2ActionGroup;

// Static (literal) Tailwind class sets per accent — bar, active ring + bg tint,
// and chip idle / active styles. Tailwind can't see interpolated class strings,
// so every class is spelled out here.
const CARD_ACCENT: Record<
  CardAccent,
  { bar: string; ring: string; activeBg: string; chip: string; chipActive: string }
> = {
  total: {
    bar: "bg-slate-400",
    ring: "ring-slate-300",
    activeBg: "bg-slate-50",
    chip: "bg-slate-500/10 text-slate-700 hover:bg-slate-500/20",
    chipActive: "bg-slate-600 text-white",
  },
  resolved: {
    bar: "bg-sky-500",
    ring: "ring-sky-300",
    activeBg: "bg-sky-50",
    chip: "bg-sky-500/10 text-sky-700 hover:bg-sky-500/20",
    chipActive: "bg-sky-500 text-white",
  },
  "take-action": {
    bar: "bg-red-500",
    ring: "ring-red-300",
    activeBg: "bg-red-50",
    chip: "bg-red-500/10 text-red-700 hover:bg-red-500/20",
    chipActive: "bg-red-500 text-white",
  },
  "no-action": {
    bar: "bg-emerald-500",
    ring: "ring-emerald-300",
    activeBg: "bg-emerald-50",
    chip: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20",
    chipActive: "bg-emerald-500 text-white",
  },
  excess: {
    bar: "bg-violet-500",
    ring: "ring-violet-300",
    activeBg: "bg-violet-50",
    chip: "bg-violet-500/10 text-violet-700 hover:bg-violet-500/20",
    chipActive: "bg-violet-500 text-white",
  },
};

/** Shared clickable-card behaviour (mouse + keyboard). */
function cardInteractionProps(onClick: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

const CARD_BASE =
  "cursor-pointer rounded-xl border border-border bg-white shadow-sm transition hover:shadow-md hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";

/** Simple count card: dot + label, big count, optional sub-line. Same height as
 *  the group cards. Used for Total and Resolved. */
function StatCard({
  accent,
  label,
  count,
  sub,
  active,
  onClick,
}: {
  accent: CardAccent;
  label: string;
  count: number;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  const a = CARD_ACCENT[accent];
  return (
    <div
      {...cardInteractionProps(onClick)}
      className={cn(
        "flex h-full flex-col gap-1.5 overflow-hidden p-4",
        CARD_BASE,
        active && cn("ring-2", a.ring, a.activeBg),
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", a.bar)} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold tabular-nums leading-none text-slate-900">
        {count.toLocaleString()}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

type CardChip = {
  key: string;
  label: string;
  title: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

/**
 * Group card: accent dot + label (row 1), then count on the left with the
 * group's status chips wrapping (max 2 lines) to its right (row 2). Card click
 * filters the group; chip click filters that single status.
 */
function GroupCard({
  accent,
  label,
  count,
  active,
  onClick,
  chips,
}: {
  accent: GnrV2ActionGroup;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  chips: CardChip[];
}) {
  const a = CARD_ACCENT[accent];
  return (
    <div
      {...cardInteractionProps(onClick)}
      className={cn(
        "flex h-full flex-col gap-2 overflow-hidden p-4",
        CARD_BASE,
        active && cn("ring-2", a.ring, a.activeBg),
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", a.bar)} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-3xl font-bold tabular-nums leading-none text-slate-900">
          {count.toLocaleString()}
        </div>
        {/* Chip cluster — wraps to at most 2 lines inside the card. */}
        <div className="flex max-h-[44px] flex-1 flex-wrap content-start items-center gap-1 overflow-hidden">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              title={c.title}
              onClick={(e) => {
                e.stopPropagation(); // chip filters its status, not the whole card
                c.onClick();
              }}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums transition",
                c.active ? a.chipActive : a.chip,
              )}
            >
              {c.label} <span className="font-semibold">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
