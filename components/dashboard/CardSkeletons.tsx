import { PendingSentinel } from "@/components/nav/PendingSentinel";
import { Skeleton } from "@/components/ui/skeleton";

export function ModuleCardSkeleton() {
  return (
    <>
      <PendingSentinel />
      <Skeleton className="h-48 w-full rounded-[10px]" />
    </>
  );
}

export function KpiTileSkeleton() {
  return (
    <>
      <PendingSentinel />
      <Skeleton className="h-12 w-full" />
    </>
  );
}

export function KpiBandSkeleton() {
  return (
    <>
      <PendingSentinel />
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </>
  );
}

export function AlertBarSkeleton() {
  return (
    <>
      <PendingSentinel />
      <Skeleton className="h-6 w-72" />
    </>
  );
}

export function LastRefreshedSkeleton() {
  return (
    <>
      <PendingSentinel />
      <span>Last refreshed: …</span>
    </>
  );
}

export function CasesCardSkeleton() {
  return (
    <>
      <PendingSentinel />
      <Skeleton className="h-40 w-full" />
    </>
  );
}

export function AdjustmentsCardSkeleton() {
  return (
    <>
      <PendingSentinel />
      <Skeleton className="h-40 w-full" />
    </>
  );
}
