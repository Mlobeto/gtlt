import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

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
    },
    orderBy: { name: "asc" },
  });

  res.json({ items: tambos });
});
