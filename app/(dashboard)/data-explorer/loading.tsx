import { Skeleton } from "@/components/ui/skeleton";

export default function DataExplorerLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 space-y-2 border-b border-border pb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="flex gap-2 overflow-hidden pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 shrink-0" />
        ))}
      </div>
      <Skeleton className="mb-4 h-40 w-full rounded-xl" />
      <Skeleton className="h-[420px] w-full rounded-xl" />
    </main>
  );
}
