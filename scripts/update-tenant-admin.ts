/**
 * Update a tenant admin's email and/or password in both the control DB
 * and the tenant DB. Both rows share the same User.id, so changes stay
 * in sync.
 *
 * Usage:
 *   tsx scripts/update-tenant-admin.ts \
 *     --slug acme \
 *     [--current-email old@acme.com | --user-id ckxxx] \
 *     [--new-email new@acme.com] \
 *     [--new-password 's3cret!']
 *
 * At least one of --new-email / --new-password must be supplied. Exactly
 * one of --current-email / --user-id is required to pick the admin (a
 * tenant may have several).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

import { controlPrisma, UserRole } from "../lib/control-prisma";
import { getTenantPrismaByUrl } from "../lib/prisma";

type Args = {
  slug: string;
  currentEmail?: string;
  userId?: string;
  newEmail?: string;
  newPassword?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--slug": out.slug = next(); break;
      case "--current-email": out.currentEmail = next()?.trim().toLowerCase(); break;
      case "--user-id": out.userId = next(); break;
      case "--new-email": out.newEmail = next()?.trim().toLowerCase(); break;
      case "--new-password": out.newPassword = next(); break;
      default:
        if (a?.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (!out.slug) throw new Error("Missing required --slug");
  if (!out.currentEmail && !out.userId) {
    throw new Error("Provide either --current-email or --user-id to identify the admin.");
  }
  if (out.currentEmail && out.userId) {
    throw new Error("--current-email and --user-id are mutually exclusive.");
  }
  if (!out.newEmail && !out.newPassword) {
    throw new Error("Nothing to do: pass --new-email and/or --new-password.");
  }
  if (out.newPassword && out.newPassword.length < 8) {
    throw new Error("--new-password must be at least 8 characters.");
  }
  return out as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const company = await controlPrisma.company.findUnique({
    where: { slug: args.slug },
    select: { id: true, name: true, databaseUrl: true },
  });
  if (!company) {
    throw new Error(`No tenant found with slug=${args.slug}.`);
  }

  const target = await controlPrisma.user.findFirst({
    where: {
      companyId: company.id,
      ...(args.userId ? { id: args.userId } : {}),
      ...(args.currentEmail ? { email: args.currentEmail } : {}),
    },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!target) {
    throw new Error(
      `No matching user under tenant=${args.slug} (${args.currentEmail ?? args.userId}).`,
    );
  }
  if (target.role !== UserRole.ADMIN) {
    throw new Error(
      `User ${target.email} is role=${target.role}, not ADMIN. Refusing to update via admin script.`,
    );
  }

  // Pre-check email collision (control DB enforces email uniqueness globally).
  if (args.newEmail && args.newEmail !== target.email) {
    const collision = await controlPrisma.user.findUnique({
      where: { email: args.newEmail },
      select: { id: true },
    });
    if (collision && collision.id !== target.id) {
      throw new Error(`Email already in use in control DB: ${args.newEmail}`);
    }
  }

  const passwordHash = args.newPassword
    ? await bcrypt.hash(args.newPassword, 12)
    : null;

  // Build update payloads.
  const controlData: { email?: string; passwordHash?: string } = {};
  if (args.newEmail) controlData.email = args.newEmail;
  if (passwordHash) controlData.passwordHash = passwordHash;

  const tenantData: { email?: string; passwordHash?: string } = { ...controlData };

  await controlPrisma.user.update({
    where: { id: target.id },
    data: controlData,
  });
  console.log(
    `[update-tenant-admin] control: user=${target.id} updated (${Object.keys(controlData).join(", ")}).`,
  );

  const tenantPrisma = getTenantPrismaByUrl(company.databaseUrl);
  await tenantPrisma.user.update({
    where: { id: target.id },
    data: tenantData,
  });
  console.log(`[update-tenant-admin] tenant ${args.slug}: user=${target.id} mirrored.`);

  console.log(
    `[update-tenant-admin] done. tenant=${args.slug} admin=${target.email}` +
      (args.newEmail ? ` → ${args.newEmail}` : "") +
      (args.newPassword ? " (password reset)" : ""),
  );
}

main()
  .catch((e) => {
    console.error("[update-tenant-admin] failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await controlPrisma.$disconnect();
  });
