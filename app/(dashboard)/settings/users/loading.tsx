import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/loading-skeletons";

export default function UsersLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={10} cols={5} />
    </main>
  );
}
