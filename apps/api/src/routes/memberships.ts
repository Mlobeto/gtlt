import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { createInvite } from "../lib/invites.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const membershipsRouter = Router();

const inviteTechnicianSchema = z
  .object({
    tamboId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    companyName: z.string().trim().max(200).optional(),
    serviceProviderId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "email or phone required",
  });

const inviteMemberSchema = z
  .object({
    tamboId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["TAMBERO", "VETERINARIO"]),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "email or phone required",
  });

const acceptInviteSchema = z.object({
  inviteToken: z.string().min(32),
});

/**
 * Dueño/tambero invita técnico a un tambo.
 * Crea User stub si no existe + Membership PENDING + MembershipTambo.
 */
membershipsRouter.post(
  "/invite-technician",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = inviteTechnicianSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    if (data.serviceProviderId) {
      const provider = await prisma.serviceProvider.findFirst({
        where: { id: data.serviceProviderId, active: true },
      });
      if (!provider) throw new HttpError(404, "Service provider not found");
    }

    const { item, inviteToken } = await createInvite({
      tenantId: auth.tenantId,
      tamboId: data.tamboId,
      email: data.email,
      phone: data.phone,
      name: data.name,
      role: "TECNICO",
      companyName: data.companyName,
      serviceProviderId: data.serviceProviderId ?? null,
    });

    res.status(201).json({
      item,
      // TODO: hoy se entrega a mano/por WhatsApp; cuando haya envío de email automático
      // (docs/reglas-negocio-app.md), sacar este campo de la respuesta HTTP y mandarlo
      // solo por el canal privado.
      inviteToken,
    });
  },
);

membershipsRouter.post(
  "/invite",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    const { item, inviteToken } = await createInvite({
      tenantId: auth.tenantId,
      tamboId: data.tamboId,
      email: data.email,
      phone: data.phone,
      name: data.name,
      role: data.role,
    });

    res.status(201).json({ item, inviteToken });
  },
);

membershipsRouter.get(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z.object({ tamboId: z.string().uuid() }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    await requireTamboInTenant(auth, parsed.data.tamboId);

    const items = await prisma.membership.findMany({
      where: {
        tenantId: auth.tenantId,
        tambos: { some: { tamboId: parsed.data.tamboId } },
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      items: items.map((m) => ({
        id: m.id,
        roles: m.roles,
        status: m.status,
        companyName: m.companyName,
        user: m.user,
      })),
    });
  },
);

/**
 * Usuario que ya tiene cuenta acepta una invitación (de cualquier tenant y rol).
 * La membership se identifica por el token; debe pertenecer al usuario logueado.
 */
membershipsRouter.post(
  "/accept-invite",
  authenticate,
  async (req, res) => {
    const parsed = acceptInviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const membership = await prisma.membership.findUnique({
      where: { inviteToken: parsed.data.inviteToken },
    });

    if (!membership || membership.status === "ACTIVE") {
      throw new HttpError(404, "Invalid or already-used invitation");
    }
    if (membership.userId !== auth.userId) {
      throw new HttpError(403, "This invitation belongs to another user");
    }
    if (!membership.inviteTokenExpiresAt || membership.inviteTokenExpiresAt < new Date()) {
      throw new HttpError(410, "Invitation expired");
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE", inviteToken: null, inviteTokenExpiresAt: null },
      include: {
        user: { select: { id: true, email: true, phone: true, name: true } },
        tambos: { select: { tamboId: true } },
        tenant: { select: { id: true, name: true } },
      },
    });

    res.json({ item: updated });
  },
);

/**
 * Registro+aceptación para invitado stub (sin password aún).
 * Body: inviteToken (generado en /invite-technician) + password.
 * No confiar en tenantId/email/phone del body como prueba de identidad — el
 * token de invitación de un solo uso es lo único que identifica la membership.
 */
membershipsRouter.post("/accept-invite/register", async (req, res) => {
  const schema = z.object({
    inviteToken: z.string().min(32),
    password: z.string().min(6).max(100),
    name: z.string().trim().min(1).max(120).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const membership = await prisma.membership.findUnique({
    where: { inviteToken: data.inviteToken },
    include: { user: true },
  });

  if (!membership || membership.status === "ACTIVE") {
    throw new HttpError(404, "Invalid or already-used invitation");
  }
  if (!membership.inviteTokenExpiresAt || membership.inviteTokenExpiresAt < new Date()) {
    throw new HttpError(410, "Invitation expired");
  }
  if (membership.user.passwordHash) {
    res.status(409).json({
      error: "Ya existe una cuenta con este usuario. Ingresá con tu clave y aceptá la invitación.",
      code: "ACCOUNT_EXISTS",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  await prisma.user.update({
    where: { id: membership.user.id },
    data: {
      passwordHash,
      ...(data.name ? { name: data.name } : {}),
    },
  });

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { status: "ACTIVE", inviteToken: null, inviteTokenExpiresAt: null },
    include: {
      user: { select: { id: true, email: true, phone: true, name: true } },
      tambos: { select: { tamboId: true } },
      tenant: { select: { id: true, name: true } },
    },
  });

  res.json({ item: updated });
});
