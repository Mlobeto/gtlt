import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { HttpError } from "../lib/http-error.js";

export const appPrototypeConfigRouter = Router();

const upsertSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  version: z.string().trim().max(200).nullable().optional(),
  codeUrl: z.string().trim().max(500).url().nullable().optional(),
  prototypeUrl: z.string().trim().max(500).url().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

appPrototypeConfigRouter.get("/", authenticate, requireRoles("DUENIO", "ADMIN", "VETERINARIO", "DESARROLLADORA"), async (req, res) => {
  const auth = req.auth!;
  const items = await prisma.appPrototypeConfig.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json({ items });
});

appPrototypeConfigRouter.post("/", authenticate, requireRoles("DUENIO", "ADMIN", "DESARROLLADORA"), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const payload = parsed.data;

  if (payload.active === false) {
    await prisma.appPrototypeConfig.updateMany({
      where: { tenantId: auth.tenantId, active: true },
      data: { active: false },
    });
  }

  const item = await prisma.appPrototypeConfig.create({
    data: {
      tenantId: auth.tenantId,
      name: payload.name ?? "Prototipo",
      version: payload.version ?? null,
      codeUrl: payload.codeUrl ?? null,
      prototypeUrl: payload.prototypeUrl ?? null,
      notes: payload.notes ?? null,
      active: payload.active ?? true,
    },
  });

  res.status(201).json({ item });
});

appPrototypeConfigRouter.patch("/:id", authenticate, requireRoles("DUENIO", "ADMIN", "DESARROLLADORA"), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const existing = await prisma.appPrototypeConfig.findFirst({
    where: { id: String(req.params.id), tenantId: auth.tenantId },
  });

  if (!existing) {
    throw new HttpError(404, "Prototype config not found");
  }

  if (parsed.data.active === false) {
    await prisma.appPrototypeConfig.updateMany({
      where: { tenantId: auth.tenantId, active: true, id: { not: existing.id } },
      data: { active: false },
    });
  }

  if (parsed.data.active === true) {
    await prisma.appPrototypeConfig.updateMany({
      where: { tenantId: auth.tenantId, active: true, id: { not: existing.id } },
      data: { active: false },
    });
  }

  const updated = await prisma.appPrototypeConfig.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name ?? existing.name,
      version: parsed.data.version ?? existing.version,
      codeUrl: parsed.data.codeUrl ?? existing.codeUrl,
      prototypeUrl: parsed.data.prototypeUrl ?? existing.prototypeUrl,
      notes: parsed.data.notes ?? existing.notes,
      active: parsed.data.active ?? existing.active,
    },
  });

  res.json({ item: updated });
});
