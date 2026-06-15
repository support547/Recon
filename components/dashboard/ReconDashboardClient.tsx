"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Database,
  DollarSign,
  FileWarning,
  Flame,
  FolderOpen,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  Truck,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DashboardHeaderActions,
  type DashboardView,
} from "@/components/dashboard/DashboardHeaderActions";
import { cn } from "@/lib/utils";

export type ModuleStats = {
  primaryLabel: string;
  primaryValue: number;
  secondary: { label: string; value: number }[];
  takeAction: number;
  caseNeeded: number;
  pending: number;
  casesRaised: number;
  casesApproved: number;
  casesPending: number;
};

export type DashboardProps = {
  flow: {
    shipped: number;
    received: number;
    netShortage: number;
    sold: number;
    returns: number;
    reimbursed: number;
  };
  modules: {
    shipment: ModuleStats;
    removal: ModuleStats;
    returns: ModuleStats;
    replacement: ModuleStats;
    fcTransfer: ModuleStats;
    gnr: ModuleStats;
    adjustment: ModuleStats;
    full: ModuleStats;
  };
  cases: {
    open: number;
    inProgress: number;
    resolved: number;
    rejected: number;
    closed: number;
    totalClaimed: number;
    totalApprovedAmount: number;
    casesRaisedGlobal: number;
    casesWithApprovedAmount: number;
  };
  adjustments: {
    quantity: number;
    financial: number;
    status: number;
    other: number;
    totalUnits: number;
  };
  lastRefreshedAt: string | null;
  refreshAction: () => Promise<
    { ok: true; rowsUpserted?: number } | { ok: false; error: string }
  >;
};

type ModuleKey = keyof DashboardProps["modules"];

type ModuleCardConfig = {
  key: ModuleKey;
  name: string;
  icon: LucideIcon;
  href: string;
  caseModuleParam: string;
};

const MODULE_CONFIGS: ModuleCardConfig[] = [
  { key: "shipment", name: "Shipment Recon", icon: Package, href: "/shipment-reconciliation", caseModuleParam: "shipment" },
  { key: "removal", name: "Removal Recon", icon: Truck, href: "/removal-reconciliation", caseModuleParam: "removal" },
  { key: "returns", name: "Returns Recon", icon: RotateCcw, href: "/returns-reconciliation", caseModuleParam: "returns" },
  { key: "replacement", name: "Replacement Recon", icon: RefreshCw, href: "/replacement-reconciliation", caseModuleParam: "replacement" },
  { key: "fcTransfer", name: "FC Transfer Recon", icon: ArrowLeftRight, href: "/fc-transfer-reconciliation", caseModuleParam: "fc-transfer" },
  { key: "gnr", name: "GNR Recon", icon: ClipboardList, href: "/gnr-reconciliation", caseModuleParam: "gnr" },
  { key: "adjustment", name: "Adjustment Recon", icon: SlidersHorizontal, href: "/adjustment-reconciliation", caseModuleParam: "adjustment" },
  { key: "full", name: "Full Inventory Recon", icon: Boxes, href: "/full-reconciliation", caseModuleParam: "full" },
];

const SECTION_IDS = {
  takeAction: "section-modules",
  caseNeeded: "section-modules",
  unrecovered: "section-flow",
};

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function moduleStatus(m: ModuleStats): "red" | "amber" | "green" {
  if (m.takeAction > 0) return "red";
  if (m.pending > 0 || m.caseNeeded > 0) return "amber";
  return "green";
}

// Short pill label per module key
const SHORT_LABEL: Record<string, string> = {
  shipment:    "take action",
  removal:     "awaiting",
  returns:     "take action",
  replacement: "take action",
  fcTransfer:  "take action",
  gnr:         "take action",
  adjustment:  "take action",
  full:        "action",
};

