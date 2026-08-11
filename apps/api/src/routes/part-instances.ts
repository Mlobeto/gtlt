import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

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
  brandModel: z.string().max(200).optional().nullable(),
  photoUrl: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  clientMutationId: z.string().min(1).max(100).optional(),
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

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate part instance or clientMutationId");
  }
  throw err;
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
      include: {
        partType: true,
        coldDetail: true,
      },
      orderBy: [{ bajadaNumber: "asc" }, { installedAt: "desc" }],
    });

    res.json({ items });
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

    const partType = await prisma.partType.findUnique({
      where: { id: data.partTypeId },
    });
    if (!partType) throw new HttpError(404, "Part type not found");

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
          installedAt: new Date(data.installedAt),
          brandModel: data.brandModel ?? null,
          photoUrl: data.photoUrl ?? null,
          notes: data.notes ?? null,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
          ...(data.coldDetail
            ? {
                coldDetail: {
                  create: {
                    brand: data.coldDetail.brand,
                    model: data.coldDetail.model,
                    capacityLiters: data.coldDetail.capacityLiters,
                    coolingCapacity: data.coldDetail.coolingCapacity,
                    controllerModel: data.coldDetail.controllerModel ?? null,
                  },
                },
              }
            : {}),
        },
        include: { partType: true, coldDetail: true },
      });
      res.status(201).json({ item });
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
            installedAt: new Date(data.installedAt),
            brandModel: data.brandModel ?? null,
            photoUrl: data.photoUrl ?? null,
            notes: data.notes ?? null,
            clientMutationId: data.clientMutationId,
            createdById: auth.userId,
            ...(data.coldDetail
              ? {
                  coldDetail: {
                    create: {
                      brand: data.coldDetail.brand,
                      model: data.coldDetail.model,
                      capacityLiters: data.coldDetail.capacityLiters,
                      coolingCapacity: data.coldDetail.coolingCapacity,
                      controllerModel: data.coldDetail.controllerModel ?? null,
                    },
                  },
                }
              : {}),
          },
          include: { partType: true, coldDetail: true },
        });
        return { previous: voided, item: created };
      });
      res.status(201).json(result);
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
