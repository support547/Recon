"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GradeResellStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  deleteGradeResellItem,
  getGradeResellItems,
  type GradeResellFilters,
  type GradeResellItemRow,
} from "@/actions/grade-resell";
import { GradeResellFormModal } from "@/components/grade-resell/grade-resell-form-modal";
import { GradeResellTable } from "@/components/grade-resell/grade-resell-table";
import { SummaryCard } from "@/components/shared/SummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type GradeResellClientProps = {
  initialItems: GradeResellItemRow[];
};

export function GradeResellClient({ initialItems }: GradeResellClientProps) {
  const router = useRouter();

  const [filters, setFilters] = React.useState<GradeResellFilters>({});
  const debouncedFilters = useDebouncedValue(filters, 320);

  const [items, setItems] = React.useState(initialItems);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGradeResellItems(debouncedFilters).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedFilters]);

  const refresh = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<
    "create" | "edit" | "mark-sold"
  >("create");
  const [selected, setSelected] = React.useState<GradeResellItemRow | null>(
    null,
  );

  function openCreate() {
    setSelected(null);
    setModalMode("create");
    setModalOpen(true);
  }

  function openEdit(row: GradeResellItemRow) {
    setSelected(row);
    setModalMode("edit");
    setModalOpen(true);
  }

  function openMarkSold(row: GradeResellItemRow) {
    setSelected(row);
    setModalMode("mark-sold");
    setModalOpen(true);
  }

  async function handleDelete(row: GradeResellItemRow) {
    if (
      !window.confirm(
        `Soft-delete this grade & resell item for MSKU «${row.msku}»?`,
      )
    ) {
      return;
    }
    const res = await deleteGradeResellItem(row.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Item removed.");
    refresh();
    setItems((prev) => prev.filter((r) => r.id !== row.id));
  }

  function onSaved() {
    refresh();
    getGradeResellItems(debouncedFilters).then(setItems);
  }

  const totalItems = items.length;
  const totalQty = items.reduce((acc, r) => acc + (r.quantity ?? 0), 0);
  const qtyByStatus = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of items) {
      map[r.status] = (map[r.status] ?? 0) + (r.quantity ?? 0);
    }
    return map;
  }, [items]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="border-b border-border pb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Grade &amp; Resell
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manual intake, grading, and resale tracking for returned or warehouse
          inventory. Entries here feed GNR Recon and Full Reconciliation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Items"
          value={totalItems.toLocaleString()}
          accent="blue"
        />
        <SummaryCard
          label="Total Qty"
          value={totalQty.toLocaleString()}
          accent="teal"
        />
        <SummaryCard
          label="Listed"
          value={(qtyByStatus["LISTED"] ?? 0).toLocaleString()}
          accent="orange"
        />
        <SummaryCard
          label="Sold"
          value={(qtyByStatus["SOLD"] ?? 0).toLocaleString()}
          accent="green"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Status
          </span>
          <Select
            value={filters.status || ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v === ALL ? "" : (v as GradeResellStatus),
              }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {Object.values(GradeResellStatus).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-w-[160px] flex-1 gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Store
          </span>
          <Input
            placeholder="Contains…"
            value={filters.store ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, store: e.target.value }))
            }
          />
        </div>

        <div className="grid min-w-[200px] flex-[2] gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Search MSKU / FNSKU / ASIN / Title
          </span>
          <Input
            placeholder="Server-side search…"
            value={filters.search ?? ""}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
          />
        </div>

        <Button type="button" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-4" />
          Add item
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : null}

      <GradeResellTable
        data={items}
        onEdit={openEdit}
        onMarkSold={openMarkSold}
        onDelete={handleDelete}
      />

      <GradeResellFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        item={selected}
        onSaved={onSaved}
      />
    </main>
  );
}
