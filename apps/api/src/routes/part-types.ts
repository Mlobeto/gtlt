import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const partTypesRouter = Router();

/** Catálogo global — requiere auth; no filtra por tenant. */
partTypesRouter.get("/", authenticate, async (_req, res) => {
  const items = await prisma.partType.findMany({
    orderBy: [{ appliesPerBajada: "desc" }, { code: "asc" }],
  });
  res.json({ items });
});
