"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex max-w-full items-center rounded-[20px] px-[7px] py-0.5 text-[10px] font-bold leading-tight",
  {
    variants: {
      variant: {
        blue: "bg-[#eff4ff] text-[#1a56db]",
        green: "bg-[#ecfdf3] text-[#027a48]",
        red: "bg-[#fff4f2] text-[#b42318]",
        yellow: "bg-[#fffbeb] text-[#92400e]",
        teal: "bg-[#f0fdfa] text-[#0d9488]",
        grey: "bg-[#f1f5f9] text-[#4b5563]",
        purple: "bg-[#f5f3ff] text-[#5b21b6]",
        orange: "bg-[#fff7ed] text-[#c2410c]",
      },
    },
    defaultVariants: {
      variant: "grey",
    },
  },
);

export type ChipVariant = NonNullable<VariantProps<typeof chipVariants>["variant"]>;

export type ChipProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof chipVariants> & {
    /** Use DM Mono (IDs, dates, SKUs). */
    mono?: boolean;
  };

export function Chip({
  className,
  variant,
  mono,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        chipVariants({ variant }),
        mono && "font-[family-name:var(--font-dm-mono)]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
