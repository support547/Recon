# Multi-tenant architecture

Each client (tenant) has their own Postgres database. A single shared
**control DB** stores the tenant catalogue + user credentials.

## Layout

```
prisma/schema.prisma                 ← tenant schema (per-company data)
prisma/migrations/                   ← tenant migrations
prisma/control/schema.prisma         ← control schema (Company + User)
prisma/control/prisma.config.ts      ← control's prisma.config (URL + paths)
prisma/control/migrations/           ← control migrations
lib/control-prisma.ts                ← singleton PrismaClient for control DB
lib/control-prisma/generated/        ← generated control client (gitignored)
lib/prisma.ts                        ← tenant resolver + Proxy `prisma` export
scripts/onboard-tenant.ts            ← create tenant DB + seed admin
scripts/migrate-tenants.ts           ← run migrate deploy across all tenants
```

## How `prisma` works now

`import { prisma } from "@/lib/prisma"` still works at every call site, but
it's now a Proxy:

- Every property access resolves the active tenant's `PrismaClient` via
  `getTenantPrisma()` and forwards the call.
- `getTenantPrisma()` reads the session id, looks up the user in the
  **control** DB to get `company.databaseUrl`, and returns the cached
  tenant client for that URL.
- The lookup is memoised per request via `react.cache`, so a server action
  that issues N Prisma calls still does one control-DB hit, not N.
- Tenant `PrismaClient`s are cached in a `Map<databaseUrl, PrismaClient>`
  on `globalThis`, so connection pools are reused across requests and
  across HMR.

Direct usage when you have the URL but no session (scripts):

```ts
import { getTenantPrismaByUrl } from "@/lib/prisma";
const prisma = getTenantPrismaByUrl(databaseUrl);
```

## Auth

NextAuth reads / writes **only** the control DB. After login the JWT carries
`{ id, role, companyId }`. `requireAuth()` in `actions/auth.ts` re-checks
the control DB on every mutation and exposes `companyId` + `databaseUrl`
to callers that want to skip the lookup.

`actions/users.ts` mutations dual-write the auth-critical fields
(`email`, `role`, `isActive`, `passwordHash`) into both DBs so:

1. login (control DB) sees the latest credentials, and
2. the tenant's existing User-FK relations (`audit_logs.actor_id`,
   `user_permission_overrides.user_id`) keep resolving.

Profile-only fields (`designation`, `mobile`, `employeeId`, …) stay
tenant-only.

## Env

| var                          | purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `CONTROL_DATABASE_URL`       | shared control DB                                        |
| `DATABASE_URL`               | tenant DB used by `prisma migrate dev` against the schema|
| `DEV_TENANT_DATABASE_URL`    | dev fallback when `AUTH_ENABLED=false`                   |
| `TENANT_ADMIN_DATABASE_URL`  | onboarding uses this to `CREATE DATABASE <slug>`         |
| `TENANT_DB_URL_TEMPLATE`     | `postgres://…/{slug}_db` — `{slug}` is replaced          |

## Bootstrap (once)

```sh
# 1. create the control DB itself in your Postgres cluster
psql "$TENANT_ADMIN_DATABASE_URL" -c 'CREATE DATABASE fba_control;'

# 2. apply control schema
npm run control:migrate:dev -- --name init

# 3. generate the control client (also runs after every control schema change)
npm run control:generate
```

## Onboard a new tenant

```sh
npm run tenant:onboard -- \
  --name "Acme Inc" \
  --slug acme \
  --admin-email admin@acme.com \
  --admin-password 's3cret!'
```

The script will:

1. `CREATE DATABASE acme_db` on the cluster pointed at by
   `TENANT_ADMIN_DATABASE_URL` (skips if it already exists).
2. Run `prisma migrate deploy` against `acme_db`.
3. Insert `Company(slug=acme, databaseUrl=…)` + admin `User` in the
   control DB.
4. Mirror the admin into `acme_db.users` so audit / permission FKs
   resolve.

Pass `--database-url <url>` to override the URL instead of using the
template.

## Roll a tenant schema change

After editing `prisma/schema.prisma` and running
`prisma migrate dev` against one tenant locally:

```sh
npm run tenant:migrate-all                    # all tenants, abort on first failure
npm run tenant:migrate-all -- --continue-on-error
npm run tenant:migrate-all -- --slug acme     # just one
```
