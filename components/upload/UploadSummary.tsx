"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { UploadSummaryRow } from "@/lib/upload-report-types";

function formatDateTime(d: Date) {
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type UploadSummaryProps = {
  summary: UploadSummaryRow | null;
};

export function UploadSummary({ summary }: UploadSummaryProps) {
  const uploads = summary?.uploadCount ?? 0;
  const totalRows = summary?.totalRows ?? 0;
  const lastRows = summary?.lastRowCount ?? 0;
  const lastUpload = summary?.lastUpload ?? null;
  const latestInFile = summary?.latestInFile ?? null;
  const hasData = uploads > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-bold text-foreground">Upload Summary</div>
      </div>
      <div className="p-4">
        <div
          className={cn(
            "mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
            hasData
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border border-border bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {hasData ? <>✅ Data loaded</> : <>⏳ No uploads yet for this type</>}
        </div>

        <dl className="divide-y divide-border text-xs">
          <Row label="Total Uploads" value={uploads.toLocaleString()} accent="blue" />
          <Row label="Total Rows" value={totalRows.toLocaleString()} accent="green" />
          <Row label="Last Upload Rows" value={lastRows.toLocaleString()} />
          <Row
            label="Last Uploaded"
            value={lastUpload ? formatDateTime(lastUpload) : "—"}
          />
          <Row
            label="Latest in File"
            value={latestInFile ? formatDate(latestInFile) : "—"}
          />
        </dl>
      </div>
    </div>
  );
}

type RowProps = {
  label: string;
  value: string;
  accent?: "blue" | "green";
};

function Row({ label, value, accent }: RowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-sm font-bold tabular-nums",
          accent === "blue" && "text-primary",
          accent === "green" && "text-emerald-600 dark:text-emerald-400",
          !accent && "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
