import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/control-prisma/generated/index.js';

const adapter = new PrismaPg({ connectionString: process.env.CONTROL_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WHERE = {
  OR: [
    { name: { contains: 'general', mode: 'insensitive' } },
    { slug: { contains: 'general', mode: 'insensitive' } },
  ],
};

const before = await prisma.company.findMany({
  where: WHERE,
  select: { id: true, name: true, slug: true, databaseUrl: true },
});
console.log('BEFORE:');
console.log(JSON.stringify(before, null, 2));

if (before.length !== 1) {
  console.error(`ABORT: expected 1 row matching, got ${before.length}`);
  await prisma.$disconnect();
  process.exit(1);
}

const oldUrl = before[0].databaseUrl;
const u = new URL(oldUrl);

if (u.port !== '25060') {
  console.error(`ABORT: expected port 25060, got ${u.port}`);
  await prisma.$disconnect();
  process.exit(1);
}
if (u.pathname !== '/GeneralBooks_db') {
  console.error(`ABORT: expected /GeneralBooks_db path, got ${u.pathname}`);
  await prisma.$disconnect();
  process.exit(1);
}

u.port = '25061';
u.pathname = '/generalbooks-pool';
u.searchParams.set('pgbouncer', 'true');
const newUrl = u.toString();

console.log('\nNEW URL:');
console.log(newUrl);

const result = await prisma.$transaction(async (tx) => {
  const upd = await tx.company.updateMany({
    where: WHERE,
    data: { databaseUrl: newUrl },
  });
  if (upd.count !== 1) {
    throw new Error(`ROLLBACK: updateMany affected ${upd.count} rows, expected 1`);
  }
  return upd;
});

console.log(`\nUPDATED rows: ${result.count}`);

const after = await prisma.company.findMany({
  where: WHERE,
  select: { id: true, name: true, slug: true, databaseUrl: true },
});
console.log('\nAFTER:');
console.log(JSON.stringify(after, null, 2));

await prisma.$disconnect();
