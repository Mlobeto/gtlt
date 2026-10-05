import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { parseInstalledAt, wholeDaysBetween } from "../lib/part-date.js";
import { optionalTenantPhotoUrl } from "../lib/photo-url.js";
import { requireValidAttributes, serializePartTypeField, toFieldDef } from "../lib/part-attributes.js";
import { lifeForInstance, loadPartLifeContext, withPartLife } from "../lib/part-life-attach.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import {
  autoReplaceSummary,
  farmAuthorRoleFromSession,
  invalidPartIds,
  replacePartsOnTx,
  reportInclude,
  serializeWorkReport,
} from "../lib/work-report-ops.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

const partTypeWithFields = {
  include: {
    fields: { where: { active: true }, orderBy: { sortOrder: "asc" as const } },
  },
};

const instanceInclude = {
  partType: partTypeWithFields,
  coldDetail: true,
};

function serializeInstance<T extends { partType: { fields: Parameters<typeof serializePartTypeField>[0][] } }>(
  item: T,
) {
  return {
    ...item,
    partType: {
      ...item.partType,
      fields: item.partType.fields.map(serializePartTypeField),
    },
  };
}

export const partInstancesRouter = Router();

const listSchema = z.object({
  tamboId: z.string().uuid(),
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  partTypeId: z.string().uuid(),
  bajadaNumber: z.number().int().positive().optional().nullable(),
  installedAt: z.string().min(1),
  installedAtApprox: z.boolean().optional().default(false),
  brandModel: z.string().max(200).optional().nullable(),
  photoUrl: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  clientMutationId: z.string().min(1).max(100).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  label: z.string().max(80).optional().nullable(),
  coldDetail: z
    .object({
      brand: z.string().min(1).max(120),
      model: z.string().min(1).max(120),
      capacityLiters: z.number().positive(),
      coolingCapacity: z.string().min(1).max(120),
      controllerModel: z.string().max(120).optional().nullable(),
    })
    .optional(),
});

const patchSchema = z.object({
  installedAt: z.string().min(1).optional(),
  installedAtApprox: z.boolean().optional(),
  brandModel: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().max(2000).optional().nullable(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  label: z.string().max(80).optional().nullable(),
});

function mapPrismaError(err: unknown, allowsMultiple = false): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = [
      ...(Array.isArray(err.meta?.target) ? err.meta.target.map(String) : []),
      String(err.meta?.target ?? ""),
      String(err.meta?.constraint ?? ""),
      err.message,
    ].join(" ").toLowerCase();
    if (target.includes("client_mutation") || target.includes("clientmutationid")) {
      throw new HttpError(409, "Conflict: duplicate clientMutationId");
    }
    if (allowsMultiple) {
      throw new HttpError(
        409,
        "Ya hay una pieza con ese nombre en este tipo",
        "DUPLICATE_PART_LABEL",
      );
    }
    throw new HttpError(
      409,
      "Ya hay una pieza vigente de este tipo en el tambo: usá Reemplazar",
      "DUPLICATE_PART_TYPE",
    );
  }
  throw err;
}

function resolveLabel(raw: unknown, allowsMultiple: boolean, inherited?: string | null): string | null {
  if (!allowsMultiple) {
    if (raw != null && String(raw).trim() !== "") {
      throw new HttpError(
        400,
        "Este tipo no lleva nombre: solo puede haber una pieza vigente en el tambo.",
      );
    }
    return null;
  }
  const source = raw !== undefined && raw !== null ? String(raw) : (inherited ?? "");
  const label = source.trim();
  if (label.length < 1 || label.length > 60) {
    throw new HttpError(400, "Completá el nombre o posición (1 a 60 caracteres).");
  }
  return label;
}

async function assertCreatablePartType(partTypeId: string) {
  const partType = await prisma.partType.findUnique({
    where: { id: partTypeId },
    include: { fields: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!partType) throw new HttpError(404, "Part type not found");
  if (!partType.active) {
    throw new HttpError(400, "Este tipo de pieza ya no se ofrece para cargas nuevas.");
  }
  return partType;
}

function validatedAttributes(
  partType: { fields: Parameters<typeof toFieldDef>[0][] },
  attributes: unknown,
) {
  return requireValidAttributes(partType.fields.map(toFieldDef), attributes ?? {});
}

/** Listado de equipo del tambo (vigentes por defecto). Acceso: farm + TECNICO. */
partInstancesRouter.get(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { tamboId, activeOnly } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    const items = await prisma.partInstance.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...(activeOnly ? { replacedAt: null } : {}),
      },
      include: instanceInclude,
      orderBy: [{ bajadaNumber: "asc" }, { installedAt: "desc" }],
    });

    const enriched = await withPartLife(auth.tenantId, items);
    res.json({ items: enriched.map(serializeInstance) });
  },
);

const historySchema = z.object({
  tamboId: z.string().uuid(),
  partTypeId: z.string().uuid(),
  bajadaNumber: z.coerce.number().int().positive().optional(),
  label: z.string().optional(),
});

