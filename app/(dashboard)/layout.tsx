import type { Metadata } from "next";
import * as React from "react";
import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getEffectiveLevelsForCurrentUser } from "@/lib/auth/rbac";
import { controlPrisma } from "@/lib/control-prisma";

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";
const FALLBACK_COMPANY_NAME = "Edubooks ERP";

type CompanyChrome = {
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

// React.cache dedupes within one request so generateMetadata and the layout
// body share a single control-DB roundtrip.
const getCompanyChrome = cache(
  async (companyId: string): Promise<CompanyChrome | null> => {
    const company = await controlPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, branding: true },
    });
    if (!company) return null;
    return { name: company.name, branding: parseBranding(company.branding) };
  },
);

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const companyId = session?.user?.companyId;
  const chrome = companyId ? await getCompanyChrome(companyId) : null;
  const displayName =
    chrome?.branding.displayName ?? chrome?.name ?? FALLBACK_COMPANY_NAME;
  return { title: `${displayName} — FBA Reconciliation` };
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, permissions] = await Promise.all([
    auth(),
    getEffectiveLevelsForCurrentUser(),
  ]);

  // Defense in depth — proxy.ts already redirects unauth requests to /login,
  // but if it ever fails to match a route the layout must not render the
  // dashboard for a null session.
  if (AUTH_ENABLED && !session?.user) {
    redirect("/login");
  }

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

  const chrome = session?.user?.companyId
    ? await getCompanyChrome(session.user.companyId)
    : null;
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
