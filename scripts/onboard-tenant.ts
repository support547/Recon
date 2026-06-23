/**
 * Onboard a new tenant.
 *
 *   1. CREATE DATABASE <slug>           (on the cluster pointed at by
 *                                        TENANT_ADMIN_DATABASE_URL — usually
 *                                        the cluster's "postgres" database).
 *   2. prisma migrate deploy            against the new tenant DB.
 *   3. Insert Company + admin User      into the control DB.
 *   4. Mirror the admin User            into the new tenant DB (so the
 *                                        existing tenant User FKs resolve).
 *
 * Usage:
 *   tsx scripts/onboard-tenant.ts \
 *     --name "Acme Inc" \
 *     --slug acme \
 *     --admin-email admin@acme.com \
 *     --admin-password 'changeme' \
 *     [--database-url postgres://.../acme_db]   # optional override; if absent,
 *                                                # built from TENANT_DB_URL_TEMPLATE
 *
 * Required env:
 *   CONTROL_DATABASE_URL          — control DB
 *   TENANT_ADMIN_DATABASE_URL     — superuser-ish URL used to CREATE DATABASE
 *                                   (e.g. postgres://postgres:pw@host:5432/postgres)
 *   TENANT_DB_URL_TEMPLATE        — used when --database-url is omitted. Must
 *                                   contain the literal token `{slug}`. Example:
 *                                   postgres://app:pw@host:5432/{slug}_db
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { Client as PgClient } from "pg";

import {
  controlPrisma,
  UserRole,
} from "../lib/control-prisma";
import { getTenantPrismaByUrl } from "../lib/prisma";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Args = {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  databaseUrl?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--name": out.name = next(); break;
      case "--slug": out.slug = next(); break;
      case "--admin-email": out.adminEmail = next()?.trim().toLowerCase(); break;
      case "--admin-password": out.adminPassword = next(); break;
      case "--database-url": out.databaseUrl = next(); break;
      default:
        if (a?.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  for (const k of ["name", "slug", "adminEmail", "adminPassword"] as const) {
    if (!out[k]) throw new Error(`Missing required --${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(out.slug!)) {
    throw new Error(`Invalid slug: ${out.slug} (alphanumeric, dashes, underscores)`);
  }
  return out as Args;
}

function buildTenantUrl(slug: string, override?: string): string {
  if (override) return override;
  const tpl = process.env.TENANT_DB_URL_TEMPLATE;
  if (!tpl || !tpl.includes("{slug}")) {
    throw new Error(
      "TENANT_DB_URL_TEMPLATE must be set and contain {slug} when --database-url is omitted.",
    );
  }
  return tpl.replace(/\{slug\}/g, slug);
}

function parseDbName(url: string): string {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!name) throw new Error(`Cannot determine DB name from ${url}`);
  return name;
}

async function createDatabaseIfMissing(targetUrl: string): Promise<void> {
  const adminUrl = process.env.TENANT_ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("TENANT_ADMIN_DATABASE_URL is required to CREATE DATABASE.");
  }
  const dbName = parseDbName(targetUrl);
  const admin = new PgClient({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (exists.rowCount === 0) {
      // Identifier interpolation — safe because slug is regex-validated above.
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`[onboard] created database "${dbName}".`);
    } else {
      console.log(`[onboard] database "${dbName}" already exists, skipping CREATE.`);
    }
  } finally {
    await admin.end();
  }
}

function runMigrateDeploy(targetUrl: string): void {
  const repoRoot = path.resolve(__dirname, "..");
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(repoRoot, "prisma", "schema.prisma"),
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: targetUrl },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed (exit ${result.status}).`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = buildTenantUrl(args.slug, args.databaseUrl);

  console.log(`[onboard] tenant=${args.slug}, db=${parseDbName(databaseUrl)}`);

  // 1. Provision DB.
  await createDatabaseIfMissing(databaseUrl);

  // 2. Run tenant migrations.
  runMigrateDeploy(databaseUrl);

  // 3. Insert Company + admin User in control DB.
  const passwordHash = await bcrypt.hash(args.adminPassword, 12);

  const company = await controlPrisma.company.upsert({
    where: { slug: args.slug },
    create: { name: args.name, slug: args.slug, databaseUrl },
    update: { name: args.name, databaseUrl },
  });

  const adminUser = await controlPrisma.user.upsert({
    where: { email: args.adminEmail },
    create: {
      email: args.adminEmail,
      passwordHash,
      name: "Administrator",
      role: UserRole.ADMIN,
      isActive: true,
      companyId: company.id,
    },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      companyId: company.id,
    },
  });
  console.log(`[onboard] control: company=${company.id} user=${adminUser.id}`);

  // 4. Mirror admin into tenant DB so audit/perm FKs resolve.
  const tenantPrisma = getTenantPrismaByUrl(databaseUrl);
  await tenantPrisma.user.upsert({
    where: { id: adminUser.id },
    create: {
      id: adminUser.id,
      name: "Administrator",
      email: args.adminEmail,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    update: {
      email: args.adminEmail,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
    },
  });
  console.log(`[onboard] mirrored admin into tenant DB.`);

  console.log(`[onboard] done. Tenant slug=${args.slug} ready.`);
}

main()
  .catch((e) => {
    console.error("[onboard] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await controlPrisma.$disconnect();
  });
