"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const accentBar = cva("border-t-[3px]", {
  variants: {
    accent: {
      blue: "border-t-[#1a56db]",
      green: "border-t-[#027a48]",
      red: "border-t-[#b42318]",
      yellow: "border-t-[#92400e]",
      orange: "border-t-[#c2410c]",
      purple: "border-t-[#5b21b6]",
      teal: "border-t-[#0d9488]",
      grey: "border-t-[#c8cdd8]",
    },
  },
  defaultVariants: {
    accent: "blue",
  },
});

export type SummaryCardAccent = NonNullable<
  VariantProps<typeof accentBar>["accent"]
>;

export type SummaryCardProps = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: SummaryCardAccent;
  className?: string;
};

export function SummaryCard({
  label,
  value,
  sub,
  accent = "blue",
  className,
}: SummaryCardProps) {
  return (
    <div
      className={cn(
        "min-w-[110px] rounded-lg border border-[#e4e7ec] bg-white px-3 py-2 shadow-sm",
        accentBar({ accent }),
        className,
      )}
    >
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-[#9ca3af]">
        {label}
      </div>
      <div className="mt-1 font-[family-name:var(--font-dm-mono)] text-lg font-bold leading-tight text-[#0f1117]">
        {value}
      </div>
      {sub != null && sub !== "" ? (
        <div className="mt-0.5 text-[9px] text-[#4b5563]">{sub}</div>
      ) : null}
    </div>
  );
}
