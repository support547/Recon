"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type PaginationProps = {
  /** 1-based */
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  /** Max page buttons to show (including current). Default 7. */
  siblingCount?: number;
  className?: string;
};

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function getPageButtons(current: number, totalPages: number, siblingCount: number) {
  if (totalPages <= 7) return range(1, totalPages);

  const left = Math.max(2, current - siblingCount);
  const right = Math.min(totalPages - 1, current + siblingCount);

  const pages: (number | "ellipsis")[] = [1];
  if (left > 2) pages.push("ellipsis");
  pages.push(...range(left, right));
  if (right < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);

  return pages;
}

const btnBase =
  "rounded-[6px] px-2.5 py-[5px] text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Pagination({
  page,
  pageSize,
  totalRows,
  onPageChange,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalRows);

  const pages = getPageButtons(safePage, totalPages, siblingCount);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-[11px] text-[#4b5563] sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <span className="tabular-nums">
        {totalRows === 0
          ? "No rows"
          : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${totalRows.toLocaleString()}`}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={cn(btnBase, "text-[#0f1117] hover:bg-[#f1f5f9]")}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e-${i}`} className="px-1 text-[#9ca3af]">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={cn(
                btnBase,
                "min-w-[2.25rem] tabular-nums",
                p === safePage
                  ? "bg-[#1a56db] font-semibold text-white"
                  : "text-[#0f1117] hover:bg-[#f1f5f9]",
              )}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(btnBase, "text-[#0f1117] hover:bg-[#f1f5f9]")}
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
