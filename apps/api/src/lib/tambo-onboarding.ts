import { Prisma, type DeviceKind } from "@prisma/client";
import { z } from "zod";
import { computeHardwareBudget } from "./hardware-budget.js";
import { HttpError } from "./http-error.js";
import { hasHardware, parseHardware } from "./tambo-equipment.js";
import {
  assertPartnerProvider,
  openServiceProviderPeriod,
} from "./service-provider-periods.js";

export const tamboOnboardingSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  bajadaCount: z.number().int().min(1).max(60),
  powerSupply: z.enum(["MONOPHASE", "THREEPHASE"]).optional().nullable(),
  pumpCount: z.number().int().min(1).max(10).optional(),
  defaultServiceProviderId: z.string().uuid(),
  equipmentProductIds: z.array(z.string().uuid()),
});

export type TamboOnboardingInput = z.infer<typeof tamboOnboardingSchema>;

export type PlannedEquipmentItem = {
  productId: string;
  code: string;
  name: string;
  deviceKind: DeviceKind | null;
  quantity: number;
  unitPrice: number | null;
  currency: string;
};

type Db = Prisma.TransactionClient;

export async function resolvePlannedEquipment(
  db: Db,
  input: TamboOnboardingInput,
) {
  const ids = input.equipmentProductIds;
  const pumpCount = input.pumpCount ?? 1;
  if (ids.length > 0 && !input.powerSupply) {
    throw new HttpError(400, "La corriente eléctrica es obligatoria si hay equipos.");
  }

  if (ids.length === 0) {
    return {
      plannedEquipment: [] as PlannedEquipmentItem[],
      budget: computeHardwareBudget({
        products: [],
        selectedProductIds: [],
        bajadaCount: input.bajadaCount,
        pumpCount,
      }),
      pumpCount,
    };
  }

  const products = await db.hardwareProduct.findMany({
    where: { id: { in: ids } },
  });
  if (products.length !== ids.length) {
    throw new HttpError(400, "Hay equipos que no existen o están inactivos.");
  }
  if (products.some((p) => !p.active)) {
    throw new HttpError(400, "Hay equipos que no existen o están inactivos.");
  }

  const budget = computeHardwareBudget({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      quantityRule: p.quantityRule,
      fixedQuantity: p.fixedQuantity,
      unitPrice: p.unitPrice,
      currency: p.currency,
      active: p.active,
    })),
    selectedProductIds: ids,
    bajadaCount: input.bajadaCount,
    pumpCount,
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const plannedEquipment: PlannedEquipmentItem[] = budget.lines.map((line) => {
    const product = byId.get(line.productId)!;
    return {
      productId: product.id,
      code: product.code,
      name: product.name,
      deviceKind: product.deviceKind,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      currency: line.currency,
    };
  });

  return { plannedEquipment, budget, pumpCount };
}

export async function createOnboardedTambo(
  db: Db,
  input: {
    tenantId: string;
    tambo: TamboOnboardingInput;
    startedById: string;
    requestId?: string;
  },
) {
  const provider = await assertPartnerProvider(db, input.tambo.defaultServiceProviderId);
  const resolved = await resolvePlannedEquipment(db, input.tambo);
  const now = new Date();
  const installing = input.tambo.equipmentProductIds.length > 0;

  if (input.requestId) {
    const request = await db.tamboRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new HttpError(404, "Pedido no encontrado");
    if (request.tenantId !== input.tenantId) {
      throw new HttpError(400, "El pedido no pertenece a esta cuenta.");
    }
    if (request.tamboId || request.status === "CONVERTED") {
      throw new HttpError(409, "Este pedido ya fue convertido en tambo.");
    }
    const hardware = parseHardware(request.hardware);
    const softwareOnly = !hardware || !hasHardware(hardware);
    const allowed =
      request.status === "ACCEPTED" || (request.status === "SENT" && softwareOnly);
    if (!allowed) {
      throw new HttpError(
        409,
        softwareOnly
          ? "Un pedido solo-software se convierte desde enviado o aceptado."
          : "Solo se puede crear el tambo de un pedido aceptado.",
      );
    }
  }

  const tambo = await db.tambo.create({
    data: {
      tenantId: input.tenantId,
      name: input.tambo.name ?? "Tambo",
      bajadaCount: input.tambo.bajadaCount,
      powerSupply: input.tambo.powerSupply ?? null,
      pumpCount: resolved.pumpCount,
      defaultServiceProviderId: provider.id,
      plannedEquipment: resolved.plannedEquipment as Prisma.InputJsonValue,
      active: true,
      activatedAt: installing ? null : now,
    },
  });

  await openServiceProviderPeriod(db, {
    tamboId: tambo.id,
    serviceProviderId: provider.id,
    startedAt: now,
    startedById: input.startedById,
  });

  if (input.requestId) {
    await db.tamboRequest.update({
      where: { id: input.requestId },
      data: { status: "CONVERTED", tamboId: tambo.id },
    });
  }

  return { tambo, budget: resolved.budget, installing };
}

export type InstallationProgress = {
  deviceKind: DeviceKind;
  name: string;
  planned: number;
  installed: number;
  missing: number;
};

export function installationProgress(
  plannedEquipment: unknown,
  devices: { kind: DeviceKind; retiredAt?: Date | null }[],
): InstallationProgress[] {
  const items = Array.isArray(plannedEquipment) ? plannedEquipment : [];
  const plannedByKind = new Map<DeviceKind, { name: string; planned: number }>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { deviceKind?: DeviceKind | null; name?: string; quantity?: number };
    if (!row.deviceKind) continue;
    const prev = plannedByKind.get(row.deviceKind);
    const quantity = typeof row.quantity === "number" ? row.quantity : 0;
    plannedByKind.set(row.deviceKind, {
      name: prev?.name ?? row.name ?? row.deviceKind,
      planned: (prev?.planned ?? 0) + quantity,
    });
  }

  const installedByKind = new Map<DeviceKind, number>();
  for (const device of devices) {
    if (device.retiredAt) continue;
    installedByKind.set(device.kind, (installedByKind.get(device.kind) ?? 0) + 1);
  }

  return [...plannedByKind.entries()].map(([deviceKind, info]) => {
    const installed = installedByKind.get(deviceKind) ?? 0;
    return {
      deviceKind,
      name: info.name,
      planned: info.planned,
      installed,
      missing: Math.max(0, info.planned - installed),
    };
  });
}
