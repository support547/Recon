"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type FilterBarProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Container: white surface, border, rounded 10px, horizontal filters + trailing actions.
 */
export function FilterBar({ className, ...props }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-[10px] rounded-[10px] border border-[#e4e7ec] bg-white px-[14px] py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export type FilterFieldProps = {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label (9px uppercase gray) above control — pass Input, Select, etc. as children.
 */
export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: FilterFieldProps) {
  return (
    <div className={cn("flex min-w-[100px] flex-col gap-1", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[9px] font-bold uppercase tracking-wide text-[#9ca3af]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export type FilterInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Default filter text input — 30px height, 7px radius, 12px text.
 */
export function FilterInput({ className, ...props }: FilterInputProps) {
  return (
    <input
      className={cn(
        "h-[30px] w-full min-w-[120px] rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 text-xs text-[#0f1117] placeholder:text-[#9ca3af] outline-none transition-[box-shadow] focus-visible:border-[#1a56db] focus-visible:ring-2 focus-visible:ring-[#1a56db]/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export type FilterBarActionsProps = React.HTMLAttributes<HTMLDivElement>;

/** Right-aligned cluster (e.g. Clear). Use `className="ml-auto"` when not flex-wrapping. */
export function FilterBarActions({ className, ...props }: FilterBarActionsProps) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}
