"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Box,
  Boxes,
  ChevronDown,
  ClipboardList,
  Database,
  DollarSign,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Package,
  SlidersHorizontal,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Tag,
  Truck,
  Upload,
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

const NAV_ITEMS: NavItem[] = [
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
  { type: "link", href: "/cases-adjustments", label: "Cases & Adjustments", icon: FolderOpen },
  { type: "link", href: "/settlement-report", label: "Settlement Report", icon: Receipt },
  { type: "link", href: "/sales-reconciliation", label: "Sales Recon", icon: DollarSign },
  { type: "link", href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
];

type SidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActiveChild(pathname: string, group: NavGroup) {
  return group.children.some((c) => isActiveRoute(pathname, c.href));
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of NAV_ITEMS) {
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
      for (const item of NAV_ITEMS) {
        if (item.type === "group" && groupHasActiveChild(pathname, item) && !next[item.id]) {
          next[item.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

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
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-slate-800/60 bg-slate-900 text-slate-100 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-800/60 px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner">
            <Box className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-white">
              InvenSync
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
              FBA Inventory ERP
            </div>
          </div>
        </div>

        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
          aria-label="Primary"
        >
          {NAV_ITEMS.map((item) => {
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
                      ? "border-l-2 border-blue-400 bg-blue-500/15 text-white"
                      : "border-l-2 border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-blue-400" : "text-slate-500",
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
                      ? "border-l-2 border-blue-400 bg-blue-500/10 text-white"
                      : "border-l-2 border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-slate-100",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      hasActiveChild ? "text-blue-400" : "text-slate-500",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-left">{label}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-slate-500 transition-transform duration-200",
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
                              ? "border-l-2 border-blue-400 bg-blue-500/15 text-white"
                              : "border-l-2 border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
                          )}
                        >
                          <ChildIcon
                            className={cn(
                              "size-[16px] shrink-0",
                              active ? "text-blue-400" : "text-slate-500",
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

        <div className="shrink-0 border-t border-slate-800/60 px-3 py-3 text-[11px] text-slate-500">
          <div className="rounded-lg bg-slate-800/40 px-2.5 py-2 leading-relaxed">
            <span className="font-medium text-slate-300">Environment</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-slate-400">Local</span>
          </div>
        </div>
      </aside>
    </>
  );
}
