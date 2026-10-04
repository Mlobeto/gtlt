import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { effectiveThresholds } from "../lib/part-life-attach.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const partTypeConfigRouter = Router();

const overrideSchema = z.object({
  usageThreshold: z.number().int().min(100).max(100_000).optional().nullable(),
  lifeMonths: z.number().int().min(1).max(120).optional().nullable(),
});

partTypeConfigRouter.get(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const types = await prisma.partType.findMany({
      where: {
        pattern: "USAGE_BASED",
        OR: [
          { defaultUsageThreshold: { not: null } },
          { defaultLifeMonths: { not: null } },
        ],
      },
      include: {
        tenantConfigs: { where: { tenantId: req.auth!.tenantId } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({
      items: types.map((t) => {
        const config = t.tenantConfigs[0] ?? null;
        const effective = effectiveThresholds(t, config);
        return {
          partTypeId: t.id,
          code: t.code,
          name: t.name,
          defaultUsageThreshold: t.defaultUsageThreshold,
          defaultLifeMonths: t.defaultLifeMonths,
          tenantUsageThreshold: config?.usageThreshold ?? null,
          tenantLifeMonths: config?.lifeMonths ?? null,
          effectiveUsageThreshold: effective.usageThreshold,
          effectiveLifeMonths: effective.lifeMonths,
        };
      }),
    });
  },
);

partTypeConfigRouter.put(
  "/:partTypeId",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.partTypeId);
    const body = overrideSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    if (body.data.usageThreshold == null && body.data.lifeMonths == null) {
      throw new HttpError(400, "Indicá al menos un umbral (ordeñes o meses).");
    }

    const partType = await prisma.partType.findUnique({
      where: { id: idParsed.data },
    });
    if (!partType || partType.pattern !== "USAGE_BASED") {
      throw new HttpError(404, "Tipo de pieza no encontrado o sin vida útil.");
    }

    const item = await prisma.tenantPartTypeConfig.upsert({
      where: {
        tenantId_partTypeId: {
          tenantId: req.auth!.tenantId,
          partTypeId: partType.id,
        },
      },
      create: {
        tenantId: req.auth!.tenantId,
        partTypeId: partType.id,
        usageThreshold: body.data.usageThreshold ?? null,
        lifeMonths: body.data.lifeMonths ?? null,
      },
      update: {
        usageThreshold: body.data.usageThreshold ?? null,
        lifeMonths: body.data.lifeMonths ?? null,
      },
    });
    res.json({ item });
  },
);

partTypeConfigRouter.delete(
  "/:partTypeId",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.partTypeId);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await prisma.tenantPartTypeConfig.deleteMany({
      where: { tenantId: req.auth!.tenantId, partTypeId: idParsed.data },
    });
    res.json({ ok: true });
  },
);
