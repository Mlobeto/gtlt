import type { Prisma, ServiceProvider } from "@prisma/client";
import { HttpError } from "./http-error.js";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

export type VisibleProvider = Pick<
  ServiceProvider,
  | "id"
  | "name"
  | "active"
  | "tenantId"
  | "hasPanel"
  | "contactName"
  | "contactPhone"
  | "isDefault"
>;

export function visibleProvidersWhere(tenantId: string): Prisma.ServiceProviderWhereInput {
  return {
    active: true,
    OR: [{ tenantId: null }, { tenantId }],
  };
}

export function isPrivateProvider(p: { tenantId: string | null }) {
  return p.tenantId != null;
}

/** Socias: sin teléfono ni contacto. Privadas propias: sí. */
export function serializeVisibleProvider(
  p: VisibleProvider,
  defaultForTamboId?: string | null,
) {
  const isPrivate = isPrivateProvider(p);
  return {
    id: p.id,
    name: p.name,
    active: p.active,
    isPrivate,
    hasPanel: p.hasPanel,
    isDefaultForTambo: defaultForTamboId != null && p.id === defaultForTamboId,
    ...(isPrivate
      ? { contactName: p.contactName, contactPhone: p.contactPhone }
      : {}),
  };
}

export function serializeRequestProvider(
  p: {
    id: string;
    name: string;
    tenantId: string | null;
    hasPanel: boolean;
    contactPhone: string | null;
  } | null,
) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    isPrivate: isPrivateProvider(p),
    hasPanel: p.hasPanel,
    hasPhone: Boolean(p.contactPhone),
  };
}

export const requestProviderSelect = {
  id: true,
  name: true,
  tenantId: true,
  hasPanel: true,
  contactPhone: true,
} as const;

export async function listVisibleProviders(db: Db, tenantId: string) {
  return db.serviceProvider.findMany({
    where: visibleProvidersWhere(tenantId),
    orderBy: [{ tenantId: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });
}

export async function assertVisibleActiveProvider(
  db: Db,
  tenantId: string,
  serviceProviderId: string,
) {
  const provider = await db.serviceProvider.findUnique({
    where: { id: serviceProviderId },
  });
  if (!provider) {
    throw new HttpError(400, "El proveedor no está disponible para esta cuenta.");
  }
  const visible = provider.tenantId == null || provider.tenantId === tenantId;
  if (!visible || !provider.active) {
    throw new HttpError(400, "El proveedor no está disponible para esta cuenta.");
  }
  return provider;
}
