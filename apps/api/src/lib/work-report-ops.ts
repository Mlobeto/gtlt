import { Prisma, type Role, type WorkReport } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import { parseInstalledAt } from "./part-date.js";
import { withPartLife } from "./part-life-attach.js";
import type { AuthContext } from "../types/express.js";

export const REPORT_SERVICE_STATUSES = ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const;

export type AuthorRole = "TECNICO" | "TAMBERO" | "DUENIO" | "ADMIN";

const FARM_ROLES = new Set(["TAMBERO", "DUENIO", "ADMIN"]);

export function isTecnicoOnly(auth: AuthContext) {
  return auth.roles.includes("TECNICO") && !auth.roles.some((r) => FARM_ROLES.has(r));
}

export function technicianProviderWhere(auth: AuthContext) {
  if (!isTecnicoOnly(auth) || !auth.serviceProviderId) return {};
  return { serviceProviderId: auth.serviceProviderId };
}

export function isFarmManager(roles: Role[]) {
  return roles.includes("DUENIO") || roles.includes("ADMIN");
}

/** Rol con el que se escribe el informe. TECNICO gana si la sesión lo tiene. */
export function authorRoleFromSession(roles: Role[]): AuthorRole {
  if (roles.includes("TECNICO")) return "TECNICO";
  if (roles.includes("TAMBERO")) return "TAMBERO";
  if (roles.includes("DUENIO")) return "DUENIO";
  if (roles.includes("ADMIN")) return "ADMIN";
  throw new HttpError(403, "Este rol no puede registrar un informe de trabajo.");
}

/** Atajo "Ya las cambié": nunca queda como TECNICO (no hay pedido). */
export function farmAuthorRoleFromSession(roles: Role[]): Exclude<AuthorRole, "TECNICO"> {
  if (roles.includes("TAMBERO")) return "TAMBERO";
  if (roles.includes("DUENIO")) return "DUENIO";
  if (roles.includes("ADMIN")) return "ADMIN";
  throw new HttpError(403, "Este rol no puede usar el atajo de cambio de piezas.");
}

export type Measurement = { label: string; value: string; unit?: string };

export function asStringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function asMeasurements(value: Prisma.JsonValue | null | undefined): Measurement[] {
  if (!Array.isArray(value)) return [];
  const out: Measurement[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const label = typeof rec.label === "string" ? rec.label : "";
    const unit = typeof rec.unit === "string" && rec.unit.trim() ? rec.unit : undefined;
    const val =
      typeof rec.value === "string"
        ? rec.value
        : typeof rec.value === "number"
          ? String(rec.value)
          : "";
    if (!label || !val) continue;
    out.push(unit ? { label, value: val, unit } : { label, value: val });
  }
  return out;
}

const partInclude = {
  partType: {
    include: {
      fields: { where: { active: true }, orderBy: { sortOrder: "asc" as const } },
    },
  },
  coldDetail: true,
};

export const reportInclude = {
  author: { select: { id: true, name: true } },
  tambo: { select: { id: true, name: true } },
  serviceRequest: {
    select: { id: true, category: true, status: true, description: true },
  },
  installedParts: {
    include: { partType: { select: { id: true, name: true, code: true } } },
    orderBy: [{ bajadaNumber: "asc" as const }, { createdAt: "asc" as const }],
  },
};

export function serializeWorkReport(
  report: WorkReport & {
    author?: { id: string; name: string };
    tambo?: { id: string; name: string };
    serviceRequest?: {
      id: string;
      category: string;
      status: string;
      description: string;
    } | null;
    installedParts?: {
      id: string;
      bajadaNumber: number | null;
      label: string | null;
      installedAt: Date;
      partType: { id: string; name: string; code: string };
    }[];
    _count?: { installedParts: number };
  },
) {
  const replacedParts = (report.installedParts ?? []).map((p) => ({
    id: p.id,
    partTypeId: p.partType.id,
    partTypeName: p.partType.name,
    bajadaNumber: p.bajadaNumber,
    label: p.label,
    installedAt: p.installedAt.toISOString(),
  }));
  return {
    id: report.id,
    tenantId: report.tenantId,
    tamboId: report.tamboId,
    tambo: report.tambo ?? null,
    serviceRequestId: report.serviceRequestId,
    serviceRequest: report.serviceRequest ?? null,
    authorId: report.authorId,
    authorRole: report.authorRole,
    author: report.author ?? null,
    performedAt: report.performedAt.toISOString(),
    summary: report.summary,
    tasks: asStringList(report.tasks),
    hoursWorked: report.hoursWorked == null ? null : Number(report.hoursWorked),
    measurements: asMeasurements(report.measurements),
    photoUrls: report.photoUrls,
    status: report.status,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    replacedPartsCount: report._count?.installedParts ?? replacedParts.length,
    replacedParts,
  };
}

