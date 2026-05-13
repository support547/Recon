"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ColumnDef = { id: string; label: string };

type Props = {
  columns: readonly ColumnDef[];
  visibility: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
};

export function ColumnsMenu({ columns, visibility, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs"
          title="Show/hide columns"
        >
          <Settings2 className="size-3.5" aria-hidden />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={visibility[c.id] !== false}
            onCheckedChange={(v) =>
              onChange({ ...visibility, [c.id]: Boolean(v) })
            }
            onSelect={(e) => e.preventDefault()}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useColumnVisibility(
  storageKey: string,
  columns: readonly ColumnDef[],
): [Record<string, boolean>, (next: Record<string, boolean>) => void] {
  const [vis, setVis] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of columns) init[c.id] = true;
    return init;
  });
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setVis((prev) => {
        const next = { ...prev };
        for (const c of columns) {
          if (typeof parsed[c.id] === "boolean") next[c.id] = parsed[c.id];
        }
        return next;
      });
    } catch {}
  }, [storageKey, columns]);
  const update = React.useCallback(
    (next: Record<string, boolean>) => {
      setVis(next);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
      }
    },
    [storageKey],
  );
  return [vis, update];
}
