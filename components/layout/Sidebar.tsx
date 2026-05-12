"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Box,
  Boxes,
  ClipboardList,
  Database,
  DollarSign,
  FolderOpen,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Tag,
  Truck,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload Reports", icon: Upload },
  { href: "/data-explorer", label: "Data Explorer", icon: Database },
  { href: "/shipment-reconciliation", label: "Shipment Recon", icon: Package },
  { href: "/removal-reconciliation", label: "Removal Recon", icon: Truck },
  { href: "/returns-reconciliation", label: "Returns Recon", icon: RotateCcw },
  {
    href: "/replacement-reconciliation",
    label: "Replacement Recon",
    icon: RefreshCw,
  },
  {
    href: "/fc-transfer-reconciliation",
    label: "FC Transfer Recon",
    icon: ArrowLeftRight,
  },
  { href: "/grade-resell", label: "Grade & Resell", icon: Tag },
  { href: "/gnr-reconciliation", label: "GNR Recon", icon: ClipboardList },
  {
    href: "/full-reconciliation",
    label: "Full Inventory Recon",
    icon: Boxes,
  },
  {
    href: "/cases-adjustments",
    label: "Cases & Adjustments",
    icon: FolderOpen,
  },
  {
    href: "/settlement-report",
    label: "Settlement Report",
    icon: Receipt,
  },
  {
    href: "/sales-reconciliation",
    label: "Sales Recon",
    icon: DollarSign,
  },
  {
    href: "/sales-orders",
    label: "Sales Orders",
    icon: ShoppingCart,
  },
] as const;

type SidebarProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();

  const handleNavigate = () => {
    onMobileOpenChange(false);
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
          "fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col border-r border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl transition-transform duration-200 ease-out lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/10 px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-inner">
            <Box className="size-[18px]" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-white">
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
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActiveRoute(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={handleNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "border-l-2 border-blue-500 bg-white/[0.08] text-white"
                    : "border-l-2 border-transparent text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0",
                    active ? "text-blue-400" : "text-zinc-500",
                  )}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-3 text-[11px] text-zinc-500">
          <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 leading-relaxed">
            <span className="font-medium text-zinc-400">Environment</span>
            <span className="mx-1.5 text-zinc-600">·</span>
            <span className="text-zinc-500">Local</span>
          </div>
        </div>
      </aside>
    </>
  );
}
