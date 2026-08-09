import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const milkingSessionsRouter = Router();

const shiftSchema = z.enum(["MORNING", "AFTERNOON"]);

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: shiftSchema,
  totalLiters: z.number().positive(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["ACTIVE", "VOIDED", "ALL"]).optional().default("ACTIVE"),
});

const correctSchema = z.object({
  id: z.string().uuid().optional(),
  totalLiters: z.number().positive(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      throw new HttpError(
        409,
        "Conflict: active session already exists for this tambo/date/shift, or duplicate clientMutationId",
      );
    }
  }
  throw err;
}

/** Listado por tambo (default solo ACTIVE). */
milkingSessionsRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, from, to, status } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.milkingSession.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      ...(status === "ALL" ? {} : { status }),
      ...(from || to
        ? {
            sessionDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ sessionDate: "desc" }, { shift: "asc" }, { createdAt: "desc" }],
  });

  res.json({ items });
});

/** Alta append-only de sesión de ordeñe (totales del turno). */
milkingSessionsRouter.post(
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
    await requireTamboInTenant(auth, data.tamboId);

    try {
      const session = await prisma.milkingSession.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          sessionDate: new Date(`${data.sessionDate}T00:00:00.000Z`),
          shift: data.shift,
          totalLiters: data.totalLiters,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
          status: "ACTIVE",
        },
      });
      res.status(201).json({ item: session });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);

/**
 * Corrección append-only: VOIDED del ACTIVE actual + nuevo ACTIVE
 * con correctsSessionId apuntando al anulado.
 */
milkingSessionsRouter.post(
  "/:id/correct",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = correctSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const originalId = req.params.id;

    const original = await prisma.milkingSession.findFirst({
      where: { id: originalId, tenantId: auth.tenantId },
    });

    if (!original) {
      throw new HttpError(404, "Milking session not found");
    }
    if (original.status !== "ACTIVE") {
      throw new HttpError(409, "Only ACTIVE sessions can be corrected");
    }

    await requireTamboInTenant(auth, original.tamboId);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const voided = await tx.milkingSession.update({
          where: { id: original.id },
          data: { status: "VOIDED" },
        });

        const corrected = await tx.milkingSession.create({
          data: {
            ...(parsed.data.id ? { id: parsed.data.id } : {}),
            tenantId: auth.tenantId,
            tamboId: original.tamboId,
            sessionDate: original.sessionDate,
            shift: original.shift,
            totalLiters: parsed.data.totalLiters,
            notes: parsed.data.notes,
            clientMutationId: parsed.data.clientMutationId,
            createdById: auth.userId,
            status: "ACTIVE",
            correctsSessionId: original.id,
          },
        });

        return { voided, corrected };
      });

      res.status(201).json(result);
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
