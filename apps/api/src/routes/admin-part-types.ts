import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { codeFromPartName } from "../lib/part-code.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Panel de plataforma para DESARROLLADORA: catálogo global de piezas.
 * Cross-tenant a propósito — DESARROLLADORA es un rol de plataforma,
 * no de un tenant puntual.
 */
export const adminPartTypesRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  appliesPerBajada: z.boolean(),
  pattern: z.enum(["REACTIVE", "USAGE_BASED"]),
  defaultUsageThreshold: z.number().int().min(100).max(100_000).optional().nullable(),
  defaultLifeMonths: z.number().int().min(1).max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  appliesPerBajada: z.boolean().optional(),
  pattern: z.enum(["REACTIVE", "USAGE_BASED"]).optional(),
  defaultUsageThreshold: z.number().int().min(100).max(100_000).optional().nullable(),
  defaultLifeMonths: z.number().int().min(1).max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

function assertUsageThresholds(
  pattern: "REACTIVE" | "USAGE_BASED",
  usage: number | null | undefined,
  months: number | null | undefined,
) {
  if (pattern === "REACTIVE") {
    return { defaultUsageThreshold: null, defaultLifeMonths: null };
  }
  const usageThreshold = usage ?? null;
  const lifeMonths = months ?? null;
  if (usageThreshold == null && lifeMonths == null) {
    throw new HttpError(400, "Una pieza con vida útil necesita ordeñes y/o meses.");
  }
  return { defaultUsageThreshold: usageThreshold, defaultLifeMonths: lifeMonths };
}

async function uniqueCode(base: string): Promise<string> {
  let code = base;
  let n = 2;
  while (await prisma.partType.findUnique({ where: { code } })) {
    code = `${base}_${n}`;
    n += 1;
  }
  return code;
}

adminPartTypesRouter.get(
  "/part-types",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (_req, res) => {
    const items = await prisma.partType.findMany({
      include: { _count: { select: { instances: { where: { replacedAt: null } } } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({
      items: items.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        pattern: t.pattern,
        appliesPerBajada: t.appliesPerBajada,
        defaultUsageThreshold: t.defaultUsageThreshold,
        defaultLifeMonths: t.defaultLifeMonths,
        sortOrder: t.sortOrder,
        active: t.active,
        installedCount: t._count.instances,
      })),
    });
  },
);

adminPartTypesRouter.post(
  "/part-types",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const thresholds = assertUsageThresholds(
      parsed.data.pattern,
      parsed.data.defaultUsageThreshold,
      parsed.data.defaultLifeMonths,
    );
    const code = await uniqueCode(codeFromPartName(parsed.data.name));
    const item = await prisma.partType.create({
      data: {
        code,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        appliesPerBajada: parsed.data.appliesPerBajada,
        pattern: parsed.data.pattern,
        sortOrder: parsed.data.sortOrder ?? 0,
        ...thresholds,
      },
    });
    res.status(201).json({ item });
  },
);

adminPartTypesRouter.patch(
  "/part-types/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    const body = patchSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const existing = await prisma.partType.findUnique({
      where: { id: idParsed.data },
      include: { _count: { select: { instances: { where: { replacedAt: null } } } } },
    });
    if (!existing) throw new HttpError(404, "Tipo de pieza no encontrado");

    if (existing.pattern === "BRANDED") {
      const item = await prisma.partType.update({
        where: { id: existing.id },
        data: {
          ...(body.data.name != null ? { name: body.data.name } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        },
      });
      res.json({ item });
      return;
    }

    if (body.data.appliesPerBajada != null && body.data.appliesPerBajada !== existing.appliesPerBajada) {
      if (existing._count.instances > 0) {
        throw new HttpError(
          409,
          `No se puede cambiar si es por bajada: hay ${existing._count.instances} pieza${existing._count.instances === 1 ? "" : "s"} instalada${existing._count.instances === 1 ? "" : "s"}.`,
        );
      }
    }

    const nextPattern = (body.data.pattern ?? existing.pattern) as "REACTIVE" | "USAGE_BASED";

    const thresholds = assertUsageThresholds(
      nextPattern,
      body.data.defaultUsageThreshold !== undefined
        ? body.data.defaultUsageThreshold
        : existing.defaultUsageThreshold,
      body.data.defaultLifeMonths !== undefined
        ? body.data.defaultLifeMonths
        : existing.defaultLifeMonths,
    );

    const item = await prisma.partType.update({
      where: { id: existing.id },
      data: {
        ...(body.data.name != null ? { name: body.data.name } : {}),
        ...(body.data.description !== undefined ? { description: body.data.description } : {}),
        ...(body.data.appliesPerBajada != null
          ? { appliesPerBajada: body.data.appliesPerBajada }
          : {}),
        pattern: nextPattern,
        ...thresholds,
        ...(body.data.sortOrder != null ? { sortOrder: body.data.sortOrder } : {}),
        ...(body.data.active != null ? { active: body.data.active } : {}),
      },
    });
    res.json({ item });
  },
);
