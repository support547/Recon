import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.fbaSummary.findMany({
    where: {
      fnsku: "X0050F02FT",
    },
    orderBy: { summaryDate: "desc" },
    take: 5,
    select: {
      summaryDate: true,
      fnsku: true,
      startingBalance: true,
      endingBalance: true,
      unknownEvents: true,
      disposedQty: true,
      disposition: true,
      warehouseTransfer: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
