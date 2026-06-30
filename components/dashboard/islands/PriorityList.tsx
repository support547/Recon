import Link from "@/components/nav/ProgressLink";
import { ArrowRight, Flame } from "lucide-react";

import { MODULE_CONFIGS } from "@/components/dashboard/module-config";
import { MODULE_ICONS } from "@/components/dashboard/module-icons";
import {
  computeAllModuleStats,
  type ModulePromiseBag,
} from "@/components/dashboard/compute-module-stats";

function fmt(n: number) {
  return n.toLocaleString();
}

export async function PriorityList(b: ModulePromiseBag) {
  const m = await computeAllModuleStats(b);
  const list = MODULE_CONFIGS.map((cfg) => ({ cfg, stats: m[cfg.key] }))
    .filter((x) => x.stats.takeAction > 0)
    .sort((a, b) => b.stats.takeAction - a.stats.takeAction)
    .slice(0, 5);
  if (list.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-red-200 bg-red-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Flame className="size-4 text-red-500" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          Priority Actions
        </h3>
        <span className="text-[11px] text-muted-foreground">
          top {list.length}
        </span>
      </div>
      <ul className="divide-y divide-red-200/60">
        {list.map(({ cfg, stats }) => {
          const Icon = MODULE_ICONS[cfg.key];
          return (
            <li key={cfg.key}>
              <Link
                href={`${cfg.href}?filter=take-action`}
                className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-red-100/40"
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-red-500" aria-hidden />
                  <span className="font-medium text-foreground">{cfg.name}</span>
                  <span className="text-muted-foreground">
                    — {fmt(stats.takeAction)} {stats.primaryLabel}
                  </span>
                </span>
                <ArrowRight className="size-4 text-red-500" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
