"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Menu, UserRound } from "lucide-react";
import { toast } from "sonner";

import { signOutAction } from "@/actions/auth";
import { useHeaderActionsSlot } from "@/components/layout/header-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/upload": "Upload Reports",
  "/data-explorer": "Data Explorer",
  "/shipment-reconciliation": "Shipment Reconciliation",
  "/removal-reconciliation": "Removal Reconciliation",
  "/returns-reconciliation": "Returns Reconciliation",
  "/replacement-reconciliation": "Replacement Reconciliation",
  "/fc-transfer-reconciliation": "FC Transfer Reconciliation",
  "/grade-resell": "Grade & Resell",
  "/gnr-reconciliation": "GNR Reconciliation",
  "/full-reconciliation": "Full Inventory Reconciliation",
  "/cases-adjustments": "Cases & Adjustments",
  "/settlement-report": "Settlement Report",
  "/sales-reconciliation": "Sales Reconciliation",
  "/sales-orders": "Sales Orders",
};

function titleFromPath(pathname: string) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return "Dashboard";
  return segments
    .join(" · ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: "ADMIN" | "VENDOR" | "VIEWER";
} | null;

type HeaderProps = {
  onMenuClick: () => void;
  user: SessionUser;
};

function roleColor(role: "ADMIN" | "VENDOR" | "VIEWER"): string {
  switch (role) {
    case "ADMIN":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "VENDOR":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "VIEWER":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export function Header({ onMenuClick, user }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const title = React.useMemo(() => titleFromPath(pathname), [pathname]);
  const actions = useHeaderActionsSlot();
  const [signingOut, startTransition] = React.useTransition();

  async function handleSignOut() {
    try {
      await signOutAction();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign out failed.";
      // signOutAction calls redirect() which throws NEXT_REDIRECT — ignore that.
      if (!msg.includes("NEXT_REDIRECT")) {
        toast.error(msg);
        return;
      }
    }
    startTransition(() => router.refresh());
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 lg:left-[240px] lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="shrink-0 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="size-[18px]" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground lg:text-lg">
            {title}
          </h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            Amazon FBA operations & reconciliation
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                aria-label="Account menu"
              >
                <UserRound className="size-4 text-muted-foreground" aria-hidden />
                <span className="hidden max-w-[180px] truncate text-xs sm:inline">
                  {user.email ?? user.name ?? "Account"}
                </span>
                <Badge
                  variant="outline"
                  className={`hidden font-normal sm:inline-flex ${roleColor(user.role)}`}
                >
                  {user.role}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="space-y-0.5">
                <p className="truncate text-xs font-semibold">
                  {user.name ?? user.email}
                </p>
                {user.name && user.email ? (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {user.email}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Role: {user.role}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signingOut}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleSignOut();
                }}
                className="text-red-600 focus:bg-red-50 focus:text-red-700"
              >
                <LogOut className="mr-2 size-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/login")}
          >
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
