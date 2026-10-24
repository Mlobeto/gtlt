import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { syncPlanPricesFromUsd } from "../lib/plan-pricing.js";
import { tamboOnboardingSchema, createOnboardedTambo } from "../lib/tambo-onboarding.js";
import { tamboLifecycleState } from "../lib/tambo-state.js";
import { generateTemporaryPassword } from "../lib/temp-password.js";
import { invalidateAccess } from "../lib/access-session.js";
import {
  normalizeEmail,
  normalizePhone,
  PHONE_INVALID_MESSAGE,
} from "../lib/identity.js";

/**
 * Panel de plataforma para DESARROLLADORA: alta de cuentas (tenant + dueño),
 * asignación/baja de plan y edición del catálogo de planes. Cross-tenant a
 * propósito — DESARROLLADORA es un rol de plataforma, no de un tenant puntual.
 */
export const adminRouter = Router();

const createTenantSchema = z
  .object({
    tenantName: z.string().trim().min(1).max(200),
    ownerName: z.string().trim().min(1).max(120),
    ownerEmail: z.string().trim().optional(),
    ownerPhone: z.string().trim().optional(),
    ownerPassword: z.string().min(8).max(100),
    planCode: z.enum(["STANDARD", "LIFETIME"]).default("STANDARD"),
    tambo: tamboOnboardingSchema,
  })
  .refine((d) => Boolean(d.ownerEmail || d.ownerPhone), {
    message: "Poné al menos un correo o un teléfono",
  });

const addTamboSchema = tamboOnboardingSchema.extend({
  requestId: z.string().uuid().optional(),
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
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          take: 1,
        },
        subscription: { include: { plan: true } },
        tambos: {
          select: {
            id: true,
            name: true,
            active: true,
            activatedAt: true,
            bajadaCount: true,
            pumpCount: true,
            powerSupply: true,
            defaultServiceProvider: { select: { id: true, name: true } },
            serviceProviderPeriods: {
              where: { endedAt: null },
              select: { startedAt: true, serviceProvider: { select: { id: true, name: true } } },
              take: 1,
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.json({
      items: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        activeTambos: t.tambos.filter((x) => x.active && x.activatedAt != null).length,
        installingTambos: t.tambos.filter((x) => x.active && x.activatedAt == null).length,
        owner: t.memberships[0]?.user ?? null,
        tambos: t.tambos.map((tambo) => ({
          id: tambo.id,
          name: tambo.name,
          state: tamboLifecycleState(tambo),
          bajadaCount: tambo.bajadaCount,
          pumpCount: tambo.pumpCount,
          powerSupply: tambo.powerSupply,
          defaultServiceProvider: tambo.defaultServiceProvider,
          providerSince: tambo.serviceProviderPeriods[0]?.startedAt ?? null,
        })),
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

    let ownerEmail: string | null = null;
    if (data.ownerEmail) {
      const parsedEmail = normalizeEmail(data.ownerEmail);
      if (!parsedEmail.ok) throw new HttpError(400, "Revisá el correo.");
      ownerEmail = parsedEmail.value;
    }
    let ownerPhone: string | null = null;
    if (data.ownerPhone) {
      const parsedPhone = normalizePhone(data.ownerPhone);
      if (!parsedPhone.ok) throw new HttpError(400, PHONE_INVALID_MESSAGE);
      ownerPhone = parsedPhone.value;
    }
    if (!ownerEmail && !ownerPhone) {
      throw new HttpError(400, "Poné al menos un correo o un teléfono");
    }

    const existing =
      (ownerEmail ? await prisma.user.findUnique({ where: { email: ownerEmail } }) : null) ??
      (ownerPhone ? await prisma.user.findUnique({ where: { phone: ownerPhone } }) : null);
    if (existing) {
      throw new HttpError(409, "Ya existe un usuario con ese correo o teléfono");
    }

    const plan = await prisma.plan.findUnique({ where: { code: data.planCode } });
    if (!plan) {
      throw new HttpError(404, "Plan not found");
    }

    const tamboInput = {
      ...data.tambo,
      name: data.tambo.name?.trim() || data.tenantName,
    };
    const passwordHash = await bcrypt.hash(data.ownerPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: data.tenantName } });
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          phone: ownerPhone,
          name: data.ownerName,
          passwordHash,
          mustChangePassword: true,
        },
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
      const created = await createOnboardedTambo(tx, {
        tenantId: tenant.id,
        tambo: tamboInput,
        startedById: req.auth!.userId,
      });
      return { tenant, owner, subscription, ...created };
    });

    res.status(201).json({
      tenant: result.tenant,
      owner: {
        id: result.owner.id,
        name: result.owner.name,
        email: result.owner.email,
        phone: result.owner.phone,
      },
      subscription: result.subscription,
      tambo: {
        ...result.tambo,
        state: tamboLifecycleState(result.tambo),
      },
      budget: result.budget,
      monthlySubscription: {
        planCode: result.subscription.plan.code,
        planName: result.subscription.plan.name,
        priceUsd: result.subscription.plan.priceUsd,
        priceArs: result.subscription.plan.priceArs,
      },
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

adminRouter.post(
  "/tenants/:tenantId/tambos",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);
    const parsed = addTamboSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!tenant) throw new HttpError(404, "Tenant not found");

    const result = await prisma.$transaction((tx) =>
      createOnboardedTambo(tx, {
        tenantId: tenant.id,
        tambo: { ...parsed.data, name: parsed.data.name ?? tenant.name },
        startedById: req.auth!.userId,
        requestId: parsed.data.requestId,
      }),
    );

    res.status(201).json({
      item: {
        ...result.tambo,
        state: tamboLifecycleState(result.tambo),
      },
      budget: result.budget,
      monthlySubscription: tenant.subscription
        ? {
            planCode: tenant.subscription.plan.code,
            planName: tenant.subscription.plan.name,
            priceUsd: tenant.subscription.plan.priceUsd,
            priceArs: tenant.subscription.plan.priceArs,
          }
        : null,
    });
  },
);

adminRouter.post(
  "/users/:id/reset-password",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = z
      .object({
        temporaryPassword: z.string().min(8).max(100).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user) throw new HttpError(404, "Usuario no encontrado");

    const temporaryPassword = parsed.data.temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, sessionsValidAfter: new Date() },
    });
    invalidateAccess(user.id);

    res.json({
      item: { id: user.id, email: user.email, name: user.name },
      temporaryPassword,
    });
  },
);
