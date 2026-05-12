"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ExportCsvButtonProps = {
  /** Whitelisted table slug per /api/export/[table]/route.ts */
  table: string;
  /** Visible label */
  label?: string;
  /** Pass-through query string (e.g. "search=foo&from=2024-01-01") */
  query?: string;
  className?: string;
};

export function ExportCsvButton({
  table,
  label = "Export CSV",
  query,
  className,
}: ExportCsvButtonProps) {
  const href =
    `/api/export/${encodeURIComponent(table)}` + (query ? `?${query}` : "");
  return (
    <Button
      asChild
      type="button"
      variant="outline"
      size="sm"
      className={className}
    >
      <a href={href} download>
        <Download className="size-3.5" aria-hidden />
        {label}
      </a>
    </Button>
  );
}
