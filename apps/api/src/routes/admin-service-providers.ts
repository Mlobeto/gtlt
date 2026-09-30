import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Catálogo global de proveedores de service. Solo DESARROLLADORA puede
 * crear/editar. El dueño elige entre los activos en su tambo.
 */
export const adminServiceProvidersRouter = Router();

adminServiceProvidersRouter.get(
  "/service-providers",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (_req, res) => {
    const items = await prisma.serviceProvider.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    res.json({ items });
  },
);

adminServiceProvidersRouter.post(
  "/service-providers",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const item = await prisma.serviceProvider.create({
      data: { name: parsed.data.name },
    });
    res.status(201).json({ item });
  },
);

adminServiceProvidersRouter.patch(
  "/service-providers/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        active: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const existing = await prisma.serviceProvider.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) throw new HttpError(404, "Service provider not found");

    const item = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.serviceProvider.updateMany({
          where: { isDefault: true, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }

      return tx.serviceProvider.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
          ...(parsed.data.active != null ? { active: parsed.data.active } : {}),
          ...(parsed.data.isDefault != null ? { isDefault: parsed.data.isDefault } : {}),
        },
      });
    });

    res.json({ item });
  },
);