export async function assertServiceRequestForReport(
  auth: AuthContext,
  tamboId: string,
  serviceRequestId: string,
) {
  const item = await prisma.serviceRequest.findFirst({
    where: {
      id: serviceRequestId,
      tenantId: auth.tenantId,
      tamboId,
      ...technicianProviderWhere(auth),
    },
  });
  if (!item) {
    throw new HttpError(400, "No se encontró un pedido de service válido para este informe.");
  }
  if (
    !REPORT_SERVICE_STATUSES.includes(
      item.status as (typeof REPORT_SERVICE_STATUSES)[number],
    )
  ) {
    throw new HttpError(
      400,
      "El informe del técnico solo se puede ligar a un pedido visto, en curso o resuelto.",
    );
  }
  return item;
}

type Tx = Prisma.TransactionClient;

export function invalidPartIds(
  uniqueIds: string[],
  found: { id: string; tamboId: string; tenantId: string }[],
  tamboId: string,
  tenantId: string,
) {
  const foundById = new Map(found.map((p) => [p.id, p]));
  return uniqueIds.filter((id) => {
    const part = foundById.get(id);
    if (!part) return true;
    if (part.tamboId !== tamboId) return true;
    if (part.tenantId !== tenantId) return true;
    return false;
  });
}

export async function replacePartsOnTx(
  tx: Tx,
  input: {
    auth: AuthContext;
    reportId: string;
    foundById: Map<
      string,
      {
        id: string;
        tamboId: string;
        partTypeId: string;
        bajadaNumber: number | null;
        label: string | null;
        brandModel: string | null;
        attributes: Prisma.JsonValue;
      }
    >;
    uniqueIds: string[];
    installedAt: Date;
    installedAtApprox?: boolean;
    notes?: string | null;
  },
) {
  const items = [];
  for (const id of input.uniqueIds) {
    const previous = input.foundById.get(id)!;
    await tx.partInstance.update({
      where: { id: previous.id },
      data: { replacedAt: new Date() },
    });
    const createdItem = await tx.partInstance.create({
      data: {
        tenantId: input.auth.tenantId,
        tamboId: previous.tamboId,
        partTypeId: previous.partTypeId,
        bajadaNumber: previous.bajadaNumber,
        label: previous.label,
        installedAt: input.installedAt,
        installedAtApprox: input.installedAtApprox ?? false,
        brandModel: previous.brandModel,
        photoUrl: null,
        notes: input.notes ?? null,
        attributes: previous.attributes as Prisma.InputJsonValue,
        createdById: input.auth.userId,
        installedInReportId: input.reportId,
      },
      include: partInclude,
    });
    items.push(createdItem);
  }
  return items;
}

export async function replacePartsInReport(input: {
  auth: AuthContext;
  reportId: string;
  tamboId: string;
  instanceIds: string[];
  installedAt: string;
  installedAtApprox?: boolean;
  notes?: string | null;
}) {
  const uniqueIds = [...new Set(input.instanceIds)];
  if (uniqueIds.length < 1 || uniqueIds.length > 50) {
    throw new HttpError(400, "Elegí entre 1 y 50 piezas para cambiar.");
  }
  const installedAt = parseInstalledAt(input.installedAt);

  const found = await prisma.partInstance.findMany({
    where: {
      id: { in: uniqueIds },
      tenantId: input.auth.tenantId,
      replacedAt: null,
    },
  });
  const invalidIds = invalidPartIds(uniqueIds, found, input.tamboId, input.auth.tenantId);
  if (invalidIds.length > 0) {
    throw new HttpError(
      400,
      "Hay piezas que no se pueden cambiar. No se modificó ninguna.",
      "INVALID_PART_INSTANCES",
      { invalidIds },
    );
  }
  const foundById = new Map(found.map((p) => [p.id, p]));

  const created = await prisma.$transaction((tx) =>
    replacePartsOnTx(tx, {
      auth: input.auth,
      reportId: input.reportId,
      foundById,
      uniqueIds,
      installedAt,
      installedAtApprox: input.installedAtApprox,
      notes: input.notes,
    }),
  );

  return withPartLife(input.auth.tenantId, created);
}

export function autoReplaceSummary(
  parts: { partType: { name: string } }[],
): string {
  const names = [...new Set(parts.map((p) => p.partType.name))];
  const tipos = names.join(", ");
  return `Cambio de ${parts.length} piezas: ${tipos}`;
}

export function workReportListSummary(reports: {
  id: string;
  status: string;
  _count: { installedParts: number };
}[]) {
  if (reports.length === 0) return null;
  const submitted = reports.find((r) => r.status === "SUBMITTED");
  const pick = submitted ?? reports[0];
  return {
    id: pick.id,
    status: pick.status,
    replacedPartsCount: pick._count.installedParts,
  };
}

export const workReportOnServiceSelect = {
  select: {
    id: true,
    status: true,
    authorId: true,
    updatedAt: true,
    _count: { select: { installedParts: true } },
  },
  orderBy: { updatedAt: "desc" as const },
};
