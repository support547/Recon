"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Box,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Container,
  Database,
  FolderOpen,
  History,
  LayoutDashboard,
  Layers,
  Package,
  SlidersHorizontal,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  Tag,
  Truck,
  Upload,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavLeaf = {
  type: "link";
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  type: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};

type NavItem = NavLeaf | NavGroup;

const RECON_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/shipment-reconciliation", label: "Shipment Recon", icon: Package },
  { type: "link", href: "/removal-reconciliation", label: "Removal Recon", icon: Truck },
  { type: "link", href: "/returns-reconciliation", label: "Returns Recon", icon: RotateCcw },
  { type: "link", href: "/replacement-reconciliation", label: "Replacement Recon", icon: RefreshCw },
  { type: "link", href: "/fc-transfer-reconciliation", label: "FC Transfer Recon", icon: ArrowLeftRight },
  { type: "link", href: "/grade-resell", label: "Grade & Resell", icon: Tag },
  { type: "link", href: "/gnr-reconciliation", label: "GNR Recon", icon: ClipboardList },
  { type: "link", href: "/adjustment-reconciliation", label: "Adjustment Recon", icon: SlidersHorizontal },
  { type: "link", href: "/full-reconciliation", label: "Full Inventory Recon", icon: Boxes },
];

const PAYMENT_RECON_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/payment-reconciliation/sales-recon", label: "Sales Recon", icon: ClipboardCheck },
  { type: "link", href: "/payment-reconciliation/inbound-recon", label: "Inbound Recon", icon: Container },
  { type: "link", href: "/settlement-report", label: "Settlement Recon", icon: Receipt },
  { type: "link", href: "/payment-reconciliation/fees-reimbursements", label: "Fees & Reimbursements", icon: Coins },
];

const SETTINGS_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/settings/users", label: "Users", icon: Users },
  { type: "link", href: "/settings/audit", label: "Audit Log", icon: History },
];

const BASE_NAV_ITEMS: NavItem[] = [
  { type: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { type: "link", href: "/upload", label: "Upload Reports", icon: Upload },
  { type: "link", href: "/data-explorer", label: "Data Explorer", icon: Database },
  {
    type: "group",
    id: "inventory-reconciliation",
    label: "Inventory Reconciliation",
    icon: Layers,
    children: RECON_CHILDREN,
  },
  {
    type: "group",
    id: "payment-reconciliation",
    label: "Payment Reconciliation",
    icon: Wallet,
    children: PAYMENT_RECON_CHILDREN,
  },
  { type: "link", href: "/cases-adjustments", label: "Cases & Adjustments", icon: FolderOpen },
];

const PROFILE_ITEM: NavLeaf = {
  type: "link",
  href: "/profile",
  label: "My Profile",
  icon: UserCircle,
};

const SETTINGS_GROUP: NavGroup = {
  type: "group",
  id: "settings",
  label: "Settings",
  icon: Settings,
  children: SETTINGS_CHILDREN,
};

type SidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  role: "ADMIN" | "VENDOR" | "VIEWER" | null;
};

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActiveChild(pathname: string, group: NavGroup) {
  return group.children.some((c) => isActiveRoute(pathname, c.href));
}

export function Sidebar({ mobileOpen, onMobileOpenChange, role }: SidebarProps) {
  const pathname = usePathname();

  const navItems = React.useMemo<NavItem[]>(() => {
    const items: NavItem[] = [...BASE_NAV_ITEMS, PROFILE_ITEM];
    if (role === "ADMIN") items.push(SETTINGS_GROUP);
    return items;
  }, [role]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of navItems) {
      if (item.type === "group") {
        init[item.id] = groupHasActiveChild(pathname, item);
      }
    }
    return init;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of navItems) {
        if (item.type === "group" && groupHasActiveChild(pathname, item) && !next[item.id]) {
          next[item.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, navItems]);

  const handleNavigate = () => {
    onMobileOpenChange(false);
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-zinc-200 bg-zinc-100 text-zinc-700 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-zinc-200 px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner">
            <Box className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-zinc-900">
              InvenSync
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              FBA Inventory ERP
            </div>
          </div>
        </div>

        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
          aria-label="Primary"
        >
          {navItems.map((item) => {
            if (item.type === "link") {
              const { href, label, icon: Icon } = item;
              const active = isActiveRoute(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={handleNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "border-l-2 border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-l-2 border-transparent text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-indigo-600" : "text-zinc-400",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                </Link>
              );
            }

            const { id, label, icon: Icon, children } = item;
            const isOpen = openGroups[id] ?? false;
            const hasActiveChild = groupHasActiveChild(pathname, item);

            return (
              <div key={id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleGroup(id)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${id}`}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    hasActiveChild
                      ? "border-l-2 border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-l-2 border-transparent text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      hasActiveChild ? "text-indigo-600" : "text-zinc-400",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-left">{label}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-zinc-400 transition-transform duration-200",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden
                  />
                </button>

                {isOpen ? (
                  <div
                    id={`nav-group-${id}`}
                    className="mt-0.5 flex flex-col gap-0.5 pl-3"
                  >
                    {children.map(({ href, label: childLabel, icon: ChildIcon }) => {
                      const active = isActiveRoute(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={handleNavigate}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                            active
                              ? "border-l-2 border-indigo-600 bg-indigo-50 text-indigo-700"
                              : "border-l-2 border-transparent text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900",
                          )}
                        >
                          <ChildIcon
                            className={cn(
                              "size-[16px] shrink-0",
                              active ? "text-indigo-600" : "text-zinc-400",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{childLabel}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-zinc-200 px-3 py-3 text-[11px] text-zinc-500">
          <div className="rounded-lg bg-zinc-200/60 px-2.5 py-2 leading-relaxed">
            <span className="font-medium text-zinc-700">Environment</span>
            <span className="mx-1.5 text-zinc-400">·</span>
            <span className="text-zinc-500">Local</span>
          </div>
        </div>
      </aside>
    </>
  );
}
