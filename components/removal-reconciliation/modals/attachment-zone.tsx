"use client";

import * as React from "react";
import { File as FileIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  deleteRemovalReceiptAttachment,
  uploadRemovalReceiptAttachment,
} from "@/actions/removal-reconciliation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttachmentEntry = {
  url: string;
  filename: string;
  size: number;
  uploadedAt: string;
};

function fmtSize(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function AttachmentZone({
  receiptId,
  initial,
  disabled = false,
}: {
  receiptId: string | null | undefined;
  initial?: AttachmentEntry[];
  disabled?: boolean;
}) {
  const [items, setItems] = React.useState<AttachmentEntry[]>(initial ?? []);
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setItems(initial ?? []);
  }, [initial]);

  if (!receiptId) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
        Save the receipt first to attach files.
      </p>
    );
  }

  async function onFileSelected(files: FileList | null) {
    if (!files || files.length === 0 || !receiptId) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("receiptId", receiptId);
        fd.set("file", file);
        const res = await uploadRemovalReceiptAttachment(fd);
        if (!res.ok) {
          toast.error(`${file.name}: ${res.error}`);
          continue;
        }
        if (res.data?.attachments) setItems(res.data.attachments);
        toast.success(`Uploaded ${file.name}`);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(url: string) {
    if (!receiptId) return;
    if (!confirm("Delete this attachment?")) return;
    setBusy(true);
    try {
      const res = await deleteRemovalReceiptAttachment(receiptId, url);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data?.attachments) setItems(res.data.attachments);
      toast.success("Deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-dashed p-3 transition-colors",
          disabled ? "opacity-60" : "border-border",
          dragOver ? "border-blue-500 bg-blue-50" : "",
        )}
        onDragOver={(e) => {
          if (busy || disabled) return;
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (dragOver) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (busy || disabled) return;
          if (e.dataTransfer.files?.length) {
            void onFileSelected(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.xlsx,.xls,.txt"
          className="hidden"
          disabled={busy || disabled}
          onChange={(e) => onFileSelected(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" aria-hidden />
          {busy ? "Uploading…" : "Add files"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {dragOver
            ? "Drop to upload…"
            : "Drop files or click · PDF / images / csv / xls / txt · max 25 MB each"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">
          No attachments yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li
              key={a.url}
              className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1 text-xs"
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-blue-600 hover:underline"
                title={a.filename}
              >
                {a.filename}
              </a>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {fmtSize(a.size)}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                disabled={busy || disabled}
                onClick={() => onDelete(a.url)}
                aria-label="Delete attachment"
              >
                <Trash2 className="size-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
