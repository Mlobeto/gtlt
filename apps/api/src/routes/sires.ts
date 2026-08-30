import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const siresRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  registrationCode: z.string().trim().max(100).optional(),
  isExternal: z.boolean().optional().default(true),
  linkedAnimalId: z.string().uuid().optional().nullable(),
});

const listSchema = z.object({
  isExternal: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

siresRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const items = await prisma.sire.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(parsed.data.isExternal !== undefined ? { isExternal: parsed.data.isExternal } : {}),
    },
    orderBy: { name: "asc" },
  });

  res.json({ items });
});

siresRouter.post(
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

    const item = await prisma.sire.create({
      data: {
        tenantId: auth.tenantId,
        name: data.name,
        registrationCode: data.registrationCode,
        isExternal: data.isExternal,
        linkedAnimalId: data.linkedAnimalId ?? undefined,
      },
    });

    res.status(201).json({ item });
  },
);
