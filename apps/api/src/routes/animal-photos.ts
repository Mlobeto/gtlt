import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { notifyOwnersAndTamboVets } from "../lib/notifications.js";

export const animalPhotosRouter = Router({ mergeParams: true });

const typeSchema = z.enum(["PROFILE", "CONSULT"]);

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const createSchema = z.object({
  photoUrl: z.string().max(2000).url(),
  type: typeSchema,
  note: z.string().max(2000).optional(),
  healthEventId: z.string().uuid().optional().nullable(),
  takenAt: isoDateTime,
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  type: typeSchema.optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate clientMutationId");
  }
  throw err;
}

async function requireAnimalInTenant(tenantId: string, animalId: string) {
  const animal = await prisma.animal.findFirst({
    where: { id: animalId, tenantId, deletedAt: null },
  });
  if (!animal) {
    throw new HttpError(404, "Animal not found");
  }
  return animal;
}

animalPhotosRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const animalId = String(req.params.animalId);
  const animal = await requireAnimalInTenant(auth.tenantId, animalId);
  await requireTamboInTenant(auth, animal.tamboId);

  const items = await prisma.animalPhoto.findMany({
    where: {
      tenantId: auth.tenantId,
      animalId,
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
    },
    orderBy: { takenAt: "desc" },
    take: 100,
  });

  res.json({ items });
});

animalPhotosRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const animalId = String(req.params.animalId);
    const data = parsed.data;
    const animal = await requireAnimalInTenant(auth.tenantId, animalId);
    await requireTamboInTenant(auth, animal.tamboId);

    if (data.healthEventId) {
      const healthEvent = await prisma.healthEvent.findFirst({
        where: { id: data.healthEventId, tenantId: auth.tenantId, animalId, deletedAt: null },
      });
      if (!healthEvent) throw new HttpError(404, "Health event not found for this animal");
    }

    try {
      const item = await prisma.animalPhoto.create({
        data: {
          tenantId: auth.tenantId,
          tamboId: animal.tamboId,
          animalId,
          photoUrl: data.photoUrl,
          type: data.type,
          note: data.note,
          healthEventId: data.healthEventId ?? undefined,
          takenAt: new Date(data.takenAt),
          createdById: auth.userId,
          clientMutationId: data.clientMutationId,
        },
      });

      if (data.type === "CONSULT") {
        await notifyOwnersAndTamboVets(auth.tenantId, animal.tamboId, {
          type: "ANIMAL_PHOTO_CONSULT",
          title: "Nueva foto de consulta",
          body: `Se cargó una foto de consulta del animal ${animal.earTag}.`,
          payload: { animalId, photoId: item.id },
          excludeUserId: auth.userId,
        });
      }

      res.status(201).json({ item });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);

animalPhotosRouter.patch(
  "/:id/review",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const auth = req.auth!;
    const animalId = String(req.params.animalId);
    const photoId = String(req.params.id);
    const animal = await requireAnimalInTenant(auth.tenantId, animalId);
    await requireTamboInTenant(auth, animal.tamboId);

    const existing = await prisma.animalPhoto.findFirst({
      where: { id: photoId, tenantId: auth.tenantId, animalId },
    });
    if (!existing) throw new HttpError(404, "Photo not found");
    if (existing.type !== "CONSULT") {
      throw new HttpError(400, "Only CONSULT photos can be reviewed");
    }

    const item = await prisma.animalPhoto.update({
      where: { id: existing.id },
      data: { reviewedAt: new Date(), reviewedById: auth.userId },
    });

    res.json({ item });
  },
);
