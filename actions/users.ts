"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AuditAction,
  PermissionLevel,
  PermissionModule,
  Prisma,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { controlPrisma } from "@/lib/control-prisma";
import { recordAudit } from "@/lib/auth/audit";
import {
  assertNotLastActiveAdmin,
  authzErrorToMutationResult,
  isOverridable,
  requireAdmin,
  requireLevel,
  resolveEffectiveLevelsDetailed,
  type EffectiveModuleLevel,
  type MutationResult,
} from "@/lib/auth/rbac";

/* ============================================================
 * Validation
 * ============================================================ */

const emailField = z.string().trim().toLowerCase().email("Enter a valid email.");
const nameField = z.string().trim().min(1, "Name is required.").max(120);
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200);

const CreateUserSchema = z.object({
  name: nameField,
  email: emailField,
  role: z.nativeEnum(UserRole),
  tempPassword: passwordField,
});

/** Blank string → null. Trimmed. Optional. */
function optionalText(max: number) {
  return z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().trim().max(max).nullable(),
    )
    .optional();
}

const optionalDate = z
  .preprocess(
    (v) => {
      if (v === "" || v === undefined) return undefined;
      if (v === null) return null;
      return v;
    },
    z.union([z.coerce.date(), z.null()]),
  )
  .optional();

const UpdateUserSchema = z.object({
  name: nameField.optional(),
  email: emailField.optional(),
  role: z.nativeEnum(UserRole).optional(),
  // Admin-managed profile / contact detail
  designation: optionalText(120),
  mobile: optionalText(40),
  dateJoined: optionalDate,
  address: optionalText(500),
  department: optionalText(120),
  employeeId: optionalText(40),
});

const SetActiveSchema = z.object({ active: z.boolean() });

const SetOverrideSchema = z.object({
  module: z.nativeEnum(PermissionModule),
  level: z.nativeEnum(PermissionLevel),
});

const ClearOverrideSchema = z.object({
  module: z.nativeEnum(PermissionModule),
});

const ResetPasswordSchema = z.object({ newTempPassword: passwordField });

/* ============================================================
 * Read
 * ============================================================ */

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
};

export async function listUsers(): Promise<UserListRow[]> {
  await requireAdmin();
  const rows = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
  return rows;
}

export type UserDetail = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  designation: string | null;
  mobile: string | null;
  dateJoined: Date | null;
  address: string | null;
  department: string | null;
  employeeId: string | null;
  permissions: EffectiveModuleLevel[];
};

export async function getUser(id: string): Promise<UserDetail | null> {
  await requireAdmin();
  const u = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      designation: true,
      mobile: true,
      dateJoined: true,
      address: true,
      department: true,
      employeeId: true,
      permissionOverrides: { select: { module: true, level: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    designation: u.designation,
    mobile: u.mobile,
    dateJoined: u.dateJoined,
    address: u.address,
    department: u.department,
    employeeId: u.employeeId,
    permissions: resolveEffectiveLevelsDetailed(u.role, u.permissionOverrides),
  };
}

/* ============================================================
 * Helpers
 * ============================================================ */

function revalidateUsers() {
  revalidatePath("/settings/users");
  revalidatePath("/settings/audit");
}

/* ============================================================
 * Mutations
 * ============================================================ */

export async function createUser(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const v = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: v.email } });
  if (existing) return { ok: false, error: "Email already registered." };

  const passwordHash = await bcrypt.hash(v.tempPassword, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: v.name,
        email: v.email,
        passwordHash,
        role: v.role,
        mustChangePassword: true,
      },
      select: { id: true, email: true, role: true },
    });
    // Mirror auth credentials to control DB so this user can sign in.
    await controlPrisma.user.create({
      data: {
        id: user.id,
        email: v.email,
        passwordHash,
        name: v.name,
        role: v.role,
        companyId: admin.companyId,
      },
    });
    await recordAudit({
      action: AuditAction.USER_CREATED,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: user.id,
      targetEmail: user.email,
      summary: `Created user ${user.email} with role ${user.role}.`,
      metadata: { role: user.role },
    });
    revalidateUsers();
    return { ok: true, data: { id: user.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create user.";
    return { ok: false, error: msg };
  }
}

