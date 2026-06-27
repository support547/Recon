import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/loading-skeletons";

export default function DataExplorerLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <div className="flex gap-2 overflow-hidden pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32 shrink-0" />
        ))}
      </div>
      <Skeleton className="mb-4 h-40 w-full rounded-xl" />
      <TableSkeleton rows={10} cols={9} />
    </main>
  );
}
