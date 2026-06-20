import "server-only";
import { redirect } from "next/navigation";
import {
  PermissionLevel,
  PermissionModule,
  UserRole,
  type UserPermissionOverride,
} from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export { PermissionLevel, PermissionModule };

const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

/**
 * Modules where admin can grant per-user overrides. The admin-only modules
 * (USERS / AUDIT / SETTINGS) stay ADMIN-by-role and are not override-eligible.
 */
export const OVERRIDABLE_MODULES: ReadonlySet<PermissionModule> = new Set([
  PermissionModule.REPORTS,
  PermissionModule.RECONCILIATION,
  PermissionModule.SETTLEMENTS,
  PermissionModule.PAYMENTS,
  PermissionModule.DATA_EXPLORER,
]);

export function isOverridable(module: PermissionModule): boolean {
  return OVERRIDABLE_MODULES.has(module);
}

/**
 * Default level per (role, module). Spec:
 *  NONE < VIEW < EDIT < FULL
 *  EDIT = read + create + modify (includes upload, working recon, adjustments).
 *  FULL = EDIT + delete. Every delete in the app requires FULL on its module.
 */
export const ROLE_DEFAULTS: Readonly<
  Record<UserRole, Readonly<Record<PermissionModule, PermissionLevel>>>
> = {
  [UserRole.ADMIN]: {
    [PermissionModule.REPORTS]: PermissionLevel.FULL,
    [PermissionModule.RECONCILIATION]: PermissionLevel.FULL,
    [PermissionModule.SETTLEMENTS]: PermissionLevel.FULL,
    [PermissionModule.PAYMENTS]: PermissionLevel.FULL,
    [PermissionModule.DATA_EXPLORER]: PermissionLevel.FULL,
    [PermissionModule.USERS]: PermissionLevel.FULL,
    [PermissionModule.AUDIT]: PermissionLevel.FULL,
    [PermissionModule.SETTINGS]: PermissionLevel.FULL,
  },
  [UserRole.VENDOR]: {
    [PermissionModule.REPORTS]: PermissionLevel.EDIT,
    [PermissionModule.RECONCILIATION]: PermissionLevel.EDIT,
    [PermissionModule.SETTLEMENTS]: PermissionLevel.VIEW,
    [PermissionModule.PAYMENTS]: PermissionLevel.VIEW,
    [PermissionModule.DATA_EXPLORER]: PermissionLevel.VIEW,
    [PermissionModule.USERS]: PermissionLevel.NONE,
    [PermissionModule.AUDIT]: PermissionLevel.NONE,
    [PermissionModule.SETTINGS]: PermissionLevel.NONE,
  },
  [UserRole.VIEWER]: {
    [PermissionModule.REPORTS]: PermissionLevel.VIEW,
    [PermissionModule.RECONCILIATION]: PermissionLevel.VIEW,
    [PermissionModule.SETTLEMENTS]: PermissionLevel.VIEW,
    [PermissionModule.PAYMENTS]: PermissionLevel.VIEW,
    [PermissionModule.DATA_EXPLORER]: PermissionLevel.VIEW,
    [PermissionModule.USERS]: PermissionLevel.NONE,
    [PermissionModule.AUDIT]: PermissionLevel.NONE,
    [PermissionModule.SETTINGS]: PermissionLevel.NONE,
  },
};

const LEVEL_ORDER: Record<PermissionLevel, number> = {
  [PermissionLevel.NONE]: 0,
  [PermissionLevel.VIEW]: 1,
  [PermissionLevel.EDIT]: 2,
  [PermissionLevel.FULL]: 3,
};

export function levelRank(level: PermissionLevel): number {
  return LEVEL_ORDER[level];
}

export function meets(
  effective: PermissionLevel,
  required: PermissionLevel,
): boolean {
  return LEVEL_ORDER[effective] >= LEVEL_ORDER[required];
}

export type EffectiveLevels = Record<PermissionModule, PermissionLevel>;

export type EffectiveModuleLevel = {
  module: PermissionModule;
  level: PermissionLevel;
  source: "override" | "inherited";
};

