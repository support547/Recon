import {
  getAdjustments,
  getCases,
} from "@/actions/cases";
import { CasesAdjustmentsPageClient } from "@/components/cases/CasesAdjustmentsPageClient";

export default async function CasesAdjustmentsPage() {
  const [initialCases, initialAdjustments] = await Promise.all([
    getCases(),
    getAdjustments(),
  ]);

  return (
    <CasesAdjustmentsPageClient
      initialCases={initialCases}
      initialAdjustments={initialAdjustments}
    />
  );
}
