import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { computeHardwareBudget } from "../lib/hardware-budget.js";
import { codeFromHardwareName } from "../lib/hardware-code.js";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Panel de plataforma para DESARROLLADORA: catálogo global de equipos y
 * presupuesto informativo. Cross-tenant a propósito — DESARROLLADORA es un
 * rol de plataforma, no de un tenant puntual.
 */
export const adminHardwareProductsRouter = Router();

const deviceKindEnum = z.enum(["FLOW_METER", "RFID_READER", "VACUUM_PUMP_SENSOR", "GATE_SENSOR"]);
const quantityRuleEnum = z.enum(["PER_BAJADA", "PER_PUMP", "FIXED"]);
const currencyEnum = z.enum(["USD", "ARS"]);

function hasAtMostTwoDecimals(n: number) {
  return Math.abs(n - Math.round(n * 100) / 100) < 1e-8;
}

const unitPriceSchema = z
  .number()
  .nonnegative()
  .refine(hasAtMostTwoDecimals, "unitPrice admite como máximo 2 decimales")
  .nullable()
  .optional();

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  deviceKind: deviceKindEnum.optional().nullable(),
  quantityRule: quantityRuleEnum,
  fixedQuantity: z.number().int().min(1).max(100).optional().nullable(),
  unitPrice: unitPriceSchema,
  currency: currencyEnum.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  deviceKind: deviceKindEnum.optional().nullable(),
  quantityRule: quantityRuleEnum.optional(),
  fixedQuantity: z.number().int().min(1).max(100).optional().nullable(),
  unitPrice: unitPriceSchema,
  currency: currencyEnum.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

const budgetSchema = z.object({
  selectedProductIds: z.array(z.string().uuid()).min(1),
  bajadaCount: z.number().int().min(1).max(60),
  pumpCount: z.number().int().min(1).max(10),
});

function assertQuantityRule(
  quantityRule: "PER_BAJADA" | "PER_PUMP" | "FIXED",
  fixedQuantity: number | null | undefined,
) {
  if (quantityRule === "FIXED") {
    if (fixedQuantity == null) {
      throw new HttpError(400, "fixedQuantity es obligatorio cuando la regla es fija.");
    }
    return { quantityRule, fixedQuantity };
  }
  if (fixedQuantity != null) {
    throw new HttpError(400, "fixedQuantity solo se usa con la regla fija.");
  }
  return { quantityRule, fixedQuantity: null };
}

function serializeProduct(product: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  deviceKind: string | null;
  quantityRule: string;
  fixedQuantity: number | null;
  unitPrice: Prisma.Decimal | null;
  currency: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    deviceKind: product.deviceKind,
    quantityRule: product.quantityRule,
    fixedQuantity: product.fixedQuantity,
    unitPrice: product.unitPrice == null ? null : Number(product.unitPrice),
    currency: product.currency,
    active: product.active,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function uniqueCode(base: string): Promise<string> {
  let code = base;
  let n = 2;
  while (await prisma.hardwareProduct.findUnique({ where: { code } })) {
    code = `${base}_${n}`;
    n += 1;
  }
  return code;
}

adminHardwareProductsRouter.get(
  "/hardware-products",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (_req, res) => {
    const items = await prisma.hardwareProduct.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ items: items.map(serializeProduct) });
  },
);

adminHardwareProductsRouter.post(
  "/hardware-products/budget",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const products = await prisma.hardwareProduct.findMany({
      where: { id: { in: parsed.data.selectedProductIds } },
    });
    const budget = computeHardwareBudget({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        quantityRule: p.quantityRule,
        fixedQuantity: p.fixedQuantity,
        unitPrice: p.unitPrice,
        currency: p.currency,
        active: p.active,
      })),
      selectedProductIds: parsed.data.selectedProductIds,
      bajadaCount: parsed.data.bajadaCount,
      pumpCount: parsed.data.pumpCount,
    });
    res.json(budget);
  },
);

adminHardwareProductsRouter.post(
  "/hardware-products",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const rule = assertQuantityRule(data.quantityRule, data.fixedQuantity);
    const code = await uniqueCode(codeFromHardwareName(data.name));

    const item = await prisma.hardwareProduct.create({
      data: {
        code,
        name: data.name,
        description: data.description ?? null,
        deviceKind: data.deviceKind ?? null,
        quantityRule: rule.quantityRule,
        fixedQuantity: rule.fixedQuantity,
        unitPrice: data.unitPrice ?? null,
        currency: data.currency ?? "USD",
        sortOrder: data.sortOrder ?? 0,
      },
    });
    res.status(201).json({ item: serializeProduct(item) });
  },
);

adminHardwareProductsRouter.patch(
  "/hardware-products/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const existing = await prisma.hardwareProduct.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!existing) throw new HttpError(404, "Equipo no encontrado");

    const data = parsed.data;
    const quantityRule = data.quantityRule ?? existing.quantityRule;
    const fixedQuantity =
      data.fixedQuantity !== undefined ? data.fixedQuantity : existing.fixedQuantity;
    const rule = assertQuantityRule(quantityRule, fixedQuantity);

    const item = await prisma.hardwareProduct.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.deviceKind !== undefined ? { deviceKind: data.deviceKind } : {}),
        quantityRule: rule.quantityRule,
        fixedQuantity: rule.fixedQuantity,
        ...(data.unitPrice !== undefined ? { unitPrice: data.unitPrice } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    res.json({ item: serializeProduct(item) });
  },
);
