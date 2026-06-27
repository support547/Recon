import { cache } from "react";
import { redirect } from "next/navigation";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { controlPrisma } from "@/lib/control-prisma";

export { controlPrisma };

const globalForTenants = globalThis as unknown as {
  tenantPrismaCache: Map<string, PrismaClient> | undefined;
};

const tenantCache: Map<string, PrismaClient> =
  globalForTenants.tenantPrismaCache ?? new Map<string, PrismaClient>();

if (process.env.NODE_ENV !== "production") {
  globalForTenants.tenantPrismaCache = tenantCache;
}

/** Build (or fetch from cache) a PrismaClient bound to the given tenant URL.
 *  Used directly by scripts (onboarding, migration runner) where there is no
 *  request-bound session. */
export function getTenantPrismaByUrl(databaseUrl: string): PrismaClient {
  const existing = tenantCache.get(databaseUrl);
  if (existing) return existing;

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  tenantCache.set(databaseUrl, client);
  return client;
}

/** Used by tests / scripts to wipe the cache (e.g. between integration runs). */
export async function disposeTenantClients(): Promise<void> {
  const clients = Array.from(tenantCache.values());
  tenantCache.clear();
  await Promise.all(clients.map((c) => c.$disconnect().catch(() => {})));
}

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

/** Resolve the active tenant's PrismaClient for the current authenticated
 *  request. Memoised per React request via `cache()`, so the control-DB
 *  lookup only runs once per request even when many server-action calls
 *  reach for `prisma`. When AUTH_ENABLED=false (dev), falls back to
 *  DEV_TENANT_DATABASE_URL so server actions keep working without a real
 *  session. */
export const getTenantPrisma = cache(async (): Promise<PrismaClient> => {
  if (!AUTH_ENABLED) {
    const devUrl = process.env.DEV_TENANT_DATABASE_URL;
    if (!devUrl) {
      throw new Error(
        "AUTH_ENABLED=false but DEV_TENANT_DATABASE_URL is not set.",
      );
    }
    return getTenantPrismaByUrl(devUrl);
  }

  // Lazy import to avoid a parse-time circular: auth.ts pulls in audit, which
  // pulls in this module.
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // No active session (cookie missing or just invalidated by the jwt
    // callback): bounce to /login instead of surfacing a 500 to the user.
    redirect("/login");
  }

  const user = await controlPrisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, company: { select: { databaseUrl: true } } },
  });
  if (!user || !user.isActive) {
    // Defense in depth: the jwt callback already returns null on this case,
    // but a stale in-memory token could slip past in dev with HMR. Redirect
    // so the next request goes through fresh auth.
    redirect("/login");
  }
  return getTenantPrismaByUrl(user.company.databaseUrl);
});

/**
 * Drop-in replacement for the old singleton `prisma`. Every property access
 * resolves the tenant client at call time via getTenantPrisma() and forwards.
 *
 *   prisma.user.findMany(...)         →  (await getTenantPrisma()).user.findMany(...)
 *   prisma.$transaction(async tx => …)→  (await getTenantPrisma()).$transaction(async tx => …)
 *
 * The array form of $transaction is NOT supported (only the callback form),
 * since per-call promises would each resolve to a different client.
 */
function buildTenantPrismaProxy(): PrismaClient {
  const modelProxy = (modelName: string) =>
    new Proxy(
      {},
      {
        get(_t, method: string | symbol) {
          return async (...args: unknown[]) => {
            const client = await getTenantPrisma();
            const m = (client as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)[modelName];
            return m[method as string](...args);
          };
        },
      },
    );

  return new Proxy({} as PrismaClient, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      if (prop.startsWith("$")) {
        return async (...args: unknown[]) => {
          const client = await getTenantPrisma();
          const fn = (client as unknown as Record<string, (...a: unknown[]) => unknown>)[prop];
          return fn.call(client, ...args);
        };
      }
      return modelProxy(prop);
    },
  });
}

export const prisma: PrismaClient = buildTenantPrismaProxy();
