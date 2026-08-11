import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const healthEventsRouter = Router();

const typeSchema = z.enum(["MASTITIS", "TREATMENT", "OTHER"]);

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  animalId: z.string().uuid(),
  type: typeSchema,
  eventAt: isoDateTime,
  productName: z.string().trim().max(200).optional(),
  milkWithdrawalUntil: isoDateTime.optional().nullable(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  animalId: z.string().uuid().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

const withdrawalsSchema = z.object({
  tamboId: z.string().uuid(),
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
    where: {
      id: animalId,
      tenantId,
      tamboId,
      deletedAt: null,
    },
  });
  if (!animal) {
    throw new HttpError(404, "Animal not found in this tambo");
  }
  return animal;
}

/**
 * Retiros de leche vigentes — dataset chico para cache offline del tambero.
 * milkWithdrawalUntil >= now, no borrados.
 */
healthEventsRouter.get(
  "/active-withdrawals",
  authenticate,
  async (req, res) => {
    const parsed = withdrawalsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { tamboId } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    const now = new Date();
    const items = await prisma.healthEvent.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        deletedAt: null,
        milkWithdrawalUntil: { gte: now },
      },
      include: {
        animal: { select: { id: true, earTag: true, status: true } },
      },
      orderBy: { milkWithdrawalUntil: "asc" },
    });

    res.json({ items, asOf: now.toISOString() });
  },
);

healthEventsRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, animalId, from, to } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.healthEvent.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      deletedAt: null,
      ...(animalId ? { animalId } : {}),
      ...(from || to
        ? {
            eventAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      animal: { select: { id: true, earTag: true } },
    },
    orderBy: { eventAt: "desc" },
    take: 200,
  });

  res.json({ items });
});

healthEventsRouter.post(
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
      const item = await prisma.healthEvent.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          animalId: data.animalId,
          type: data.type,
          eventAt: new Date(data.eventAt),
          productName: data.productName,
          milkWithdrawalUntil: data.milkWithdrawalUntil
            ? new Date(data.milkWithdrawalUntil)
            : null,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
        },
        include: {
          animal: { select: { id: true, earTag: true } },
        },
      });
      res.status(201).json({ item });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);

/** Soft-delete (no hard delete) — historial queda para sync/auditoría. */
healthEventsRouter.delete(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const auth = req.auth!;
    const eventId = String(req.params.id);
    const existing = await prisma.healthEvent.findFirst({
      where: {
        id: eventId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new HttpError(404, "Health event not found");
    }

    await requireTamboInTenant(auth, existing.tamboId);

    const item = await prisma.healthEvent.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });

    res.json({ item });
  },
);
