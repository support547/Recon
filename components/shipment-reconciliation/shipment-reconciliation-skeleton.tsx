import { Skeleton } from "@/components/ui/skeleton";

export function ShipmentReconciliationSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[min(520px,70vh)] w-full rounded-xl" />
    </div>
  );
}
