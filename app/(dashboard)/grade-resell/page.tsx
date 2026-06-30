import * as React from "react";

import { getGradeResellItems } from "@/actions/grade-resell";
import { GradeResellClient } from "@/components/grade-resell/grade-resell-client";
import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/loading-skeletons";

function GradeResellFallback() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={10} cols={8} />
    </main>
  );
}

export default async function GradeResellPage() {
  const initialItems = await getGradeResellItems({});

  return (
    <React.Suspense fallback={<GradeResellFallback />}>
      <GradeResellClient initialItems={initialItems} />
    </React.Suspense>
  );
}