function cardBorderStyle(tone: "red" | "amber" | "green"): React.CSSProperties {
  const palette = {
    red:   { thin: "#E24B4A", thick: "#A32D2D", bg: "#FCEBEB08" },
    amber: { thin: "#EF9F27", thick: "#854F0B", bg: "#FAEEDA08" },
    green: { thin: "#639922", thick: "#3B6D11", bg: "transparent" },
  };
  const c = palette[tone];
  return {
    borderTop:    `1px solid ${c.thin}`,
    borderBottom: `1px solid ${c.thin}`,
    borderLeft:   `3px solid ${c.thick}`,
    borderRight:  `3px solid ${c.thick}`,
    background:   c.bg,
    borderRadius: "10px",
  };
}

function smoothScroll(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ReconDashboardClient(props: DashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [refreshedAt, setRefreshedAt] = React.useState<string | null>(
    props.lastRefreshedAt,
  );
  const [nowTick, setNowTick] = React.useState(0);
  const [view, setView] = React.useState<DashboardView>("inventory");

  React.useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const totals = React.useMemo(() => {
    const mods = Object.values(props.modules);
    return {
      takeAction: mods.reduce((s, m) => s + m.takeAction, 0),
      caseNeeded: mods.reduce((s, m) => s + m.caseNeeded, 0),
      unrecovered: mods.reduce((s, m) => s + m.pending, 0),
    };
  }, [props.modules]);

  const priorityList = React.useMemo(() => {
    return MODULE_CONFIGS
      .map((cfg) => ({ cfg, stats: props.modules[cfg.key] }))
      .filter((x) => x.stats.takeAction > 0)
      .sort((a, b) => b.stats.takeAction - a.stats.takeAction)
      .slice(0, 5);
  }, [props.modules]);

  const allClear = totals.takeAction === 0;

  async function handleRefresh() {
    try {
      const res = await props.refreshAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.rowsUpserted != null
          ? `Refreshed ${res.rowsUpserted.toLocaleString()} SKUs.`
          : "Reconciliation refreshed.",
      );
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      startTransition(() => router.refresh());
    }
  }

  // Reference nowTick so re-renders pick up new relative time
  void nowTick;
  const refreshedLabel = timeAgo(refreshedAt);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Top-bar controls (reconciled date + view toggle), rendered into the
          global header before "Sign in" via the header-actions slot. */}
      <DashboardHeaderActions view={view} onViewChange={setView} />

      {view === "financial" ? (
        <FinancialPlaceholder />
      ) : (
        <>
      {/* SECTION 1 — Sticky Alert Bar */}
      <div
        className={cn(
          "sticky top-14 z-40 -mx-4 mb-6 sm:-mx-6 lg:-mx-8",
        )}
      >
        {allClear ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-emerald-200 bg-emerald-50 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="size-4" aria-hidden />
              All reconciliations clear
            </div>
            <RefreshControls
              pending={pending}
              refreshedLabel={refreshedLabel}
              onRefresh={handleRefresh}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-red-200 bg-red-50 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <UrgencyPill
                tone="red"
                icon={<AlertTriangle className="size-3.5" aria-hidden />}
                label={`${fmt(totals.takeAction)} Total Take Action`}
                onClick={() => smoothScroll(SECTION_IDS.takeAction)}
              />
              <UrgencyPill
                tone="amber"
                icon={<FileWarning className="size-3.5" aria-hidden />}
                label={`${fmt(totals.caseNeeded)} Cases to Raise`}
                onClick={() => smoothScroll(SECTION_IDS.caseNeeded)}
              />
              <UrgencyPill
                tone="emerald"
                icon={<CircleDot className="size-3.5" aria-hidden />}
                label={`${fmt(props.cases.casesRaisedGlobal)} Cases Raised`}
                onClick={() => smoothScroll("section-cases")}
              />
              <UrgencyPill
                tone="slate"
                icon={<TrendingDown className="size-3.5" aria-hidden />}
                label={`${fmt(totals.unrecovered)} Total Units Unrecovered`}
                onClick={() => smoothScroll(SECTION_IDS.unrecovered)}
              />
            </div>
            <RefreshControls
              pending={pending}
              refreshedLabel={refreshedLabel}
              onRefresh={handleRefresh}
            />
          </div>
        )}
      </div>

      {/* SECTION 2 — KPI Flow */}
      <section
        id="section-flow"
        className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <div className="grid min-w-[840px] grid-cols-7 gap-3 sm:min-w-0">
          <KpiCard label="Shipped to FBA" value={props.flow.shipped} accent="blue" icon={Upload} />
          <KpiCard label="FBA Received" value={props.flow.received} accent="violet" icon={Package} />
          <KpiCard
            label="Net Shortage"
            value={props.flow.netShortage}
            accent={props.flow.netShortage > 0 ? "red" : "slate"}
            icon={TrendingDown}
            href="/shipment-reconciliation"
            delta={
              props.flow.shipped > 0
                ? `${((props.flow.netShortage / props.flow.shipped) * 100).toFixed(1)}%`
                : undefined
            }
          />
          <KpiCard label="Sold" value={props.flow.sold} accent="emerald" icon={ShoppingCart} />
          <KpiCard
            label="Returns"
            value={props.flow.returns}
            accent="orange"
            icon={RotateCcw}
            href="/returns-reconciliation"
          />
          <KpiCard label="Reimbursed" value={props.flow.reimbursed} accent="amber" icon={DollarSign} />
          <KpiCard
            label="Unrecovered"
            value={totals.unrecovered}
            accent={totals.unrecovered > 0 ? "red" : "emerald"}
            icon={Flame}
            emphasize
          />
        </div>
      </section>

      {/* SECTION 3 — Module Grid */}
      <section
        id="section-modules"
        className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4"
      >
        {MODULE_CONFIGS.map((cfg) => {
          const stats = props.modules[cfg.key];
          if (cfg.key === "shipment") return <ShipmentModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "removal")  return <RemovalModuleCard  key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "returns")  return <ReturnsModuleCard  key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "replacement") return <ReplacementModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "fcTransfer") return <FcTransferModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "gnr") return <GnrModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
          if (cfg.key === "adjustment") return <AdjustmentModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
          return <ModuleCard key={cfg.key} cfg={cfg} stats={stats} />;
        })}
      </section>

      {/* SECTION 3b — Priority Actions */}
      {priorityList.length > 0 ? (
        <section className="mb-6 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Flame className="size-4 text-red-500" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Priority Actions</h3>
            <span className="text-[11px] text-muted-foreground">
              top {priorityList.length}
            </span>
          </div>
          <ul className="divide-y divide-red-200/60">
            {priorityList.map(({ cfg, stats }) => (
              <li key={cfg.key}>
                <Link
                  href={`${cfg.href}?filter=take-action`}
                  className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-red-100/40"
                >
                  <span className="flex items-center gap-2">
                    <cfg.icon className="size-4 text-red-500" aria-hidden />
                    <span className="font-medium text-foreground">{cfg.name}</span>
                    <span className="text-muted-foreground">
                      — {fmt(stats.takeAction)} {stats.primaryLabel}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-red-500" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* SECTION 4 — Cases & Adjustments */}
      <section id="section-cases" className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-4 text-blue-500" aria-hidden />
              <h3 className="text-sm font-semibold">Open Cases</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="default" size="xs">
                <Link href="/cases-adjustments?tab=cases&action=new">
                  <Plus className="size-3" aria-hidden />
                  Raise New Case
                </Link>
              </Button>
              <Link
                href="/cases-adjustments?tab=cases"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            <CaseStatChipLink label="Open" value={props.cases.open} tone="amber" href="/cases-adjustments?tab=cases&status=OPEN" />
            <CaseStatChipLink label="In Progress" value={props.cases.inProgress} tone="blue" href="/cases-adjustments?tab=cases&status=IN_PROGRESS" />
            <CaseStatChipLink label="Resolved" value={props.cases.resolved} tone="emerald" href="/cases-adjustments?tab=cases&status=RESOLVED" />
            <CaseStatChipLink label="Rejected" value={props.cases.rejected} tone="red" href="/cases-adjustments?tab=cases&status=REJECTED" />
            <CaseStatChipLink label="Closed" value={props.cases.closed} tone="slate" href="/cases-adjustments?tab=cases&status=CLOSED" />
          </div>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              Approved Amount
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xl font-bold tabular-nums text-emerald-700">
                {fmtCurrency(props.cases.totalApprovedAmount)}
              </span>
              <span className="text-[11px] text-emerald-700/80">
                {fmt(props.cases.casesWithApprovedAmount)} cases with approved &gt; $0
              </span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Claimed:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {fmt(props.cases.totalClaimed)} u
              </span>
            </span>
            <span className="text-muted-foreground">
              Cases raised:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {fmt(props.cases.casesRaisedGlobal)}
              </span>
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-blue-500" aria-hidden />
              <h3 className="text-sm font-semibold">Manual Adjustments</h3>
            </div>
            <Link
              href="/cases-adjustments?tab=adjustments"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <CaseStatChip label="Quantity" value={props.adjustments.quantity} tone="blue" />
            <CaseStatChip label="Financial" value={props.adjustments.financial} tone="emerald" />
            <CaseStatChip label="Status" value={props.adjustments.status} tone="amber" />
            <CaseStatChip label="Other" value={props.adjustments.other} tone="slate" />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground">
              Total units adjusted:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {fmt(props.adjustments.totalUnits)}
              </span>
            </span>
          </div>
        </Card>
      </section>

      {/* SECTION 5 — Quick Links */}
      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <QuickLink href="/upload" icon={Upload} label="Upload Reports" />
          <QuickLink href="/data-explorer" icon={Database} label="Data Explorer" />
          <QuickLink href="/settlement-report" icon={Receipt} label="Settlement Report" />
          <QuickLink href="/sales-reconciliation" icon={DollarSign} label="Sales Recon" />
          <QuickLink href="/sales-orders" icon={ShoppingCart} label="Sales Orders" />
        </div>
      </section>
        </>
      )}
    </main>
  );
}

function FinancialPlaceholder() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-blue-50">
        <DollarSign className="size-7 text-blue-500" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        Financial reconciliation
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        A financial view of reconciliation is coming soon. For now, switch back
        to <span className="font-medium text-foreground">By Inventory</span> to
        see unit-level reconciliation across all modules.
      </p>
      <Badge variant="outline" className="mt-1 border-blue-200 bg-blue-50 text-blue-700">
        Coming soon
      </Badge>
    </div>
  );
}

