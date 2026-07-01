"use client";

import * as React from "react";
import { Download, FileSpreadsheet, PencilLine, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type View = "menu" | "upload";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importing: boolean;
  onSelectManual: () => void;
  onSelectFile: (file: File) => void | Promise<void>;
};

/**
 * Chooser dialog for the "Add Transactions" flow. Two paths:
 *   - Upload CSV → reveals an in-modal drop/browse zone plus a
 *     "Download template" link (public/upload-templates/bank-statement.csv).
 *     Actual import is performed by the parent via `onSelectFile`, which
 *     reuses the existing /api/bank-reconciliation/import handler.
 *   - Enter manually → parent closes this dialog and opens the existing
 *     bank-recon-form-modal.tsx.
 *
 * This is a pure UI wrapper: no parsing, no server calls.
 */
export function BankReconAddModal({
  open,
  onOpenChange,
  importing,
  onSelectManual,
  onSelectFile,
}: Props) {
  const [view, setView] = React.useState<View>("menu");
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setView("menu");
  }, [open]);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    await onSelectFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>
            {view === "menu" ? "Add transactions" : "Upload bank statement"}
          </DialogTitle>
          <DialogDescription>
            {view === "menu"
              ? "Choose how you'd like to add bank transactions."
              : "CSV or XLSX. Store/currency + matchability auto-detected from each row."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 py-2">
          {view === "menu" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setView("upload")}
                className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40"
              >
                <div className="flex size-9 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  Upload CSV
                </div>
                <div className="text-xs text-muted-foreground">
                  Import a bank statement file. Bulk classification and
                  duplicate skip.
                </div>
              </button>

              <button
                type="button"
                onClick={onSelectManual}
                className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40"
              >
                <div className="flex size-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200">
                  <PencilLine className="size-5" aria-hidden />
                </div>
                <div className="text-sm font-semibold text-foreground">
                  Enter manually
                </div>
                <div className="text-xs text-muted-foreground">
                  Add a single transaction using the form.
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-700">
                  Need the right column headers?
                </span>
                <a
                  href="/upload-templates/bank-statement.csv"
                  download="bank-statement.csv"
                  className="inline-flex items-center gap-1.5 font-medium text-indigo-700 hover:text-indigo-900"
                >
                  <Download className="size-3.5" aria-hidden />
                  Download template
                </a>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                  dragging
                    ? "border-indigo-400 bg-indigo-50/60"
                    : "border-slate-300 bg-slate-50/40",
                )}
              >
                <Upload className="size-8 text-slate-500" aria-hidden />
                <div className="text-sm font-medium text-foreground">
                  Drop your bank statement here
                </div>
                <div className="text-xs text-muted-foreground">
                  or
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importing ? "Importing…" : "Browse file"}
                </Button>
                <div className="text-[11px] text-muted-foreground">
                  CSV or XLSX · required headers: Date, Description, Amount
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          {view === "upload" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setView("menu")}
            >
              ← Back
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