/**
 * Resolve effective level per module. Overrides only apply to overridable
 * modules; ADMIN-only modules always use the role default regardless of any
 * stray override row.
 */
export function resolveEffectiveLevels(
  role: UserRole,
  overrides: Pick<UserPermissionOverride, "module" | "level">[],
): EffectiveLevels {
  const defaults = ROLE_DEFAULTS[role];
  const out = { ...defaults } as Record<PermissionModule, PermissionLevel>;
  for (const o of overrides) {
    if (!isOverridable(o.module)) continue;
    out[o.module] = o.level;
  }
  return out;
}

export function resolveEffectiveLevelsDetailed(
  role: UserRole,
  overrides: Pick<UserPermissionOverride, "module" | "level">[],
): EffectiveModuleLevel[] {
  const defaults = ROLE_DEFAULTS[role];
  const overrideMap = new Map<PermissionModule, PermissionLevel>();
  for (const o of overrides) {
    if (!isOverridable(o.module)) continue;
    overrideMap.set(o.module, o.level);
  }
  const modules = Object.values(PermissionModule);
  return modules.map((m) => {
    const ov = overrideMap.get(m);
    return ov !== undefined
      ? { module: m, level: ov, source: "override" as const }
      : { module: m, level: defaults[m], source: "inherited" as const };
  });
}

/* ============================================================
 * Errors
 * ============================================================ */

export type AuthzErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "SUSPENDED";

export class AuthzError extends Error {
  readonly code: AuthzErrorCode;
  readonly module?: PermissionModule;
  readonly required?: PermissionLevel;
  readonly effective?: PermissionLevel;

  constructor(
    code: AuthzErrorCode,
    message: string,
    details?: {
      module?: PermissionModule;
      required?: PermissionLevel;
      effective?: PermissionLevel;
    },
  ) {
    super(message);
    this.name = "AuthzError";
    this.code = code;
    this.module = details?.module;
    this.required = details?.required;
    this.effective = details?.effective;
  }
}

export function isAuthzError(e: unknown): e is AuthzError {
  return e instanceof AuthzError;
}

/* ============================================================
 * Session loading
 * ============================================================ */

export type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/**
 * Loads the session, redirecting to /login when unauthenticated.
 *
 * While the ERP is being built (AUTH_ENABLED !== "true") this returns a stub
 * ADMIN system user so server actions and pages keep working without a real
 * session. Flip AUTH_ENABLED=true in .env to enforce.
 */
export async function requireSession(): Promise<AuthSession> {
  if (!AUTH_ENABLED) {
    return {
      id: "system",
      email: "system@local",
      name: "System",
      role: UserRole.ADMIN,
    };
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role as UserRole,
  };
}

/**
 * Same as requireSession but returns null instead of redirecting. Useful for
 * server actions that want to return a typed error shape instead of throwing
 * to the client.
 */
export async function getOptionalSession(): Promise<AuthSession | null> {
  if (!AUTH_ENABLED) {
    return {
      id: "system",
      email: "system@local",
      name: "System",
      role: UserRole.ADMIN,
    };
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role as UserRole,
  };
}

/* ============================================================
 * Guards
 * ============================================================ */

/**
 * Loads the session and resolves effective permissions FRESH from the database
 * on every call. Critical: only `role` lives in the JWT, so rights changes and
 * suspensions take effect on the user's next request, not next login.
 *
 * Throws AuthzError on failure; server actions should catch via
 * authzErrorToMutationResult().
 */
export async function requireLevel(
  module: PermissionModule,
  level: PermissionLevel,
): Promise<AuthSession & { effective: PermissionLevel }> {
  const session = await getOptionalSession();
  if (!session) {
    throw new AuthzError("UNAUTHENTICATED", "Sign-in required.");
  }

  // AUTH_ENABLED=false → stub ADMIN passes every check.
  if (!AUTH_ENABLED) {
    return { ...session, effective: PermissionLevel.FULL };
  }

  // Fresh DB read: confirms not-suspended + pulls current overrides.
  const dbUser = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: {
      id: true,
      role: true,
      isActive: true,
      permissionOverrides: { select: { module: true, level: true } },
    },
  });

  if (!dbUser || !dbUser.isActive) {
    throw new AuthzError("SUSPENDED", "Account is suspended or removed.");
  }

  const effective = resolveEffectiveLevels(
    dbUser.role,
    dbUser.permissionOverrides,
  )[module];

  if (!meets(effective, level)) {
    throw new AuthzError(
      "FORBIDDEN",
      `Requires ${level} on ${module}; current effective level is ${effective}.`,
      { module, required: level, effective },
    );
  }

  return { ...session, role: dbUser.role, effective };
}

