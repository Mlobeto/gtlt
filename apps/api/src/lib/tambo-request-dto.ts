import type { Prisma, TamboRequest } from "@prisma/client";

type DecimalLike = { toNumber(): number } | number | null;

function decimalToNumber(value: DecimalLike): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

const requestInclude = {
  serviceProvider: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  quotedBy: { select: { id: true, name: true, email: true } },
  tambo: { select: { id: true, name: true, active: true, activatedAt: true } },
  tenant: { select: { id: true, name: true } },
} satisfies Prisma.TamboRequestInclude;

export const tamboRequestInclude = requestInclude;

export type TamboRequestWithRelations = Prisma.TamboRequestGetPayload<{
  include: typeof requestInclude;
}>;

export function serializeTamboRequest(
  request: TamboRequest | TamboRequestWithRelations,
) {
  const extra = request as Partial<TamboRequestWithRelations>;
  return {
    id: request.id,
    tenantId: request.tenantId,
    requestedById: request.requestedById,
    name: request.name,
    address: request.address,
    bajadaCount: request.bajadaCount,
    hardware: request.hardware,
    equipmentList: request.equipmentList,
    serviceProviderId: request.serviceProviderId,
    notes: request.notes,
    status: request.status,
    quoteItems: request.quoteItems,
    quoteTotal: decimalToNumber(request.quoteTotal),
    quoteCurrency: request.quoteCurrency,
    quoteValidUntil: request.quoteValidUntil,
    quoteNotes: request.quoteNotes,
    quotedById: request.quotedById,
    quotedAt: request.quotedAt,
    rejectionReason: request.rejectionReason,
    tamboId: request.tamboId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    serviceProvider: extra.serviceProvider ?? undefined,
    requestedBy: extra.requestedBy ?? undefined,
    quotedBy: extra.quotedBy ?? undefined,
    tambo: extra.tambo ?? undefined,
    tenant: extra.tenant ?? undefined,
  };
}
