"use client";

import * as React from "react";

import { HeaderActions } from "@/components/layout/header-actions";
import { cn } from "@/lib/utils";

export type DashboardView = "inventory" | "financial";

/**
 * Inventory/Financial view toggle, injected into the global header bar
 * (before "Sign in"). `view`/`onViewChange` are controlled by the dashboard
 * client so the toggle can switch the page body.
 *
 * NOTE: a "last reconciled date" control will live here too — deferred until
 * we add server-side persistence so it shows across browsers/devices.
 */
export function DashboardHeaderActions({
  view,
  onViewChange,
}: {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
}) {
  return (
    <HeaderActions>
      <div className="inline-flex items-center rounded-md border border-border bg-muted/50 p-0.5">
        <ToggleButton
          active={view === "inventory"}
          onClick={() => onViewChange("inventory")}
        >
          By Inventory
        </ToggleButton>
        <ToggleButton
          active={view === "financial"}
          onClick={() => onViewChange("financial")}
        >
          By Financial
        </ToggleButton>
      </div>
    </HeaderActions>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-white text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
