"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, Receipt, RefreshCw, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DashboardHeaderActions,
  type DashboardView,
} from "@/components/dashboard/DashboardHeaderActions";
import { useTrackPending } from "@/components/nav/nav-progress-store";
import { cn } from "@/lib/utils";
import {
  FinancialPlaceholder,
  QuickLink,
} from "@/components/dashboard/ReconDashboardClient";

type ModuleKey =
  | "shipment"
  | "removal"
  | "returns"
  | "replacement"
  | "fcTransfer"
  | "gnr"
  | "adjustment"
  | "full";

type ShellProps = {
  refreshAction: () => Promise<
    | { ok: true; rowsUpserted?: number }
    | { ok: false; error: string }
  >;
  lastRefreshedSlot: React.ReactNode;
  alertBarSlot: React.ReactNode;
  kpiBandSlot: React.ReactNode;
  moduleSlots: Record<ModuleKey, React.ReactNode>;
  prioritySlot: React.ReactNode;
  casesSlot: React.ReactNode;
  adjustmentsSlot: React.ReactNode;
};

export function ReconDashboardShell(props: ShellProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);
  const [view, setView] = React.useState<DashboardView>("inventory");

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      startTransition(() => router.refresh());
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <DashboardHeaderActions view={view} onViewChange={setView} />

      {view === "financial" ? (
        <FinancialPlaceholder />
      ) : (
        <>
          <div className="sticky top-14 z-40 -mx-4 mb-6 border-y bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {props.alertBarSlot}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {props.lastRefreshedSlot}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={pending}
                  onClick={handleRefresh}
                >
                  <RefreshCw
                    className={cn("size-3.5", pending && "animate-spin")}
                    aria-hidden
                  />
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <section
            id="section-flow"
            className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          >
            <div className="grid min-w-[840px] grid-cols-7 gap-3 sm:min-w-0">
              {props.kpiBandSlot}
            </div>
          </section>

          <section
            id="section-modules"
            className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4"
          >
            {props.moduleSlots.shipment}
            {props.moduleSlots.removal}
            {props.moduleSlots.returns}
            {props.moduleSlots.replacement}
            {props.moduleSlots.fcTransfer}
            {props.moduleSlots.gnr}
            {props.moduleSlots.adjustment}
            {props.moduleSlots.full}
          </section>

          {props.prioritySlot}

          <section
            id="section-cases"
            className="mb-6 grid gap-4 md:grid-cols-2"
          >
            {props.casesSlot}
            {props.adjustmentsSlot}
          </section>

          <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <QuickLink href="/upload" icon={Upload} label="Upload Reports" />
              <QuickLink
                href="/data-explorer"
                icon={Database}
                label="Data Explorer"
              />
              <QuickLink
                href="/settlement-report"
                icon={Receipt}
                label="Settlement Breakup"
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
