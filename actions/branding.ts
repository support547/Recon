"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/lib/control-prisma/generated";
import { controlPrisma } from "@/lib/control-prisma";
import {
  AuthzError,
  authzErrorToMutationResult,
  requireAdmin,
  type MutationResult,
} from "@/lib/auth/rbac";
import {
  ALLOWED_MARKETPLACES,
  type Marketplace,
} from "@/lib/branding/marketplaces";

const MAX_LOGO_BYTES = 30 * 1024;
const ALLOWED_LOGO_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

const MARKETPLACE_SET = new Set<string>(ALLOWED_MARKETPLACES);
const MAX_MARKETPLACES = 1;

export type CompanyBranding = {
  logo?: string;
  displayName?: string;
  marketplaces?: Marketplace[];
};

export type BrandingSnapshot = {
  /** Legal/internal company name from Company.name — never overwritten. */
  companyName: string;
  branding: CompanyBranding;
};

const DataUrlLogoSchema = z.string().superRefine((s, ctx) => {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(s);
  if (!match) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Logo must be a base64 data URL.",
    });
    return;
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED_LOGO_MIMES.has(mime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Logo must be PNG, JPEG, or SVG.",
    });
    return;
  }
  const b64 = match[2];
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  if (bytes > MAX_LOGO_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Logo must be ≤ 30 KB (got ${Math.ceil(bytes / 1024)} KB).`,
    });
  }
});

const UpdateBrandingSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required.")
      .max(60, "Display name must be 60 characters or fewer.")
      .optional(),
    logo: DataUrlLogoSchema.optional(),
    marketplaces: z
      .array(
        z.enum(ALLOWED_MARKETPLACES, {
          message: `Marketplace must be one of ${ALLOWED_MARKETPLACES.join(", ")}.`,
        }),
      )
      .max(MAX_MARKETPLACES, "Only one marketplace is supported.")
      .optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.logo !== undefined ||
      v.marketplaces !== undefined,
    "Nothing to update.",
  );

function parseBranding(
  raw: Prisma.JsonValue | null | undefined,
): CompanyBranding {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: CompanyBranding = {};
  if (typeof obj.displayName === "string") out.displayName = obj.displayName;
  if (typeof obj.logo === "string") out.logo = obj.logo;
  if (Array.isArray(obj.marketplaces)) {
    const cleaned = obj.marketplaces
      .filter((m): m is string => typeof m === "string")
      .filter((m): m is Marketplace => MARKETPLACE_SET.has(m))
      .slice(0, MAX_MARKETPLACES);
    out.marketplaces = cleaned;
  }
  return out;
}

function brandingToJson(b: CompanyBranding): Prisma.InputJsonValue {
  return b as unknown as Prisma.InputJsonValue;
}

export async function getCompanyBranding(): Promise<BrandingSnapshot> {
  const admin = await requireAdmin();
  const company = await controlPrisma.company.findUnique({
    where: { id: admin.companyId },
    select: { name: true, branding: true },
  });
  if (!company) {
    throw new AuthzError("FORBIDDEN", "Company not found.");
  }
  return {
    companyName: company.name,
    branding: parseBranding(company.branding),
  };
}

export async function updateCompanyBranding(
  raw: unknown,
): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }

  const parsed = UpdateBrandingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const v = parsed.data;

  const existing = await controlPrisma.company.findUnique({
    where: { id: admin.companyId },
    select: { branding: true },
  });
  const current = parseBranding(existing?.branding ?? null);

  const next: CompanyBranding = { ...current };
  if (v.displayName !== undefined) next.displayName = v.displayName;
  if (v.logo !== undefined) next.logo = v.logo;
  if (v.marketplaces !== undefined) next.marketplaces = v.marketplaces;

  try {
    await controlPrisma.company.update({
      where: { id: admin.companyId },
      data: { branding: brandingToJson(next) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save branding.";
    return { ok: false, error: msg };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeCompanyLogo(): Promise<MutationResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return authzErrorToMutationResult(e);
  }
  const existing = await controlPrisma.company.findUnique({
    where: { id: admin.companyId },
    select: { branding: true },
  });
  const current = parseBranding(existing?.branding ?? null);
  if (current.logo === undefined) return { ok: true };
  const { logo: _drop, ...rest } = current;
  try {
    await controlPrisma.company.update({
      where: { id: admin.companyId },
      data: { branding: brandingToJson(rest) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove logo.";
    return { ok: false, error: msg };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