/** Instalaciones anteriores (con replacedAt) del mismo tipo y posición. */
partInstancesRouter.get(
  "/history",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = historySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const { tamboId, partTypeId } = parsed.data;
    await requireTamboInTenant(auth, tamboId);
    const bajadaNumber = parsed.data.bajadaNumber ?? null;
    const labelNorm = (parsed.data.label ?? "").trim().toLowerCase();

    const rows = await prisma.partInstance.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        partTypeId,
        bajadaNumber,
        replacedAt: { not: null },
      },
      include: {
        partType: true,
        createdBy: { select: { id: true, name: true } },
        installedInReport: {
          select: { id: true, status: true, summary: true, performedAt: true, authorRole: true },
        },
      },
      orderBy: [{ replacedAt: "desc" }, { installedAt: "desc" }],
    });

    const previous = rows.filter(
      (row) => (row.label ?? "").trim().toLowerCase() === labelNorm,
    );

    const ctx = await loadPartLifeContext(auth.tenantId, [tamboId]);

    const items = previous.map((row) => {
      const replacedAt = row.replacedAt!;
      const daysInService = wholeDaysBetween(row.installedAt, replacedAt);
      const { life } = lifeForInstance(row, ctx, replacedAt);
      const estimatedMilkingsInService =
        life.kind === "USAGE_BASED" && life.byUsage ? life.byUsage.milkings : null;
      return {
        id: row.id,
        tamboId: row.tamboId,
        partTypeId: row.partTypeId,
        partTypeName: row.partType.name,
        bajadaNumber: row.bajadaNumber,
        label: row.label,
        installedAt: row.installedAt.toISOString(),
        installedAtApprox: row.installedAtApprox,
        replacedAt: replacedAt.toISOString(),
        daysInService,
        estimatedMilkingsInService,
        estimatedMilkingsNote:
          estimatedMilkingsInService != null
            ? "Usa la cantidad actual de vacas del tambo."
            : null,
        createdBy: row.createdBy,
        installedInReport: row.installedInReport
          ? {
              id: row.installedInReport.id,
              status: row.installedInReport.status,
              summary: row.installedInReport.summary,
              performedAt: row.installedInReport.performedAt.toISOString(),
              authorRole: row.installedInReport.authorRole,
            }
          : null,
      };
    });

    res.json({ items });
  },
);

const replaceBatchSchema = z.object({
  instanceIds: z.array(z.string().uuid()).min(1).max(50),
  installedAt: z.string().min(1),
  installedAtApprox: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Atajo "Ya las cambié": informe propio + reemplazo + envío, en una transacción de negocio. */
partInstancesRouter.post(
  "/replace-batch",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = replaceBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const uniqueIds = [...new Set(parsed.data.instanceIds)];
    const found = await prisma.partInstance.findMany({
      where: {
        id: { in: uniqueIds },
        tenantId: auth.tenantId,
        replacedAt: null,
      },
      include: { partType: { select: { name: true } } },
    });
    const tamboIds = [...new Set(found.map((p) => p.tamboId))];
    const tamboId = tamboIds[0];
    const invalidIds =
      !tamboId || tamboIds.length !== 1
        ? uniqueIds
        : invalidPartIds(uniqueIds, found, tamboId, auth.tenantId);
    if (!tamboId || invalidIds.length > 0) {
      throw new HttpError(
        400,
        "Hay piezas que no se pueden cambiar. No se modificó ninguna.",
        "INVALID_PART_INSTANCES",
        { invalidIds: invalidIds.length ? invalidIds : uniqueIds },
      );
    }
    await requireTamboInTenant(auth, tamboId);

    const installedAt = parseInstalledAt(parsed.data.installedAt);
    const authorRole = farmAuthorRoleFromSession(auth.roles);
    const summary = autoReplaceSummary(found);
    const foundById = new Map(found.map((p) => [p.id, p]));

    const { report, created } = await prisma.$transaction(async (tx) => {
      const report = await tx.workReport.create({
        data: {
          tenantId: auth.tenantId,
          tamboId,
          authorId: auth.userId,
          authorRole,
          performedAt: installedAt,
          summary,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });
      const created = await replacePartsOnTx(tx, {
        auth,
        reportId: report.id,
        foundById,
        uniqueIds,
        installedAt,
        installedAtApprox: parsed.data.installedAtApprox,
        notes: parsed.data.notes,
      });
      return { report, created };
    });

    const item = await prisma.workReport.findFirstOrThrow({
      where: { id: report.id },
      include: reportInclude,
    });
    const parts = await withPartLife(auth.tenantId, created);
    res.status(201).json({ item: serializeWorkReport(item), parts });
  },
);

partInstancesRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    const tambo = await requireTamboInTenant(auth, data.tamboId);
    const partType = await assertCreatablePartType(data.partTypeId);
    const attributes = validatedAttributes(partType, data.attributes);
    const installedAt = parseInstalledAt(data.installedAt);

    if (partType.appliesPerBajada) {
      if (data.bajadaNumber == null) {
        throw new HttpError(400, "bajadaNumber required for this part type");
      }
      if (data.bajadaNumber < 1 || data.bajadaNumber > tambo.bajadaCount) {
        throw new HttpError(400, "bajadaNumber out of range for this tambo");
      }
    } else if (data.bajadaNumber != null) {
      throw new HttpError(400, "bajadaNumber must be null for this part type");
    }

    const label = resolveLabel(data.label, partType.allowsMultiple);
    const photoUrl = optionalTenantPhotoUrl(data.photoUrl ?? null, auth.tenantId) ?? null;

    try {
      const item = await prisma.partInstance.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          partTypeId: data.partTypeId,
          bajadaNumber: data.bajadaNumber ?? null,
          label,
          installedAt,
          installedAtApprox: data.installedAtApprox ?? false,
          brandModel: data.brandModel ?? null,
          photoUrl,
          notes: data.notes ?? null,
          attributes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
        },
        include: instanceInclude,
      });
      const [enriched] = await withPartLife(auth.tenantId, [item]);
      res.status(201).json({ item: serializeInstance(enriched) });
    } catch (err) {
      mapPrismaError(err, partType.allowsMultiple);
    }
  },
);

