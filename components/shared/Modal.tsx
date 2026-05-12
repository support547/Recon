"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Passed to DialogContent (width, max-height, etc.). */
  contentClassName?: string;
  showCloseButton?: boolean;
};

/**
 * ERP-styled dialog — shadcn/Radix underneath, surface/border tokens from legacy HTML.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
  showCloseButton = true,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          "gap-0 overflow-hidden rounded-xl border border-[#e4e7ec] bg-[var(--erp-surface)] p-0 shadow-lg sm:max-w-lg",
          contentClassName,
        )}
      >
        <DialogHeader className="space-y-1 border-b border-[#e4e7ec] px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold text-[#0f1117]">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-xs leading-relaxed text-[#4b5563]">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-5 py-4 text-sm text-[#0f1117]">
          {children}
        </div>
        {footer ? (
          <DialogFooter className="border-t border-[#e4e7ec] bg-[#f8fafc] px-5 py-3 sm:justify-end">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
