import * as React from "react";

import { getGradeResellItems } from "@/actions/grade-resell";
import { GradeResellClient } from "@/components/grade-resell/grade-resell-client";

export default async function GradeResellPage() {
  const initialItems = await getGradeResellItems({});

  return (
    <React.Suspense fallback={null}>
      <GradeResellClient initialItems={initialItems} />
    </React.Suspense>
  );
}
