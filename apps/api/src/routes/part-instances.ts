import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { parseInstalledAt } from "../lib/part-date.js";
import { requireValidAttributes, serializePartTypeField, toFieldDef } from "../lib/part-attributes.js";
import { withPartLife } from "../lib/part-life-attach.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
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
  attributes: z.record(z.string(), z.unknown()).optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate part instance or clientMutationId");
  }
  throw err;
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

    try {
      const item = await prisma.partInstance.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          partTypeId: data.partTypeId,
          bajadaNumber: data.bajadaNumber ?? null,
          installedAt,
          installedAtApprox: data.installedAtApprox ?? false,
          brandModel: data.brandModel ?? null,
          photoUrl: data.photoUrl ?? null,
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
      mapPrismaError(err);
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

    const data = body.data;
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
            installedAt,
            installedAtApprox: data.installedAtApprox ?? false,
            brandModel: data.brandModel ?? null,
            photoUrl: data.photoUrl ?? null,
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
      mapPrismaError(err);
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
        ...(attributes !== undefined ? { attributes } : {}),
      },
      include: instanceInclude,
    });
    const [enriched] = await withPartLife(auth.tenantId, [item]);
    res.json({ item: serializeInstance(enriched) });
  },
);
