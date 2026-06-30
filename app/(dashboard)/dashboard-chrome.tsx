import * as React from "react";
import { cache } from "react";
import type { Session } from "next-auth";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { getEffectiveLevelsForCurrentUser } from "@/lib/auth/rbac";
import { controlPrisma } from "@/lib/control-prisma";

export const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";
export const FALLBACK_COMPANY_NAME = "Edubooks ERP";

export type CompanyChrome = {
  name: string;
  branding: { logo?: string; displayName?: string };
};

function parseBranding(raw: unknown): { logo?: string; displayName?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: { logo?: string; displayName?: string } = {};
  if (typeof obj.displayName === "string") out.displayName = obj.displayName;
  if (typeof obj.logo === "string") out.logo = obj.logo;
  return out;
}

// React.cache dedupes within one request so generateMetadata and the chrome
// body share a single control-DB roundtrip.
export const getCompanyChrome = cache(
  async (companyId: string): Promise<CompanyChrome | null> => {
    const company = await controlPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, branding: true },
    });
    if (!company) return null;
    return { name: company.name, branding: parseBranding(company.branding) };
  },
);

export async function DashboardChrome({
  session,
  children,
}: Readonly<{
  session: Session | null;
  children: React.ReactNode;
}>) {
  // Heavy: tenant DB query + control DB query, run in parallel. Both stream
  // behind the Suspense boundary in layout.tsx, so the skeleton paints
  // immediately while these resolve.
  const [permissions, chrome] = await Promise.all([
    getEffectiveLevelsForCurrentUser(),
    session?.user?.companyId
      ? getCompanyChrome(session.user.companyId)
      : Promise.resolve(null),
  ]);

  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        role: session.user.role,
      }
    : {
        // Stub admin so the Settings nav is navigable while auth is disabled
        // during development. The real security boundary is in server actions,
        // not the UI.
        id: "system",
        name: "System",
        email: "system@local",
        role: "ADMIN" as const,
      };

  const companyName = chrome
    ? (chrome.branding.displayName ?? chrome.name)
    : null;
  const companyLogo = chrome?.branding.logo ?? null;

  return (
    <DashboardShell
      user={user}
      permissions={permissions}
      companyName={companyName}
      companyLogo={companyLogo}
    >
      {children}
    </DashboardShell>
  );
}
