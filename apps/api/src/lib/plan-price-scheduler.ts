import { syncPlanPricesFromUsd } from "./plan-pricing.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Corre la sincronización de precios (USD → ARS, dólar oficial) al iniciar y luego 1 vez por día. */
export function startPlanPriceScheduler(): void {
  const run = async () => {
    try {
      const { updated, rate } = await syncPlanPricesFromUsd();
      if (updated > 0) {
        console.log(`[plan-pricing] ${updated} plan(es) actualizados. Dólar oficial venta: $${rate}`);
      }
    } catch (err) {
      console.error("[plan-pricing] Error actualizando precios:", err instanceof Error ? err.message : err);
    }
  };

  void run();
  setInterval(run, ONE_DAY_MS);
}
