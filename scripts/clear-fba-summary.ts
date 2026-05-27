import { prisma } from "../lib/prisma";

async function main() {
  const before = await prisma.fbaSummary.count();
  console.log("Rows before:", before);
  const del = await prisma.fbaSummary.deleteMany({});
  console.log("Deleted:", del.count);
  const after = await prisma.fbaSummary.count();
  console.log("Rows after:", after);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
