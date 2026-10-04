import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { attributesRecord, keyFromFieldLabel, serializePartTypeField } from "../lib/part-attributes.js";
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

const fieldCreateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["TEXT", "NUMBER", "SELECT", "BOOLEAN"]),
  unit: z.string().trim().max(20).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(80)).optional(),
  required: z.boolean().optional(),
  min: z.number().finite().optional().nullable(),
  max: z.number().finite().optional().nullable(),
  helpText: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const fieldPatchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(["TEXT", "NUMBER", "SELECT", "BOOLEAN"]).optional(),
  unit: z.string().trim().max(20).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(80)).optional(),
  required: z.boolean().optional(),
  min: z.number().finite().optional().nullable(),
  max: z.number().finite().optional().nullable(),
  helpText: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

function assertUsageThresholds(
  pattern: "REACTIVE" | "USAGE_BASED" | "BRANDED",
  usage: number | null | undefined,
  months: number | null | undefined,
) {
  if (pattern === "REACTIVE" || pattern === "BRANDED") {
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
      include: {
        _count: { select: { instances: { where: { replacedAt: null } } } },
        fields: { orderBy: { sortOrder: "asc" } },
      },
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
        fields: t.fields.map(serializePartTypeField),
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

    if (body.data.appliesPerBajada != null && body.data.appliesPerBajada !== existing.appliesPerBajada) {
      if (existing._count.instances > 0) {
        throw new HttpError(
          409,
          `No se puede cambiar si es por bajada: hay ${existing._count.instances} pieza${existing._count.instances === 1 ? "" : "s"} instalada${existing._count.instances === 1 ? "" : "s"}.`,
        );
      }
    }

    const nextPattern = body.data.pattern ?? existing.pattern;

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

function fieldHasValue(attributes: unknown, key: string, option?: string): boolean {
  const attrs = attributesRecord(attributes);
  const value = attrs[key];
  if (value == null || value === "") return false;
  if (option != null) return value === option;
  return true;
}

async function countFieldUsage(partTypeId: string, key: string, option?: string) {
  const rows = await prisma.partInstance.findMany({
    where: { partTypeId },
    select: { attributes: true },
  });
  return rows.filter((row) => fieldHasValue(row.attributes, key, option)).length;
}

async function uniqueFieldKey(partTypeId: string, base: string): Promise<string> {
  let key = base;
  let n = 2;
  while (await prisma.partTypeField.findUnique({ where: { partTypeId_key: { partTypeId, key } } })) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

adminPartTypesRouter.post(
  "/part-types/:id/fields",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    const body = fieldCreateSchema.safeParse(req.body);
    if (!idParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const partType = await prisma.partType.findUnique({ where: { id: idParsed.data } });
    if (!partType) throw new HttpError(404, "Tipo de pieza no encontrado");

    const options = (body.data.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (body.data.kind === "SELECT" && options.length < 2) {
      throw new HttpError(400, "Un selector necesita al menos dos opciones.");
    }

    const key = await uniqueFieldKey(partType.id, keyFromFieldLabel(body.data.label));
    const item = await prisma.partTypeField.create({
      data: {
        partTypeId: partType.id,
        key,
        label: body.data.label,
        kind: body.data.kind,
        unit: body.data.kind === "NUMBER" ? (body.data.unit ?? null) : null,
        options: body.data.kind === "SELECT" ? options : [],
        required: body.data.required ?? false,
        min: body.data.kind === "NUMBER" ? (body.data.min ?? null) : null,
        max: body.data.kind === "NUMBER" ? (body.data.max ?? null) : null,
        helpText: body.data.helpText ?? null,
        sortOrder: body.data.sortOrder ?? 0,
      },
    });
    res.status(201).json({ item: serializePartTypeField(item) });
  },
);

adminPartTypesRouter.patch(
  "/part-types/:id/fields/:fieldId",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    const fieldIdParsed = z.string().uuid().safeParse(req.params.fieldId);
    const body = fieldPatchSchema.safeParse(req.body);
    if (!idParsed.success || !fieldIdParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const existing = await prisma.partTypeField.findFirst({
      where: { id: fieldIdParsed.data, partTypeId: idParsed.data },
    });
    if (!existing) throw new HttpError(404, "Campo no encontrado");

    if (body.data.kind != null && body.data.kind !== existing.kind) {
      const used = await countFieldUsage(existing.partTypeId, existing.key);
      if (used > 0) {
        throw new HttpError(
          409,
          `No se puede cambiar el tipo: ${used} pieza${used === 1 ? "" : "s"} ya ${used === 1 ? "tiene" : "tienen"} un valor para este campo.`,
          "FIELD_KIND_IN_USE",
          { count: used },
        );
      }
    }

    const nextKind = body.data.kind ?? existing.kind;
    let nextOptions = existing.options;
    if (body.data.options != null) {
      const options = body.data.options.map((o) => o.trim()).filter(Boolean);
      if (nextKind === "SELECT" && options.length < 2) {
        throw new HttpError(400, "Un selector necesita al menos dos opciones.");
      }
      const removed = existing.options.filter((opt) => !options.includes(opt));
      for (const option of removed) {
        const used = await countFieldUsage(existing.partTypeId, existing.key, option);
        if (used > 0) {
          throw new HttpError(
            409,
            `No se puede quitar “${option}”: ${used} pieza${used === 1 ? "" : "s"} ya ${used === 1 ? "la usa" : "la usan"}.`,
            "FIELD_OPTION_IN_USE",
            { option, count: used },
          );
        }
      }
      nextOptions = nextKind === "SELECT" ? options : [];
    } else if (nextKind !== "SELECT") {
      nextOptions = [];
    }

    const item = await prisma.partTypeField.update({
      where: { id: existing.id },
      data: {
        ...(body.data.label != null ? { label: body.data.label } : {}),
        ...(body.data.kind != null ? { kind: body.data.kind } : {}),
        ...(body.data.unit !== undefined
          ? { unit: nextKind === "NUMBER" ? body.data.unit : null }
          : nextKind !== "NUMBER"
            ? { unit: null }
            : {}),
        options: nextOptions,
        ...(body.data.required != null ? { required: body.data.required } : {}),
        ...(body.data.min !== undefined
          ? { min: nextKind === "NUMBER" ? body.data.min : null }
          : nextKind !== "NUMBER"
            ? { min: null }
            : {}),
        ...(body.data.max !== undefined
          ? { max: nextKind === "NUMBER" ? body.data.max : null }
          : nextKind !== "NUMBER"
            ? { max: null }
            : {}),
        ...(body.data.helpText !== undefined ? { helpText: body.data.helpText } : {}),
        ...(body.data.sortOrder != null ? { sortOrder: body.data.sortOrder } : {}),
        ...(body.data.active != null ? { active: body.data.active } : {}),
      },
    });
    res.json({ item: serializePartTypeField(item) });
  },
);
