import { prisma } from "./prisma.js";
import { fetchOficialUsdArsRate } from "./exchange-rate.js";

export interface PlanPriceSyncResult {
  updated: number;
  rate: number | null;
}

/**
 * Recalcula `priceArs` de todos los planes con `priceUsd` definido, usando el
 * dólar oficial (venta). Planes sin `priceUsd` (ej. LIFETIME) no se tocan.
 */
export async function syncPlanPricesFromUsd(): Promise<PlanPriceSyncResult> {
  const plans = await prisma.plan.findMany({ where: { priceUsd: { not: null } } });
  if (plans.length === 0) {
    return { updated: 0, rate: null };
  }

  const { venta } = await fetchOficialUsdArsRate();

  await Promise.all(
    plans.map((plan) =>
      prisma.plan.update({
        where: { id: plan.id },
        data: {
          priceArs: Math.round(Number(plan.priceUsd) * venta),
          fxRate: venta,
          fxRateSource: "OFICIAL",
          priceArsUpdatedAt: new Date(),
        },
      }),
    ),
  );

  return { updated: plans.length, rate: venta };
}
