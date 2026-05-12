"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { ReportTypeValue } from "@/lib/upload-report-types";

export type ReportTypeMeta = {
  value: ReportTypeValue;
  label: string;
  sub: string;
  templateFile: string;
};

export const REPORT_TYPE_META: readonly ReportTypeMeta[] = [
  { value: "shipped_to_fba",    label: "Shipped to FBA",    sub: "Inbound shipment to FBA report",       templateFile: "shipped.csv" },
  { value: "sales_data",        label: "Sales Data",        sub: "Amazon order sales data",              templateFile: "sales.csv" },
  { value: "fba_receipts",      label: "FBA Receipts",      sub: "FBA warehouse receipt events",         templateFile: "receipts.csv" },
  { value: "customer_returns",  label: "Customer Returns",  sub: "Customer return events from FBA",      templateFile: "returns.csv" },
  { value: "reimbursements",    label: "Reimbursements",    sub: "Amazon reimbursement report",          templateFile: "reimbursements.csv" },
  { value: "fc_transfers",      label: "FC Transfers",      sub: "FC-to-FC transfer events",             templateFile: "fctransfer.csv" },
  { value: "replacements",      label: "Replacements",      sub: "Amazon replacement orders report",     templateFile: "replacements.csv" },
  { value: "gnr_report",        label: "Grade & Resell",    sub: "Automated Grade and Resell report",    templateFile: "gnr.csv" },
  { value: "fba_removals",      label: "Removals",          sub: "FBA removal order report",             templateFile: "removals.csv" },
  { value: "removal_shipments", label: "Removal Shipments", sub: "Removal shipment detail report",       templateFile: "removal-shipments.csv" },
  { value: "shipment_status",   label: "Shipment Receiving",sub: "FBA inbound shipment status",          templateFile: "shipment-receiving.csv" },
  { value: "fba_summary",       label: "FBA Summary",       sub: "FBA ending balance report",            templateFile: "fbasummary.csv" },
  { value: "payment_repository",label: "Payment Repository",sub: "Amazon Payment / Transaction report",  templateFile: "payment_repository.csv" },
  { value: "settlement_report", label: "Settlement Report", sub: "Amazon settlement (orders/refunds/other)", templateFile: "" },
] as const;

export function getReportTypeMeta(rt: ReportTypeValue): ReportTypeMeta {
  return (
    REPORT_TYPE_META.find((m) => m.value === rt) ?? {
      value: rt,
      label: rt,
      sub: "",
      templateFile: "",
    }
  );
}

type TypePillsProps = {
  selectedType: ReportTypeValue;
  onChange: (rt: ReportTypeValue) => void;
  disabled?: boolean;
};

export function TypePills({ selectedType, onChange, disabled }: TypePillsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Select Report Type to Upload
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REPORT_TYPE_META.map((t) => {
          const active = t.value === selectedType;
          return (
            <button
              key={t.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.value)}
              className={cn(
                "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/50 text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
