"use client";

import * as React from "react";

import { IdleLogout } from "@/components/auth/idle-logout";
import {
  PermissionsProvider,
  type EffectiveLevels,
} from "@/components/auth/permissions-context";
import { Header } from "@/components/layout/Header";
import { HeaderActionsProvider } from "@/components/layout/header-actions";
import { Sidebar } from "@/components/layout/Sidebar";

type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "VENDOR" | "VIEWER";
} | null;

export function DashboardShell({
  user,
  permissions,
  companyName,
  companyLogo,
  children,
}: {
  user: SessionUser;
  permissions: EffectiveLevels | null;
  companyName?: string | null;
  companyLogo?: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const idleEnabled = !!user && user.id !== "system";

  return (
    <PermissionsProvider value={permissions}>
      <HeaderActionsProvider>
        <IdleLogout enabled={idleEnabled} />
        <div className="min-h-screen bg-white">
          <Sidebar
            mobileOpen={mobileOpen}
            onMobileOpenChange={setMobileOpen}
            role={user?.role ?? null}
            companyName={companyName ?? null}
            companyLogo={companyLogo ?? null}
          />
          <div className="flex min-h-screen flex-col lg:pl-[240px]">
            <Header onMenuClick={() => setMobileOpen(true)} user={user} />
            <div className="flex flex-1 flex-col bg-slate-50/90 pt-14">{children}</div>
          </div>
        </div>
      </HeaderActionsProvider>
    </PermissionsProvider>
  );
}