function RefreshControls({
  pending,
  refreshedLabel,
  onRefresh,
}: {
  pending: boolean;
  refreshedLabel: string;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">
        Last refreshed: {refreshedLabel}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={pending}
        onClick={onRefresh}
      >
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
        Refresh
      </Button>
    </div>
  );
}

function UrgencyPill({
  tone,
  icon,
  label,
  onClick,
}: {
  tone: "red" | "amber" | "blue" | "emerald" | "slate";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const PILL_COLORS: Record<typeof tone, string> = {
    red: "border-red-500/40 bg-white text-red-700 hover:bg-red-100",
    amber: "border-amber-500/40 bg-white text-amber-700 hover:bg-amber-100",
    blue: "border-blue-500/40 bg-white text-blue-700 hover:bg-blue-100",
    emerald: "border-emerald-500/40 bg-white text-emerald-700 hover:bg-emerald-100",
    slate: "border-slate-500/40 bg-white text-slate-700 hover:bg-slate-100",
  };
  const DOT_COLORS: Record<typeof tone, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    slate: "bg-slate-500",
  };
  const colors = PILL_COLORS[tone];
  const dotColor = DOT_COLORS[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        colors,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotColor)} aria-hidden />
      {icon}
      {label}
    </button>
  );
}

const KPI_ACCENT: Record<string, string> = {
  blue: "text-blue-500",
  violet: "text-violet-500",
  red: "text-red-500",
  emerald: "text-emerald-500",
  orange: "text-orange-500",
  amber: "text-amber-500",
  slate: "text-slate-500",
};

