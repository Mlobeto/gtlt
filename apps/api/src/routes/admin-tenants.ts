import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { syncPlanPricesFromUsd } from "../lib/plan-pricing.js";

/**
 * Panel de plataforma para DESARROLLADORA: alta de cuentas (tenant + dueño),
 * asignación/baja de plan y edición del catálogo de planes. Cross-tenant a
 * propósito — DESARROLLADORA es un rol de plataforma, no de un tenant puntual.
 */
export const adminRouter = Router();

const createTenantSchema = z.object({
  tenantName: z.string().trim().min(1).max(200),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().email(),
  ownerPassword: z.string().min(6).max(100),
  planCode: z.enum(["STANDARD", "LIFETIME"]).default("STANDARD"),
});

const updateSubscriptionSchema = z.object({
  planCode: z.enum(["STANDARD", "LIFETIME"]).optional(),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  priceUsd: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});

adminRouter.get(
  "/tenants",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (_req, res) => {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          where: { roles: { has: "DUENIO" } },
          include: { user: { select: { id: true, name: true, email: true } } },
          take: 1,
        },
        subscription: { include: { plan: true } },
      },
    });

    res.json({
      items: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        owner: t.memberships[0]?.user ?? null,
        subscription: t.subscription
          ? {
              id: t.subscription.id,
              status: t.subscription.status,
              currentPeriodEnd: t.subscription.currentPeriodEnd,
              plan: {
                code: t.subscription.plan.code,
                name: t.subscription.plan.name,
                priceUsd: t.subscription.plan.priceUsd,
                priceArs: t.subscription.plan.priceArs,
              },
            }
          : null,
      })),
    });
  },
);

adminRouter.post(
  "/tenants",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
    if (existing) {
      throw new HttpError(409, "Ya existe un usuario con ese email");
    }

    const plan = await prisma.plan.findUnique({ where: { code: data.planCode } });
    if (!plan) {
      throw new HttpError(404, "Plan not found");
    }

    const passwordHash = await bcrypt.hash(data.ownerPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: data.tenantName } });
      const owner = await tx.user.create({
        data: { email: data.ownerEmail, name: data.ownerName, passwordHash },
      });
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          roles: ["DUENIO"],
          status: "ACTIVE",
        },
      });
      const subscription = await tx.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: "ACTIVE" },
        include: { plan: true },
      });
      return { tenant, owner, subscription };
    });

    res.status(201).json({
      tenant: result.tenant,
      owner: { id: result.owner.id, name: result.owner.name, email: result.owner.email },
      subscription: result.subscription,
    });
  },
);

adminRouter.patch(
  "/tenants/:id/subscription",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = updateSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const tenantId = String(req.params.id);
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new HttpError(404, "Subscription not found for this tenant");
    }

    let planId = subscription.planId;
    if (parsed.data.planCode) {
      const plan = await prisma.plan.findUnique({ where: { code: parsed.data.planCode } });
      if (!plan) throw new HttpError(404, "Plan not found");
      planId = plan.id;
    }

    const updated = await prisma.subscription.update({
      where: { tenantId },
      data: {
        planId,
        status: parsed.data.status ?? subscription.status,
      },
      include: { plan: true },
    });

    res.json({ subscription: updated });
  },
);

adminRouter.get(
  "/plans",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (_req, res) => {
    const items = await prisma.plan.findMany({ orderBy: { code: "asc" } });
    res.json({ items });
  },
);

adminRouter.patch(
  "/plans/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const id = String(req.params.id);
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Plan not found");

    const data = parsed.data;
    const updated = await prisma.plan.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.priceUsd !== undefined ? { priceUsd: data.priceUsd } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    // Si cambió el precio en USD, recalculamos priceArs ya mismo (no esperar al cron diario).
    if (data.priceUsd !== undefined && data.priceUsd !== null) {
      await syncPlanPricesFromUsd();
    }

    const fresh = await prisma.plan.findUnique({ where: { id } });
    res.json({ plan: fresh ?? updated });
  },
);
