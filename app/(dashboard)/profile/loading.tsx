import { PageHeaderSkeleton } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-64 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </main>
  );
}
