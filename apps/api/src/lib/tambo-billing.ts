import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import { billableTamboWhere, installingTamboWhere } from "./tambo-state.js";

export type BillingSummary = {
  activeTambos: number;
  installingTambos: number;
  unitPriceArs: number;
  monthlyTotalArs: number;
  nextTotalArs: number;
  planName: string;
  courtesy: boolean;
};

export async function assertSubscriptionActive(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!subscription || subscription.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "La suscripción no está al día. No se pueden agregar ni restaurar tambos.",
    );
  }
  return subscription;
}

export async function getBillingSummary(tenantId: string): Promise<BillingSummary> {
  const [activeTambos, installingTambos, subscription] = await Promise.all([
    prisma.tambo.count({ where: { tenantId, ...billableTamboWhere } }),
    prisma.tambo.count({ where: { tenantId, ...installingTamboWhere } }),
    prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    }),
  ]);

  const plan = subscription?.plan;
  const courtesy = !plan || plan.code === "LIFETIME" || plan.priceArs === 0;
  const unitPriceArs = courtesy ? 0 : plan.priceArs;

  return {
    activeTambos,
    installingTambos,
    unitPriceArs,
    monthlyTotalArs: unitPriceArs * activeTambos,
    nextTotalArs: unitPriceArs * (activeTambos + 1),
    planName: plan?.name ?? "",
    courtesy,
  };
}
