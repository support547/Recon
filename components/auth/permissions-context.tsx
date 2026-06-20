"use client";

import * as React from "react";
import { PermissionLevel, PermissionModule } from "@prisma/client";

export type EffectiveLevels = Record<PermissionModule, PermissionLevel>;

const RANK: Record<PermissionLevel, number> = {
  [PermissionLevel.NONE]: 0,
  [PermissionLevel.VIEW]: 1,
  [PermissionLevel.EDIT]: 2,
  [PermissionLevel.FULL]: 3,
};

const ALL_NONE: EffectiveLevels = {
  [PermissionModule.REPORTS]: PermissionLevel.NONE,
  [PermissionModule.RECONCILIATION]: PermissionLevel.NONE,
  [PermissionModule.SETTLEMENTS]: PermissionLevel.NONE,
  [PermissionModule.PAYMENTS]: PermissionLevel.NONE,
  [PermissionModule.DATA_EXPLORER]: PermissionLevel.NONE,
  [PermissionModule.USERS]: PermissionLevel.NONE,
  [PermissionModule.AUDIT]: PermissionLevel.NONE,
  [PermissionModule.SETTINGS]: PermissionLevel.NONE,
};

const PermissionsContext = React.createContext<EffectiveLevels>(ALL_NONE);

export function PermissionsProvider({
  value,
  children,
}: {
  value: EffectiveLevels | null;
  children: React.ReactNode;
}) {
  // Null (unauthenticated) collapses to all-NONE — safe default for the UI.
  // Server actions are the boundary; this only governs button visibility.
  return (
    <PermissionsContext.Provider value={value ?? ALL_NONE}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): EffectiveLevels {
  return React.useContext(PermissionsContext);
}

export function useCan(module: PermissionModule, level: PermissionLevel): boolean {
  const levels = usePermissions();
  return RANK[levels[module]] >= RANK[level];
}

/**
 * Convenience: can the current user perform a delete on this module?
 * Delete always requires FULL — see lib/auth/rbac.ts spec.
 */
export function useCanDelete(module: PermissionModule): boolean {
  return useCan(module, PermissionLevel.FULL);
}
