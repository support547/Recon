import "server-only";
import { cache } from "react";

import { auth } from "@/auth";
import { controlPrisma } from "@/lib/control-prisma";
import {
  ALLOWED_MARKETPLACES,
  type Marketplace,
} from "@/lib/branding/marketplaces";

const MARKETPLACE_SET = new Set<string>(ALLOWED_MARKETPLACES);

/**
 * Resolve the current company's single active marketplace from Control DB
 * Company.branding. Returns null if no session, no company, branding empty,
 * marketplaces array missing/empty, or value not in allow-list.
 * Memoised per request so multiple loaders share one control-DB roundtrip.
 */
export const getCurrentMarketplace = cache(
  async (): Promise<Marketplace | null> => {
    const session = await auth();
    const companyId = session?.user?.companyId;
    if (!companyId) return null;
    const company = await controlPrisma.company.findUnique({
      where: { id: companyId },
      select: { branding: true },
    });
    const branding = company?.branding;
    if (!branding || typeof branding !== "object" || Array.isArray(branding)) {
      return null;
    }
    const marketplaces = (branding as Record<string, unknown>).marketplaces;
    if (!Array.isArray(marketplaces)) return null;
    const first = marketplaces.find((m): m is string => typeof m === "string");
    if (!first || !MARKETPLACE_SET.has(first)) return null;
    return first as Marketplace;
  },
);