export async function updateUser(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = UpdateUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const v = parsed.data;
  const anyField =
    v.name !== undefined ||
    v.email !== undefined ||
    v.role !== undefined ||
    v.designation !== undefined ||
    v.mobile !== undefined ||
    v.dateJoined !== undefined ||
    v.address !== undefined ||
    v.department !== undefined ||
    v.employeeId !== undefined;
  if (!anyField) {
    return { ok: false, error: "No changes provided." };
  }

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      mobile: true,
      dateJoined: true,
      address: true,
      department: true,
      employeeId: true,
    },
  });
  if (!existing) return { ok: false, error: "User not found." };

  // Email-uniqueness pre-check (DB unique constraint is the final guard).
  if (v.email && v.email !== existing.email) {
    const conflict = await prisma.user.findUnique({ where: { email: v.email } });
    if (conflict) return { ok: false, error: "Email already in use." };
  }

  // employeeId-uniqueness pre-check (only when a non-null value is submitted).
  if (v.employeeId && v.employeeId !== existing.employeeId) {
    const conflict = await prisma.user.findFirst({
      where: { employeeId: v.employeeId, NOT: { id: existing.id } },
      select: { id: true },
    });
    if (conflict) {
      return { ok: false, error: "Employee ID already in use." };
    }
  }

  const roleChange = v.role && v.role !== existing.role;
  const demoting =
    roleChange && existing.role === UserRole.ADMIN && v.role !== UserRole.ADMIN;

  if (demoting) {
    try {
      await assertNotLastActiveAdmin(existing.id);
    } catch (e) {
      return authzErrorToMutationResult(e);
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.email !== undefined ? { email: v.email } : {}),
        ...(v.role !== undefined ? { role: v.role } : {}),
        ...(v.designation !== undefined ? { designation: v.designation } : {}),
        ...(v.mobile !== undefined ? { mobile: v.mobile } : {}),
        ...(v.dateJoined !== undefined ? { dateJoined: v.dateJoined } : {}),
        ...(v.address !== undefined ? { address: v.address } : {}),
        ...(v.department !== undefined ? { department: v.department } : {}),
        ...(v.employeeId !== undefined ? { employeeId: v.employeeId } : {}),
      },
      select: { id: true, email: true, role: true },
    });
    // Mirror auth-critical fields to control DB.
    if (v.name !== undefined || v.email !== undefined || v.role !== undefined) {
      await controlPrisma.user.update({
        where: { id: existing.id },
        data: {
          ...(v.name !== undefined ? { name: v.name } : {}),
          ...(v.email !== undefined ? { email: v.email } : {}),
          ...(v.role !== undefined ? { role: v.role } : {}),
        },
      });
    }

    await recordAudit({
      action: AuditAction.USER_UPDATED,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: updated.email,
      summary: `Updated user ${existing.email}.`,
      metadata: {
        before: {
          name: existing.name,
          email: existing.email,
          role: existing.role,
          designation: existing.designation,
          mobile: existing.mobile,
          dateJoined: existing.dateJoined,
          address: existing.address,
          department: existing.department,
          employeeId: existing.employeeId,
        },
        after: {
          name: v.name,
          email: v.email,
          role: v.role,
          designation: v.designation,
          mobile: v.mobile,
          dateJoined: v.dateJoined,
          address: v.address,
          department: v.department,
          employeeId: v.employeeId,
        },
      },
    });

    if (roleChange) {
      await recordAudit({
        action: AuditAction.USER_ROLE_CHANGED,
        actorId: admin.id,
        actorEmail: admin.email,
        targetType: "User",
        targetId: existing.id,
        targetEmail: updated.email,
        summary: `Role ${existing.role} → ${updated.role} for ${updated.email}.`,
        metadata: { from: existing.role, to: updated.role },
      });
    }

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const target = (e.meta?.target ?? []) as string[];
      if (target.some((t) => t.includes("employee_id"))) {
        return { ok: false, error: "Employee ID already in use." };
      }
      if (target.some((t) => t.includes("email"))) {
        return { ok: false, error: "Email already in use." };
      }
      return { ok: false, error: "Value must be unique." };
    }
    const msg = e instanceof Error ? e.message : "Could not update user.";
    return { ok: false, error: msg };
  }
}

