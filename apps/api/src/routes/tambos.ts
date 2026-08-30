import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const tambosRouter = Router();

/**
 * Tambos visibles para el JWT actual (scope tenant + MembershipTambo).
 * Ejemplo de query siempre filtrada por tenantId del token.
 */
tambosRouter.get("/", authenticate, async (req, res) => {
  const auth = req.auth!;

  const tambos = await prisma.tambo.findMany({
    where: {
      tenantId: auth.tenantId,
      active: true,
      ...(auth.tamboIds === null ? {} : { id: { in: auth.tamboIds } }),
    },
    select: {
      id: true,
      name: true,
      bajadaCount: true,
      active: true,
      serviceRequiresOwnerApproval: true,
    },
    orderBy: { name: "asc" },
  });

  res.json({ items: tambos });
});

tambosRouter.patch(
  "/:id",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        serviceRequiresOwnerApproval: z.boolean().optional(),
        name: z.string().trim().min(1).max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const id = String(req.params.id);
    await requireTamboInTenant(auth, id);

    const existing = await prisma.tambo.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Tambo not found");

    const item = await prisma.tambo.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.serviceRequiresOwnerApproval !== undefined
          ? {
              serviceRequiresOwnerApproval:
                parsed.data.serviceRequiresOwnerApproval,
            }
          : {}),
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
      },
      select: {
        id: true,
        name: true,
        bajadaCount: true,
        active: true,
        serviceRequiresOwnerApproval: true,
      },
    });

    res.json({ item });
  },
);
