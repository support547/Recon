import { PendingSentinel } from "@/components/nav/PendingSentinel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mb-6 space-y-2 border-b border-border pb-6", className)}>
      <PendingSentinel />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full max-w-xl" />
    </div>
  );
}

export function KpiCardsSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      <PendingSentinel />
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

export function FilterBarSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      <PendingSentinel />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="ml-auto h-8 w-20" />
    </div>
  );
}

export function TableSkeleton({
  rows = 10,
  cols = 6,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <PendingSentinel />
      <div
        className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"
        style={gridStyle}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-3/4" />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
            style={gridStyle}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