function KpiCard({
  label,
  value,
  accent,
  icon: Icon,
  href,
  delta,
  emphasize,
}: {
  label: string;
  value: number;
  accent: keyof typeof KPI_ACCENT;
  icon: LucideIcon;
  href?: string;
  delta?: string;
  emphasize?: boolean;
}) {
  const valueColor =
    accent === "red"
      ? "text-red-600"
      : accent === "amber"
        ? "text-amber-600"
        : accent === "emerald" && emphasize
          ? "text-emerald-600"
          : "text-foreground";
  const inner = (
    <Card
      size="sm"
      className={cn(
        "h-full gap-0.5 px-2.5 py-1.5 transition-colors",
        href && "cursor-pointer hover:ring-blue-500/30",
        emphasize && accent === "red" && "bg-red-50 ring-red-300",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={cn("size-3 shrink-0", KPI_ACCENT[accent])} aria-hidden />
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-mono text-lg font-semibold tabular-nums leading-none",
            valueColor,
          )}
        >
          {fmt(value)}
        </span>
        {delta ? (
          <span className="text-[9px] font-medium text-muted-foreground">{delta}</span>
        ) : null}
      </div>
    </Card>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Stat box: vivid colored tile used in Shipment & Removal 2×2 grids ──
function StatBox({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: number;
  tone:
    | "red" | "amber" | "blue" | "emerald" | "slate"
    // Fresh tones reserved for the FC Transfer card (not used by other modules).
    | "teal" | "violet" | "indigo" | "pink";
  bold?: boolean;
}) {
  const bg: Record<string, string> = {
    red: "#F7C1C1", amber: "#FAC775", blue: "#B5D4F4",
    emerald: "#C0DD97", slate: "#D3D1C7",
    // FC Transfer — curated soft, cohesive "muted jewel" tints.
    teal: "#D7EFE7", violet: "#EAE4F4", indigo: "#E0E3F5", pink: "#F6E0DC",
  };
  const valColor: Record<string, string> = {
    red: "#791F1F", amber: "#633806", blue: "#0C447C",
    emerald: "#27500A", slate: "#444441",
    teal: "#0F6E5A", violet: "#5B3F94", indigo: "#3730A3", pink: "#9A3B2E",
  };
  const lblColor: Record<string, string> = {
    red: "#A32D2D", amber: "#854F0B", blue: "#185FA5",
    emerald: "#3B6D11", slate: "#5F5E5A",
    teal: "#15876E", violet: "#6E50AE", indigo: "#4F46B8", pink: "#B14A3A",
  };
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: bg[tone] }}>
      <div
        className={cn("font-mono text-sm tabular-nums leading-tight", bold && "font-bold")}
        style={{ color: valColor[tone] }}
      >
        {fmt(value)}
      </div>
      <div className="mt-0.5 text-[10px] font-medium leading-tight" style={{ color: lblColor[tone] }}>
        {label}
      </div>
    </div>
  );
}

