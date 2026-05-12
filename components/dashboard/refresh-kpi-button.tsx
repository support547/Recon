"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type RefreshActionResult =
  | { ok: true; rowsUpserted?: number; error?: undefined }
  | { ok: false; error: string };

type RefreshKpiButtonProps = {
  /**
   * Server action passed by parent (wired in Task C).
   * If omitted the button only triggers router.refresh().
   */
  refreshAction?: () => Promise<RefreshActionResult>;
};

export function RefreshKpiButton({ refreshAction }: RefreshKpiButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  async function handleClick() {
    try {
      if (refreshAction) {
        const res = await refreshAction();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          res.rowsUpserted != null
            ? `Refreshed ${res.rowsUpserted.toLocaleString()} SKUs.`
            : "Reconciliation summary refreshed.",
        );
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
      Refresh KPIs
    </Button>
  );
}
