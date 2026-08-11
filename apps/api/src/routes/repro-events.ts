import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const reproEventsRouter = Router();

const typeSchema = z.enum([
  "HEAT",
  "SERVICE",
  "EXPECTED_CALVING",
  "CALVING",
  "ABORTION",
  "OTHER",
]);

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  animalId: z.string().uuid(),
  type: typeSchema,
  eventAt: isoDateTime,
  expectedCalvingAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  animalId: z.string().uuid().optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate clientMutationId");
  }
  throw err;
}

async function requireAnimalInTambo(
  tenantId: string,
  tamboId: string,
  animalId: string,
) {
  const animal = await prisma.animal.findFirst({
    where: { id: animalId, tenantId, tamboId, deletedAt: null },
  });
  if (!animal) {
    throw new HttpError(404, "Animal not found in this tambo");
  }
  return animal;
}

reproEventsRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, animalId } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.reproEvent.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      deletedAt: null,
      ...(animalId ? { animalId } : {}),
    },
    include: { animal: { select: { id: true, earTag: true } } },
    orderBy: { eventAt: "desc" },
    take: 100,
  });

  res.json({ items });
});

reproEventsRouter.post(
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
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);
    await requireAnimalInTambo(auth.tenantId, data.tamboId, data.animalId);

    try {
      const item = await prisma.reproEvent.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          animalId: data.animalId,
          type: data.type,
          eventAt: new Date(data.eventAt),
          expectedCalvingAt: data.expectedCalvingAt
            ? new Date(`${data.expectedCalvingAt}T00:00:00.000Z`)
            : null,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
        },
      });
      res.status(201).json({ item });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
