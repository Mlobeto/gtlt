import { prisma } from "../lib/prisma.js";
import { syncPlanPricesFromUsd } from "../lib/plan-pricing.js";

async function main() {
  const { updated, rate } = await syncPlanPricesFromUsd();
  if (updated === 0) {
    console.log("No hay planes con priceUsd definido; nada para actualizar.");
    return;
  }
  console.log(`Planes actualizados: ${updated}. Dólar oficial venta: $${rate}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
