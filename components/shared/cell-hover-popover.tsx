"use client";

import * as React from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export type CellHoverPopoverProps = {
  /** Visible cell content (number, formatted string, JSX). */
  trigger: React.ReactNode;
  /** Title shown in the popover header. */
  title: React.ReactNode;
  /** Optional count of detail rows. Rendered next to the title. */
  count?: number | null;
  /** Popover body (typically a list of detail rows). */
  children: React.ReactNode;
  /** Pixel width of the popover content. Default 384. */
  width?: number;
  /** Side relative to trigger. Default "top". */
  side?: "top" | "right" | "bottom" | "left";
  /** Extra trigger className (e.g. amount color). */
  triggerClassName?: string;
};

/**
 * Cell hover popover used across recon tables.
 *
 * Replaces the legacy `dataTip()` / `htip()` calls from the HTML source
 * with an interactive, scrollable popover. Trigger is keyboard-focusable
 * so the content also reveals on focus (not just mouse hover).
 */
export function CellHoverPopover({
  trigger,
  title,
  count,
  children,
  width = 384,
  side = "top",
  triggerClassName,
}: CellHoverPopoverProps) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-help border-0 bg-transparent p-0 text-left font-mono tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
            triggerClassName,
          )}
        >
          {trigger}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        className="p-0"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span className="truncate">{title}</span>
          {count != null ? (
            <span className="ml-2 shrink-0 font-mono tabular-nums">
              {count.toLocaleString()} {count === 1 ? "entry" : "entries"}
            </span>
          ) : null}
        </div>
        <div className="max-h-72 overflow-auto p-1 text-xs">{children}</div>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Small two-column row helper for use inside CellHoverPopover content blocks.
 */
export function CellHoverRow({
  left,
  right,
  className,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-border/60 px-2 py-1 last:border-b-0",
        className,
      )}
    >
      <span className="truncate text-foreground">{left}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
        {right}
      </span>
    </div>
  );
}