// ── Shared card header: icon + name + action pill (replaces status dot) ──
function CardHeader({
  cfg,
  stats,
  tone,
}: {
  cfg: { key: string; name: string; icon: LucideIcon };
  stats: ModuleStats;
  tone: "red" | "amber" | "green";
}) {
  const Icon = cfg.icon;
  // Removal: awaiting is informational but the pill should read red like the
  // take-action modules whenever there are awaiting units.
  const pillTone =
    cfg.key === "removal" && stats.primaryValue > 0 ? "red" : tone;
  const pillStyle: React.CSSProperties =
    pillTone === "red"
      ? { background: "#FCEBEB", color: "#791F1F" }
      : pillTone === "amber"
      ? { background: "#FAEEDA", color: "#633806" }
      : { background: "#EAF3DE", color: "#27500A" };

  return (
    <div className="flex items-center justify-between gap-2 pb-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-blue-500" aria-hidden />
        <span className="truncate text-xs font-semibold text-foreground">{cfg.name}</span>
      </div>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={pillStyle}>
        {/* Removal: awaiting is informational, not take-action — always show the
            count (e.g. "16 awaiting") even when the module is otherwise clear. */}
        {cfg.key === "removal"
          ? `${fmt(stats.primaryValue)} ${SHORT_LABEL.removal}`
          : tone === "green"
          ? "✓ clear"
          : `${fmt(stats.primaryValue)} ${SHORT_LABEL[cfg.key] ?? stats.primaryLabel}`}
      </span>
    </div>
  );
}