export async function requireAdmin(): Promise<AuthSession> {
  const session = await getOptionalSession();
  if (!session) {
    throw new AuthzError("UNAUTHENTICATED", "Sign-in required.");
  }

  if (!AUTH_ENABLED) return session;

  const dbUser = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: { id: true, role: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive) {
    throw new AuthzError("SUSPENDED", "Account is suspended or removed.");
  }
  if (dbUser.role !== UserRole.ADMIN) {
    throw new AuthzError("FORBIDDEN", "Admin role required.");
  }
  return { ...session, role: dbUser.role };
}

/**
 * Throws if the action would remove/suspend/demote the last remaining active,
 * non-deleted ADMIN. Call before suspend, delete, or role-change-away-from-admin.
 */
export async function assertNotLastActiveAdmin(userId: string): Promise<void> {
  const target = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, deletedAt: true },
  });
  // If the target isn't currently a counted admin, the action can't reduce the count.
  if (!target) return;
  if (target.role !== UserRole.ADMIN) return;
  if (!target.isActive) return;
  if (target.deletedAt) return;

  const activeAdminCount = await prisma.user.count({
    where: { role: UserRole.ADMIN, isActive: true, deletedAt: null },
  });
  if (activeAdminCount <= 1) {
    throw new AuthzError(
      "FORBIDDEN",
      "Cannot remove, suspend, or demote the last active administrator.",
    );
  }
}

/* ============================================================
 * UI helper: load the current user's effective levels.
 *
 * Returns null when not authenticated; the dashboard layout passes the
 * result to a client-side PermissionsProvider so client components can
 * hide controls (e.g. delete buttons) the user can't use.
 *
 * UI hiding is a UX courtesy. The real boundary is requireLevel inside
 * each server action.
 * ============================================================ */
export async function getEffectiveLevelsForCurrentUser(): Promise<EffectiveLevels | null> {
  if (!AUTH_ENABLED) {
    // Dev stub admin → all FULL.
    return {
      [PermissionModule.REPORTS]: PermissionLevel.FULL,
      [PermissionModule.RECONCILIATION]: PermissionLevel.FULL,
      [PermissionModule.SETTLEMENTS]: PermissionLevel.FULL,
      [PermissionModule.PAYMENTS]: PermissionLevel.FULL,
      [PermissionModule.DATA_EXPLORER]: PermissionLevel.FULL,
      [PermissionModule.USERS]: PermissionLevel.FULL,
      [PermissionModule.AUDIT]: PermissionLevel.FULL,
      [PermissionModule.SETTINGS]: PermissionLevel.FULL,
    };
  }
  const session = await getOptionalSession();
  if (!session) return null;
  const dbUser = await prisma.user.findFirst({
    where: { id: session.id, deletedAt: null },
    select: {
      role: true,
      isActive: true,
      permissionOverrides: { select: { module: true, level: true } },
    },
  });
  if (!dbUser || !dbUser.isActive) return null;
  return resolveEffectiveLevels(dbUser.role, dbUser.permissionOverrides);
}

/* ============================================================
 * MutationResult helpers
 * ============================================================ */

export type MutationResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Server actions wrap their guard call in try/catch and convert any AuthzError
 * to the standard MutationResult shape so the client gets a typed error
 * instead of an exception.
 */
export function authzErrorToMutationResult(e: unknown): MutationResult<never> {
  if (isAuthzError(e)) {
    return { ok: false, error: e.message };
  }
  const msg = e instanceof Error ? e.message : "Unauthorized.";
  return { ok: false, error: msg };
}
