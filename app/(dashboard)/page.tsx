import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Layers,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  getDashboardCoverage,
  getDashboardKpis,
  getDashboardRecentUploads,
} from "@/actions/dashboard";
import { refreshReconciliationSummary } from "@/actions/reconciliation-refresh";
import { RefreshKpiButton } from "@/components/dashboard/refresh-kpi-button";
import { SummaryCard } from "@/components/shared/SummaryCard";

function fmtNumber(n: number): string {
  return n.toLocaleString();
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function prettyReportType(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const COVERAGE_COLORS: Record<string, string> = {
  shipped_to_fba: "bg-blue-500",
  sales_data: "bg-emerald-500",
  fba_receipts: "bg-violet-500",
  customer_returns: "bg-orange-500",
  reimbursements: "bg-amber-500",
  fba_removals: "bg-red-500",
  fc_transfers: "bg-sky-500",
  shipment_status: "bg-indigo-500",
  fba_summary: "bg-pink-500",
  replacements: "bg-teal-500",
  adjustments: "bg-yellow-500",
  gnr_report: "bg-fuchsia-500",
  payment_repository: "bg-cyan-500",
  removal_shipments: "bg-rose-500",
};

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  let kpis;
  let uploads;
  let coverage;
  try {
    [kpis, uploads, coverage] = await Promise.all([
      getDashboardKpis(),
      getDashboardRecentUploads(10),
      getDashboardCoverage(),
    ]);
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">
            Failed to load dashboard
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </main>
    );
  }

  const varianceClass =
    kpis.totalVariance > 0
      ? "text-emerald-600"
      : kpis.totalVariance < 0
        ? "text-red-600"
        : "text-muted-foreground";

  const VarianceIcon =
    kpis.totalVariance < 0 ? TrendingDown : TrendingUp;

  const maxCoverage = Math.max(...coverage.map((c) => c.totalRows), 1);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Overview
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Inventory reconciliation health, recent uploads, and data coverage
            across all report types.
            {kpis.lastRefreshedAt ? (
              <span className="ml-2 text-xs">
                Last refresh: {fmtDateTime(kpis.lastRefreshedAt)}
              </span>
            ) : null}
          </p>
        </div>
        <RefreshKpiButton refreshAction={refreshReconciliationSummary} />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard
          label="Total SKUs"
          value={
            <span className="inline-flex items-center gap-2">
              <Layers className="size-4 text-blue-500" aria-hidden />
              {fmtNumber(kpis.totalSkus)}
            </span>
          }
          accent="blue"
          sub="Across reconciliation summary"
        />
        <SummaryCard
          label="Matched"
          value={
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
              {fmtNumber(kpis.matched)}
            </span>
          }
          accent="green"
          sub={
            kpis.totalSkus > 0
              ? `${Math.round((kpis.matched / kpis.totalSkus) * 100)}% of SKUs`
              : undefined
          }
        />
        <SummaryCard
          label="Mismatches"
          value={
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-500" aria-hidden />
              {fmtNumber(kpis.mismatches)}
            </span>
          }
          accent="red"
          sub={
            kpis.totalSkus > 0
              ? `${Math.round((kpis.mismatches / kpis.totalSkus) * 100)}% of SKUs`
              : undefined
          }
        />
        <SummaryCard
          label="Pending"
          value={
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="size-4 text-amber-500" aria-hidden />
              {fmtNumber(kpis.pending)}
            </span>
          }
          accent="yellow"
          sub="Awaiting reconciliation"
        />
        <SummaryCard
          label="Total Variance"
          value={
            <span className={`inline-flex items-center gap-2 ${varianceClass}`}>
              <VarianceIcon className="size-4" aria-hidden />
              {fmtNumber(Math.abs(kpis.totalVariance))} u
            </span>
          }
          accent={
            kpis.totalVariance < 0
              ? "red"
              : kpis.totalVariance > 0
                ? "green"
                : "grey"
          }
          sub="Σ(expected − actual)"
        />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Top mismatches
            </h3>
            <span className="text-xs text-muted-foreground">
              by variance
            </span>
          </div>
          {kpis.topMismatchSkus.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No mismatches.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {kpis.topMismatchSkus.map((r) => (
                <li
                  key={r.msku}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                >
                  <span className="truncate font-mono">{r.msku}</span>
                  <span className="shrink-0 tabular-nums text-red-600">
                    {fmtNumber(r.variance)} u
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Top variance SKUs
            </h3>
            <span className="text-xs text-muted-foreground">|variance| ≠ 0</span>
          </div>
          {kpis.topVarianceSkus.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No variance recorded.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {kpis.topVarianceSkus.map((r) => (
                <li
                  key={r.msku}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {r.msku}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      r.variance < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {fmtNumber(r.variance)} u
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Pending reconciliations
            </h3>
            <span className="text-xs text-muted-foreground">recent</span>
          </div>
          {kpis.topPendingSkus.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No pending items.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {kpis.topPendingSkus.map((r) => (
                <li
                  key={r.msku}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                >
                  <span className="truncate font-mono">{r.msku}</span>
                  <span className="shrink-0 tabular-nums text-amber-600">
                    {fmtNumber(r.expectedQty)} / {fmtNumber(r.actualQty)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Data coverage
          </h3>
          <span className="text-xs text-muted-foreground">
            rows per report type
          </span>
        </div>
        {coverage.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Database
              className="mx-auto mb-2 size-8 text-border"
              aria-hidden
            />
            <p className="font-medium">No data uploaded yet</p>
            <a
              href="/upload"
              className="text-xs text-blue-600 hover:underline"
            >
              Upload your first report →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {coverage.map((c) => {
              const pct = Math.round((c.totalRows / maxCoverage) * 100);
              const color =
                COVERAGE_COLORS[c.reportType] ?? "bg-slate-400";
              return (
                <div
                  key={c.reportType}
                  className="grid grid-cols-[180px_1fr_90px_140px] items-center gap-3 border-b border-border/70 py-1.5 last:border-b-0"
                >
                  <span className="truncate text-xs font-medium text-foreground">
                    {prettyReportType(c.reportType)}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${color} transition-[width]`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-right font-mono text-xs tabular-nums text-foreground">
                    {fmtNumber(c.totalRows)}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground">
                    {fmtDateTime(c.lastUpload)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Recent uploads
          </h3>
          <a
            href="/upload"
            className="text-xs text-blue-600 hover:underline"
          >
            View all uploads →
          </a>
        </div>
        {uploads.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No uploads yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Report</th>
                  <th className="px-2 py-2 font-medium">Filename</th>
                  <th className="px-2 py-2 text-right font-medium">Rows</th>
                  <th className="px-2 py-2 text-right font-medium">Skipped</th>
                  <th className="px-2 py-2 text-right font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="px-2 py-2">
                      {prettyReportType(u.reportType)}
                    </td>
                    <td
                      className="max-w-[260px] truncate px-2 py-2 font-mono"
                      title={u.filename}
                    >
                      {u.filename}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNumber(u.rowCount)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {u.rowsSkipped ? fmtNumber(u.rowsSkipped) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {fmtDateTime(u.uploadedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
