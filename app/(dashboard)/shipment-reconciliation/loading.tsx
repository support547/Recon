import {
  FilterBarSkeleton,
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/loading-skeletons";

export default function ShipmentReconciliationLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={5} className="mb-6" />
      <FilterBarSkeleton className="mb-4" />
      <TableSkeleton rows={10} cols={9} />
    </main>
  );
}