// ── Shared card footer: cases row + action buttons ──
// hideCaseActions drops the Raise Case button + take-action badge, leaving a
// lone View link (used by Returns, which is driven from its own page).
function CardBottom({
  cfg,
  stats,
  hideCaseActions,
}: {
  cfg: { key: string; href: string; caseModuleParam: string };
  stats: ModuleStats;
  hideCaseActions?: boolean;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-1 border-t border-border pt-1.5">
      <span className="font-mono text-[10px] text-muted-foreground">
        <span className="text-blue-600">{fmt(stats.casesRaised)}↑</span>{" "}
        <span className="text-emerald-600">{fmt(stats.casesApproved)}✓</span>{" "}
        <span className="text-amber-600">{fmt(stats.casesPending)}p</span>
      </span>
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="xs" className="h-6 px-2 text-[11px]">
          <Link href={cfg.href}>
            View <ArrowRight className="ml-0.5 size-2.5" aria-hidden />
          </Link>
        </Button>
        {!hideCaseActions && stats.caseNeeded > 0 && (
          <Button asChild variant="ghost" size="xs" className="h-6 px-2 text-[11px]">
            <Link href={`/cases-adjustments?tab=cases&module=${cfg.caseModuleParam}`}>
              Raise Case
            </Link>
          </Button>
        )}
        {!hideCaseActions && stats.takeAction > 0 && (
          <Link href={`${cfg.href}?filter=take-action`}>
            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
              {fmt(stats.takeAction)}
            </Badge>
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Shipment card: 2×2 grid — Total | Received / Reimbursed | Resolved ──
// secondary[0]=Total  [1]=Received  [2]=Reimbursed  [3]=Resolved (all units).
// primaryValue/takeAction = take-action UNITS -> header pill + take-action badge.
function ShipmentModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total"      value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Received"   value={stats.secondary[1]?.value ?? 0} tone="emerald" />
        <StatBox label="Reimbursed" value={stats.secondary[2]?.value ?? 0} tone="blue" />
        <StatBox label="Resolved"   value={stats.secondary[3]?.value ?? 0} tone="amber" />
      </div>
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── Removal card: 2×2 grid — Total | Received / Partial-Missing | Reimbursed ──
// Awaiting units shown in the header pill (primaryValue). Box mirrors the
// Removal Recon page KPI cards.
// secondary[0]=Total  [1]=Received  [2]=Partial/Missing  [3]=Reimbursed
function RemovalModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total"    value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Received" value={stats.secondary[1]?.value ?? 0} tone="emerald" />
        <StatBox
          label="Partial / Missing"
          value={stats.secondary[2]?.value ?? 0}
          tone={(stats.secondary[2]?.value ?? 0) > 0 ? "red" : "emerald"}
          bold
        />
        <StatBox
          label="Reimbursed"
          value={stats.secondary[3]?.value ?? 0}
          tone={(stats.secondary[3]?.value ?? 0) > 0 ? "amber" : "slate"}
        />
      </div>
      <CardBottom cfg={cfg} stats={stats} />
    </div>
  );
}

// ── Returns card: 2×2 grid — Total | Settled / Not Found | Adjustment ──
// secondary[0]=Total  [1]=Settled  [2]=Not Found  [3]=Adjustment (all units).
// primaryValue = units in take-action (drives the header pill).
function ReturnsModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      {/* Tone layout mirrors Shipment: slate | blue (top), red(primary, bold) |
          amber (bottom). */}
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total"    value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Settled"  value={stats.secondary[1]?.value ?? 0} tone="blue" />
        <StatBox
          label="Not Found"
          value={stats.secondary[2]?.value ?? 0}
          tone={(stats.secondary[2]?.value ?? 0) > 0 ? "red" : "emerald"}
          bold
        />
        <StatBox
          label="Adjustment"
          value={stats.secondary[3]?.value ?? 0}
          tone={(stats.secondary[3]?.value ?? 0) > 0 ? "amber" : "slate"}
        />
      </div>
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── Replacement card: 2×2 grid — Total | Return / Waiting | Resolved ──
// secondary[0]=Total [1]=Return [2]=Waiting [3]=Resolved (all units).
// primaryValue = pending units (drives the header pill).
function ReplacementModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      {/* Tone layout mirrors Returns: slate | blue (top), red(primary, bold) |
          amber (bottom). */}
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total"   value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Return"  value={stats.secondary[1]?.value ?? 0} tone="blue" />
        <StatBox
          label="Waiting"
          value={stats.secondary[2]?.value ?? 0}
          tone={(stats.secondary[2]?.value ?? 0) > 0 ? "red" : "emerald"}
          bold
        />
        <StatBox
          label="Resolved"
          value={stats.secondary[3]?.value ?? 0}
          tone={(stats.secondary[3]?.value ?? 0) > 0 ? "amber" : "slate"}
        />
      </div>
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── FC Transfer card: 2×2 grid — Total MSKU | Reconcile / No Action | Cases & Adj ──
// secondary[0]=Total MSKU [1]=Reconcile [2]=No Action(in-transit+excess) [3]=Cases & Adj.
// primaryValue/takeAction = shortage+damaged+both -> header pill (top-right) +
// the take-action badge in CardBottom (bottom-right), same as Replacement.
function FcTransferModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      {/* Fresh palette unique to FC: indigo / teal / violet / pink. */}
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total MSKU" value={stats.secondary[0]?.value ?? 0} tone="indigo" />
        <StatBox label="Reconcile"  value={stats.secondary[1]?.value ?? 0} tone="teal" />
        <StatBox label="No Action"  value={stats.secondary[2]?.value ?? 0} tone="violet" />
        <StatBox label="Cases & Adj" value={stats.secondary[3]?.value ?? 0} tone="pink" />
      </div>
      {/* hideCaseActions: drop Raise Case + take-action badge -> lone View link
          right-aligned (the take-action count still shows in the header pill). */}
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── GNR card: 2×2 grid — Total | Match / Resolve | Excess ──
// secondary[0]=Total [1]=Match [2]=Resolve [3]=Excess. Mirrors the FC Transfer
// box layout; primaryValue/takeAction drive the header pill + take-action badge.
function GnrModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total"   value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Match"   value={stats.secondary[1]?.value ?? 0} tone="emerald" />
        <StatBox label="Resolve" value={stats.secondary[2]?.value ?? 0} tone="blue" />
        <StatBox
          label="Excess"
          value={stats.secondary[3]?.value ?? 0}
          tone={(stats.secondary[3]?.value ?? 0) > 0 ? "amber" : "slate"}
        />
      </div>
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── Adjustment card: 2×2 grid — Total MSKUs | Reconciled / Grade & Resell | Cases Raised ──
// secondary[0]=Total MSKUs [1]=Reconciled [2]=Grade & Resell [3]=Cases Raised.
// primaryValue/takeAction = take-action MSKU count -> header pill + take-action badge.
function AdjustmentModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      <div className="grid grid-cols-2 gap-1.5 py-1">
        <StatBox label="Total MSKUs"   value={stats.secondary[0]?.value ?? 0} tone="slate" />
        <StatBox label="Reconciled"    value={stats.secondary[1]?.value ?? 0} tone="emerald" />
        <StatBox label="Grade & Resell" value={stats.secondary[2]?.value ?? 0} tone="teal" />
        <StatBox label="Cases Raised"  value={stats.secondary[3]?.value ?? 0} tone="amber" />
      </div>
      <CardBottom cfg={cfg} stats={stats} hideCaseActions />
    </div>
  );
}

