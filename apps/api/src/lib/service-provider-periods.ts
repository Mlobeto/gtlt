import type { Prisma } from "@prisma/client";
import { HttpError } from "./http-error.js";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

export async function assertPartnerProvider(db: Db, serviceProviderId: string) {
  const provider = await db.serviceProvider.findUnique({
    where: { id: serviceProviderId },
  });
  if (!provider) {
    throw new HttpError(404, "Proveedor no encontrado");
  }
  if (!provider.active || provider.tenantId != null) {
    throw new HttpError(
      400,
      "El proveedor predeterminado tiene que ser una empresa socia activa.",
    );
  }
  return provider;
}

export async function openServiceProviderPeriod(
  db: Db,
  input: {
    tamboId: string;
    serviceProviderId: string;
    startedAt: Date;
    startedById?: string | null;
  },
) {
  return db.tamboServiceProviderPeriod.create({
    data: {
      tamboId: input.tamboId,
      serviceProviderId: input.serviceProviderId,
      startedAt: input.startedAt,
      startedById: input.startedById ?? null,
    },
  });
}

export async function changeDefaultServiceProvider(
  db: Db,
  input: {
    tamboId: string;
    serviceProviderId: string;
    startedById?: string | null;
  },
) {
  const provider = await assertPartnerProvider(db, input.serviceProviderId);
  const tambo = await db.tambo.findUnique({ where: { id: input.tamboId } });
  if (!tambo) throw new HttpError(404, "Tambo not found");
  if (tambo.defaultServiceProviderId === provider.id) {
    return tambo;
  }

  const now = new Date();
  await db.tamboServiceProviderPeriod.updateMany({
    where: { tamboId: tambo.id, endedAt: null },
    data: { endedAt: now },
  });
  await openServiceProviderPeriod(db, {
    tamboId: tambo.id,
    serviceProviderId: provider.id,
    startedAt: now,
    startedById: input.startedById,
  });
  return db.tambo.update({
    where: { id: tambo.id },
    data: { defaultServiceProviderId: provider.id },
  });
}
