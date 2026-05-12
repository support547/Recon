"use client";

import * as React from "react";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SaveResult = { ok: true } | { ok: false; error: string };

export type RemarksCellProps = {
  /** Current remark text — empty string = none. */
  value: string;
  /** Called when user clicks Save. Should persist and return ok flag. */
  onSave: (next: string) => Promise<SaveResult>;
  /** Optional cell title shown in popover header. */
  title?: string;
  /** Show the remark text inline (truncated) when present. */
  inlinePreview?: boolean;
  /** Disable editing (read-only). */
  disabled?: boolean;
};

/**
 * Click-to-edit remark cell.
 * - Hovering shows existing text + edit button.
 * - Clicking the button reveals a textarea + Save / Cancel.
 * - Persists via parent-supplied `onSave` server action.
 */
export function RemarksCell({
  value,
  onSave,
  title = "Remarks",
  inlinePreview = true,
  disabled = false,
}: RemarksCellProps) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  async function save() {
    setPending(true);
    try {
      const res = await onSave(draft.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Remark saved.");
      setEditing(false);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  const hasValue = value.trim().length > 0;
  const Icon = hasValue ? MessageSquare : MessageSquarePlus;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex max-w-[180px] items-center gap-1 truncate rounded border-0 bg-transparent p-0 text-left text-[11px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
            hasValue ? "text-foreground" : "text-muted-foreground",
          )}
          aria-label={hasValue ? "View remark" : "Add remark"}
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              hasValue ? "text-blue-600" : "text-muted-foreground",
            )}
            aria-hidden
          />
          {inlinePreview && hasValue ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="italic text-muted-foreground">
              {hasValue ? "" : "add…"}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="left"
        className="w-80 p-0"
        onInteractOutside={(e) => {
          if (editing) e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {title}
          </span>
          {!editing && !disabled ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setEditing(true)}
            >
              {hasValue ? "Edit" : "Add"}
            </Button>
          ) : null}
        </div>
        <div className="p-3">
          {editing ? (
            <>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                placeholder="Type a remark…"
                className="text-xs"
                disabled={pending}
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-xs text-foreground">
              {hasValue ? (
                value
              ) : (
                <span className="italic text-muted-foreground">
                  No remark yet.
                </span>
              )}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
