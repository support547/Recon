"use client";

import * as React from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "VENDOR" | "VIEWER";
} | null;

export function DashboardShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Sidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="flex min-h-screen flex-col lg:pl-[240px]">
        <Header onMenuClick={() => setMobileOpen(true)} user={user} />
        <div className="flex flex-1 flex-col bg-slate-50/90">{children}</div>
      </div>
    </div>
  );
}
