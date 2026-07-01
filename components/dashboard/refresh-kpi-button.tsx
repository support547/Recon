"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTrackPending } from "@/components/nav/nav-progress-store";

type RefreshActionResult =
  | { ok: true; rowsUpserted?: number; error?: undefined }
  | { ok: false; error: string };

type RefreshKpiButtonProps = {
  /**
   * Server action passed by parent (wired in Task C).
   * If omitted the button only triggers router.refresh().
   */
  refreshAction?: () => Promise<RefreshActionResult>;
  /** Button label. Defaults to "Refresh KPIs". */
  label?: string;
  /**
   * Format the success toast given the rowsUpserted count returned by
   * the server action. Defaults to the KPI-style "Refreshed N SKUs." message.
   */
  successMessage?: (rowsUpserted: number | undefined) => string;
};

export function RefreshKpiButton({
  refreshAction,
  label = "Refresh KPIs",
  successMessage,
}: RefreshKpiButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  useTrackPending(pending);

  async function handleClick() {
    try {
      if (refreshAction) {
        const res = await refreshAction();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (successMessage) {
          toast.success(successMessage(res.rowsUpserted));
        } else {
          toast.success(
            res.rowsUpserted != null
              ? `Refreshed ${res.rowsUpserted.toLocaleString()} SKUs.`
              : "Reconciliation summary refreshed.",
          );
        }
      } else {
        toast.info("Refreshing dashboard…");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      startTransition(() => router.refresh());
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={pending}
      onClick={handleClick}
    >
      <RefreshCw
        className={`size-3.5 ${pending ? "animate-spin" : ""}`}
        aria-hidden
      />
      {label}
    </Button>
  );
}