/** Reemplazo: marca replacedAt y crea instancia nueva. */
partInstancesRouter.post(
  "/:id/replace",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const bodySchema = createSchema.omit({ tamboId: true });
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const previous = await prisma.partInstance.findFirst({
      where: {
        id: String(req.params.id),
        tenantId: auth.tenantId,
        replacedAt: null,
      },
    });
    if (!previous) throw new HttpError(404, "Active part instance not found");
    await requireTamboInTenant(auth, previous.tamboId);
    const partType = await assertCreatablePartType(body.data.partTypeId);
    const attributes = validatedAttributes(partType, body.data.attributes);
    const installedAt = parseInstalledAt(body.data.installedAt);
    const label = resolveLabel(
      body.data.label,
      partType.allowsMultiple,
      previous.label,
    );

    const data = body.data;
    const photoUrl = optionalTenantPhotoUrl(data.photoUrl ?? null, auth.tenantId) ?? null;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const voided = await tx.partInstance.update({
          where: { id: previous.id },
          data: { replacedAt: new Date() },
        });
        const created = await tx.partInstance.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            tenantId: auth.tenantId,
            tamboId: previous.tamboId,
            partTypeId: data.partTypeId,
            bajadaNumber: data.bajadaNumber ?? previous.bajadaNumber,
            label,
            installedAt,
            installedAtApprox: data.installedAtApprox ?? false,
            brandModel: data.brandModel ?? null,
            photoUrl,
            notes: data.notes ?? null,
            attributes,
            clientMutationId: data.clientMutationId,
            createdById: auth.userId,
          },
          include: instanceInclude,
        });
        return { previous: voided, item: created };
      });
      const [item] = await withPartLife(auth.tenantId, [result.item]);
      res.status(201).json({ previous: result.previous, item: serializeInstance(item) });
    } catch (err) {
      mapPrismaError(err, partType.allowsMultiple);
    }
  },
);

partInstancesRouter.patch(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const existing = await prisma.partInstance.findFirst({
      where: {
        id: String(req.params.id),
        tenantId: auth.tenantId,
        replacedAt: null,
      },
      include: { partType: { include: { fields: { where: { active: true } } } } },
    });
    if (!existing) throw new HttpError(404, "Active part instance not found");
    await requireTamboInTenant(auth, existing.tamboId);

    const attributes =
      parsed.data.attributes !== undefined
        ? validatedAttributes(existing.partType, parsed.data.attributes)
        : undefined;
    const label =
      parsed.data.label !== undefined
        ? resolveLabel(parsed.data.label, existing.partType.allowsMultiple)
        : undefined;

    try {
    const item = await prisma.partInstance.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.installedAt != null
          ? { installedAt: parseInstalledAt(parsed.data.installedAt) }
          : {}),
        ...(parsed.data.installedAtApprox != null
          ? { installedAtApprox: parsed.data.installedAtApprox }
          : {}),
        ...(parsed.data.brandModel !== undefined ? { brandModel: parsed.data.brandModel } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.photoUrl !== undefined
          ? { photoUrl: optionalTenantPhotoUrl(parsed.data.photoUrl, auth.tenantId) ?? null }
          : {}),
        ...(attributes !== undefined ? { attributes } : {}),
        ...(label !== undefined ? { label } : {}),
      },
      include: instanceInclude,
    });
    const [enriched] = await withPartLife(auth.tenantId, [item]);
    res.json({ item: serializeInstance(enriched) });
    } catch (err) {
      mapPrismaError(err, existing.partType.allowsMultiple);
    }
  },
);
