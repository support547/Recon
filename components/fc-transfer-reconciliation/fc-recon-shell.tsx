"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { FcTransferReconciliationClient } from "@/components/fc-transfer-reconciliation/fc-transfer-reconciliation-client";
import { FcByFcView } from "@/components/fc-transfer-reconciliation/by-fc/by-fc-view";
import type { FcFullReconPayload } from "@/actions/fc-transfer-reconciliation";
import type { Marketplace } from "@/lib/branding/marketplaces";

type View = "msku" | "fc";

/**
 * Thin shell adding a top-bar "By MSKU" / "By FC" segmented toggle to the FC
 * Transfer Reconciliation page — rendered into the shared header actions slot,
 * same placement/style as Replacement Recon's By-MSKU/By-ASIN pill.
 *
 * "By MSKU" renders the existing client UNCHANGED (same seeded props), with the
 * toggle injected into the client's own header actions. "By FC" is a placeholder.
 * Selected view is mirrored to ?view= so refresh/deep-links stick.
 */
export function FcReconShell({
  initialFullPayload,
  initialView = "msku",
  marketplace = null,
}: {
  initialFullPayload?: FcFullReconPayload;
  initialView?: View;
  marketplace?: Marketplace | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramView = searchParams.get("view");
  const view: View = paramView === "fc" ? "fc" : paramView === "msku" ? "msku" : initialView;

  const setView = React.useCallback(
    (next: View) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "msku") params.delete("view");
      else params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const switcher = <ViewSwitcher view={view} onChange={setView} />;

  // Each view owns its own single HeaderActions slot (Columns/Export/Refresh),
  // with the By-MSKU / By-FC pill injected into it. Only one view is mounted at a
  // time, so the two HeaderActions never clash. By-FC lazy-fetches its own data.
  if (view === "msku") {
    return (
      <FcTransferReconciliationClient
        initialFullPayload={initialFullPayload}
        viewSwitcher={switcher}
        marketplace={marketplace}
      />
    );
  }
  return <FcByFcView viewSwitcher={switcher} />;
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      <button
        type="button"
        className={cn(
          "rounded-md px-3 py-1 text-xs font-semibold transition",
          view === "msku" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
        )}
        onClick={() => onChange("msku")}
      >
        By MSKU
      </button>
      <button
        type="button"
        className={cn(
          "rounded-md px-3 py-1 text-xs font-semibold transition",
          view === "fc" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground",
        )}
        onClick={() => onChange("fc")}
      >
        By FC
      </button>
    </div>
  );
}
