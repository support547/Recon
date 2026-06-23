/**
 * Run `prisma migrate deploy` against every tenant DB registered in the
 * control DB. Call after every tenant schema change.
 *
 * Usage:
 *   tsx scripts/migrate-tenants.ts                # all tenants
 *   tsx scripts/migrate-tenants.ts --slug acme    # one tenant
 *   tsx scripts/migrate-tenants.ts --continue-on-error
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { controlPrisma } from "../lib/control-prisma";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Args = { slug?: string; continueOnError: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { continueOnError: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--continue-on-error") out.continueOnError = true;
    else if (a?.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }
  return out;
}

function runMigrateDeploy(slug: string, url: string): boolean {
  const repoRoot = path.resolve(__dirname, "..");
  console.log(`\n[migrate-tenants] → ${slug}`);
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
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    },
  );
  return result.status === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const companies = await controlPrisma.company.findMany({
    where: args.slug ? { slug: args.slug } : undefined,
    select: { slug: true, databaseUrl: true, name: true },
    orderBy: { slug: "asc" },
  });

  if (companies.length === 0) {
    console.log(args.slug
      ? `[migrate-tenants] no tenant with slug=${args.slug}.`
      : "[migrate-tenants] no tenants registered.");
    return;
  }

  console.log(`[migrate-tenants] ${companies.length} tenant(s) to process.`);

  const failed: string[] = [];
  for (const c of companies) {
    const ok = runMigrateDeploy(c.slug, c.databaseUrl);
    if (!ok) {
      failed.push(c.slug);
      if (!args.continueOnError) {
        throw new Error(`[migrate-tenants] failed on tenant=${c.slug}; aborting (use --continue-on-error to keep going).`);
      }
    }
  }

  console.log(`\n[migrate-tenants] done. ok=${companies.length - failed.length} failed=${failed.length}`);
  if (failed.length > 0) {
    console.log(`[migrate-tenants] failed tenants: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("[migrate-tenants] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await controlPrisma.$disconnect();
  });
