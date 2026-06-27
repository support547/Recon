import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/loading-skeletons";

export default function UploadLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <Skeleton className="mb-6 h-48 rounded-xl" />
      <TableSkeleton rows={8} cols={6} />
    </main>
  );
}