export async function setUserActive(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = SetActiveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { active } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!existing) return { ok: false, error: "User not found." };
  if (existing.isActive === active) return { ok: true };

  if (!active) {
    try {
      await assertNotLastActiveAdmin(existing.id);
    } catch (e) {
      return authzErrorToMutationResult(e);
    }
  }

  try {
    await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: active },
    });
    await controlPrisma.user.update({
      where: { id: existing.id },
      data: { isActive: active },
    });

    await recordAudit({
      action: active
        ? AuditAction.USER_REACTIVATED
        : AuditAction.USER_SUSPENDED,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: active
        ? `Reactivated ${existing.email}.`
        : `Suspended ${existing.email}.`,
    });

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update status.";
    return { ok: false, error: msg };
  }
}

export async function setPermissionOverride(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = SetOverrideSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { module, level } = parsed.data;

  if (!isOverridable(module)) {
    return {
      ok: false,
      error: "Admin-only modules (USERS, AUDIT, SETTINGS) cannot be overridden.",
    };
  }

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!existing) return { ok: false, error: "User not found." };

  const prior = await prisma.userPermissionOverride.findUnique({
    where: { userId_module: { userId: existing.id, module } },
    select: { level: true },
  });

  try {
    await prisma.userPermissionOverride.upsert({
      where: { userId_module: { userId: existing.id, module } },
      create: { userId: existing.id, module, level },
      update: { level },
    });

    await recordAudit({
      action: AuditAction.PERMISSION_OVERRIDE_SET,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: `Override ${module}=${level} on ${existing.email}.`,
      metadata: { module, level, previousLevel: prior?.level ?? null },
    });

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not set override.";
    return { ok: false, error: msg };
  }
}

export async function clearPermissionOverride(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = ClearOverrideSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const { module } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!existing) return { ok: false, error: "User not found." };

  const prior = await prisma.userPermissionOverride.findUnique({
    where: { userId_module: { userId: existing.id, module } },
    select: { level: true },
  });
  if (!prior) return { ok: true }; // already cleared

  try {
    await prisma.userPermissionOverride.delete({
      where: { userId_module: { userId: existing.id, module } },
    });

    await recordAudit({
      action: AuditAction.PERMISSION_OVERRIDE_CLEARED,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: `Cleared override on ${module} for ${existing.email}.`,
      metadata: { module, previousLevel: prior.level },
    });

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not clear override.";
    return { ok: false, error: msg };
  }
}

export async function resetUserPassword(
  id: string,
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = ResetPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true },
  });
  if (!existing) return { ok: false, error: "User not found." };

  const passwordHash = await bcrypt.hash(parsed.data.newTempPassword, 12);

  try {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, mustChangePassword: true },
    });
    await controlPrisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });

    await recordAudit({
      action: AuditAction.USER_PASSWORD_RESET,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: `Password reset for ${existing.email} (must change on next login).`,
    });

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not reset password.";
    return { ok: false, error: msg };
  }
}

export async function deleteUser(id: string): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireLevel(PermissionModule.USERS, PermissionLevel.FULL);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const existing = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!existing) return { ok: false, error: "User not found." };

  if (existing.id === admin.id) {
    return { ok: false, error: "Cannot delete your own account." };
  }

  try {
    await assertNotLastActiveAdmin(existing.id);
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  try {
    await prisma.user.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await controlPrisma.user.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    await recordAudit({
      action: AuditAction.USER_DELETED,
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "User",
      targetId: existing.id,
      targetEmail: existing.email,
      summary: `Soft-deleted ${existing.email}.`,
      metadata: { role: existing.role },
    });

    revalidateUsers();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not delete user.";
    return { ok: false, error: msg };
  }
}