// ── Standard module card (Full) ──
function ModuleCard({
  cfg,
  stats,
}: {
  cfg: ModuleCardConfig;
  stats: ModuleStats;
}) {
  const tone = moduleStatus(stats);
  return (
    <div className="flex flex-col gap-0 px-3 py-2.5" style={cardBorderStyle(tone)}>
      <CardHeader cfg={cfg} stats={stats} tone={tone} />
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 py-1.5 text-[11px]">
        {stats.secondary.slice(0, 4).map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="mr-1 truncate text-muted-foreground">{s.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {fmt(s.value)}
            </span>
          </div>
        ))}
      </div>
      <CardBottom cfg={cfg} stats={stats} />
    </div>
  );
}

type ChipTone = "red" | "amber" | "blue" | "emerald" | "slate";

// Background — use -100 stop (clearly visible, not just a whisper)
const CHIP_BG: Record<ChipTone, string> = {
  red:     "#F7C1C1",  // red-100
  amber:   "#FAC775",  // amber-100
  blue:    "#B5D4F4",  // blue-100
  emerald: "#C0DD97",  // green-100
  slate:   "#D3D1C7",  // gray-200
};

// Value text — use -800 stop (dark enough to read on the colored bg)
const CHIP_COLOR: Record<ChipTone, string> = {
  red:     "#791F1F",  // red-800
  amber:   "#633806",  // amber-800
  blue:    "#0C447C",  // blue-800
  emerald: "#27500A",  // green-800
  slate:   "#444441",  // gray-800
};

