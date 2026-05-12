"use client";

import * as React from "react";
import { Lock, Trash2, Unlock } from "lucide-react";
import { toast } from "sonner";

import { deleteUploadBatch, setUploadLocked } from "@/actions/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UploadHistoryRow } from "@/lib/upload-report-types";

function formatDate(d: Date) {
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

type UploadHistoryProps = {
  rows: UploadHistoryRow[];
  onMutated: () => void;
};

export function UploadHistory({ rows, onMutated }: UploadHistoryProps) {
  const [confirmRow, setConfirmRow] = React.useState<UploadHistoryRow | null>(
    null,
  );
  const [busy, startTransition] = React.useTransition();

  const totalRowsForConfirm =
    (confirmRow?.rowCount ?? 0) + (confirmRow?.rowsSkipped ?? 0);

  const onToggleLock = (row: UploadHistoryRow) => {
    startTransition(async () => {
      const next = !row.isLocked;
      const res = await setUploadLocked(row.id, next);
      if (!res.ok) {
        toast.error("Could not update lock", { description: res.error });
        return;
      }
      toast.success(next ? "Upload locked" : "Upload unlocked");
      onMutated();
    });
  };

  const onConfirmDelete = () => {
    if (!confirmRow) return;
    startTransition(async () => {
      const res = await deleteUploadBatch(confirmRow.id);
      setConfirmRow(null);
      if (!res.ok) {
        toast.error("Delete failed", { description: res.error });
        return;
      }
      toast.success("Upload batch deleted");
      onMutated();
    });
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-bold text-foreground">Upload History</div>
          <span className="text-[11px] text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No upload history for this report type yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Report Type</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="text-right tabular-nums">
                    Rows Added
                  </TableHead>
                  <TableHead className="text-right tabular-nums">
                    Skipped
                  </TableHead>
                  <TableHead className="text-right">Uploaded At</TableHead>
                  <TableHead className="w-[80px] text-center">Lock</TableHead>
                  <TableHead className="w-[80px] text-center">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 font-normal text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        {r.reportType}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-[260px] truncate font-mono text-[11px]"
                      title={r.filename}
                    >
                      {r.filename}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold tabular-nums text-primary">
                      {r.rowCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.rowsSkipped.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground">
                      {formatDate(r.uploadedAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busy}
                        aria-label={
                          r.isLocked ? "Unlock upload" : "Lock upload"
                        }
                        onClick={() => onToggleLock(r)}
                      >
                        {r.isLocked ? (
                          <Lock className="size-4 text-amber-600" />
                        ) : (
                          <Unlock className="size-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={r.isLocked || busy}
                        aria-label="Delete upload batch"
                        onClick={() => setConfirmRow(r)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog
        open={confirmRow != null}
        onOpenChange={(open) => !open && setConfirmRow(null)}
      >
        <DialogContent showCloseButton className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete upload batch?</DialogTitle>
            <DialogDescription>
              {confirmRow ? (
                <>
                  This will permanently delete{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totalRowsForConfirm.toLocaleString()}
                  </span>{" "}
                  rows of{" "}
                  <span className="font-medium text-foreground">
                    {confirmRow.reportType}
                  </span>{" "}
                  data. Are you sure?
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRow(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={onConfirmDelete}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
