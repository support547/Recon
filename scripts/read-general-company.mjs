import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/control-prisma/generated/index.js';

const adapter = new PrismaPg({ connectionString: process.env.CONTROL_DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const rows = await prisma.company.findMany({
  where: {
    OR: [
      { name: { contains: 'general', mode: 'insensitive' } },
      { slug: { contains: 'general', mode: 'insensitive' } },
    ],
  },
  select: { id: true, name: true, slug: true, databaseUrl: true },
});

console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