// Label text — use -700 stop (slightly lighter than value)
const CHIP_LABEL_COLOR: Record<ChipTone, string> = {
  red:     "#A32D2D",
  amber:   "#854F0B",
  blue:    "#185FA5",
  emerald: "#3B6D11",
  slate:   "#5F5E5A",
};

function CaseStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: ChipTone;
}) {
  return (
    <div className="rounded-lg px-2 py-2" style={{ background: CHIP_BG[tone] }}>
      <div
        className="font-mono text-base font-semibold tabular-nums"
        style={{ color: CHIP_COLOR[tone] }}
      >
        {fmt(value)}
      </div>
      <div
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: CHIP_LABEL_COLOR[tone] }}
      >
        {label}
      </div>
    </div>
  );
}

function CaseStatChipLink({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: ChipTone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-2 py-2 transition-opacity hover:opacity-80"
      style={{ background: CHIP_BG[tone] }}
    >
      <div
        className="font-mono text-base font-semibold tabular-nums"
        style={{ color: CHIP_COLOR[tone] }}
      >
        {fmt(value)}
      </div>
      <div
        className="text-[10px] font-medium uppercase tracking-wide"
        style={{ color: CHIP_LABEL_COLOR[tone] }}
      >
        {label}
      </div>
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-border hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-4 text-blue-500" aria-hidden />
      {label}
    </Link>
  );
}
