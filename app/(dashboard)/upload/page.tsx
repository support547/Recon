"use client";

import * as React from "react";

import { getUploadHistory, getUploadSummaryByType } from "@/actions/uploads";
import type {
  ReportTypeValue,
  UploadHistoryRow,
  UploadSummaryRow,
} from "@/lib/upload-report-types";
import { TypePills, getReportTypeMeta } from "@/components/upload/TypePills";
import { UploadSummary } from "@/components/upload/UploadSummary";
import { UploadHistory } from "@/components/upload/UploadHistory";
import { UploadZone } from "@/components/upload/UploadZone";

export default function UploadReportsPage() {
  const [selectedType, setSelectedType] =
    React.useState<ReportTypeValue>("shipped_to_fba");
  const [summaryRows, setSummaryRows] = React.useState<UploadSummaryRow[]>([]);
  const [historyRows, setHistoryRows] = React.useState<UploadHistoryRow[]>([]);
  const [uploadPending, setUploadPending] = React.useState(false);

  const meta = getReportTypeMeta(selectedType);

  const refreshHistory = React.useCallback(async (rt: ReportTypeValue) => {
    const rows = await getUploadHistory(rt);
    setHistoryRows(rows);
  }, []);

  const refreshSummary = React.useCallback(async () => {
    const rows = await getUploadSummaryByType();
    setSummaryRows(rows);
  }, []);

  React.useEffect(() => {
    void refreshHistory(selectedType);
  }, [selectedType, refreshHistory]);

  React.useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  const onUploadedOrMutated = React.useCallback(() => {
    void refreshSummary();
    void refreshHistory(selectedType);
  }, [refreshSummary, refreshHistory, selectedType]);

  const summaryForType =
    summaryRows.find((r) => r.reportType === selectedType) ?? null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-1 border-b border-border pb-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Upload — {meta.label}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Import Amazon report exports (CSV, TSV, or Excel). Pick the report
          type below.
        </p>
      </div>

      <div className="mb-5">
        <TypePills
          selectedType={selectedType}
          onChange={(rt) => setSelectedType(rt)}
          disabled={uploadPending}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <UploadZone
          selectedType={selectedType}
          title={meta.label}
          subtitle={meta.sub}
          templateFile={meta.templateFile}
          onUploaded={onUploadedOrMutated}
          onPendingChange={setUploadPending}
        />
        <UploadSummary summary={summaryForType} />
      </div>

      <UploadHistory rows={historyRows} onMutated={onUploadedOrMutated} />
    </main>
  );
}
