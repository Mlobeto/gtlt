import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";

export const flowSessionsRouter = Router();

const assignSchema = z.object({
  tamboId: z.string().uuid(),
  bajadaNumber: z.number().int().min(1),
  earTag: z.string().trim().min(1),
  at: z.string().datetime(),
});

flowSessionsRouter.patch(
  "/assign",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;

    await requireTamboInTenant(auth, data.tamboId);

    const animal = await prisma.animal.findFirst({
      where: {
        tenantId: auth.tenantId,
        tamboId: data.tamboId,
        earTag: data.earTag,
        deletedAt: null,
        status: { in: ["ACTIVE", "DRY"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!animal) {
      throw new HttpError(404, "Animal no encontrado en este tambo");
    }

    const targetAt = new Date(data.at);
    const windowSeconds = 30;
    const start = new Date(targetAt.getTime() - windowSeconds * 1000);
    const end = new Date(targetAt.getTime() + windowSeconds * 1000);

    const item = await prisma.flowSession.findFirst({
      where: {
        tenantId: auth.tenantId,
        tamboId: data.tamboId,
        bajadaNumber: data.bajadaNumber,
        status: "OPEN",
        startedAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { startedAt: "desc" },
    });

    if (!item) {
      throw new HttpError(
        404,
        "No hay una sesión de ordeñe abierta en esa bajada en ese momento",
      );
    }

    const updated = await prisma.flowSession.update({
      where: { id: item.id },
      data: {
        animalId: animal.id,
        identificationSource: "VOICE",
      },
    });

    res.json({ item: updated });
  },
);
