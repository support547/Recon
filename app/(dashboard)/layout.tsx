import * as React from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getEffectiveLevelsForCurrentUser } from "@/lib/auth/rbac";

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

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

  return (
    <DashboardShell user={user} permissions={permissions}>
      {children}
    </DashboardShell>
  );
}
