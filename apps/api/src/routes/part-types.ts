import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePartTypeField } from "../lib/part-attributes.js";
import { authenticate } from "../middleware/authenticate.js";

export const partTypesRouter = Router();

/** Catálogo global — requiere auth; no filtra por tenant. */
partTypesRouter.get("/", authenticate, async (req, res) => {
  const includeInactive =
    req.query.includeInactive === "1" || req.query.includeInactive === "true";
  const isDeveloper = req.auth?.roles.includes("DESARROLLADORA") ?? false;

  const items = await prisma.partType.findMany({
    where: includeInactive && isDeveloper ? {} : { active: true },
    include: {
      fields: { where: { active: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json({
    items: items.map((item) => ({
      ...item,
      fields: item.fields.map(serializePartTypeField),
    })),
  });
});
