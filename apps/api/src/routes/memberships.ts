import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authContextWithPasswordFlag } from "../lib/access.js";
import { signAccessToken } from "../lib/auth-tokens.js";
import { createInvite } from "../lib/invites.js";
import { createDirectMember, resetMemberPassword } from "../lib/members.js";
import {
  cancelInvite,
  listMembershipsForTambo,
  patchMembership,
  reactivateMembership,
  revokeMembership,
} from "../lib/membership-admin.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import type { Role } from "@prisma/client";

export const membershipsRouter = Router();

const inviteTechnicianSchema = z
  .object({
    tamboId: z.string().uuid(),
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
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
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["TAMBERO", "VETERINARIO"]),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "email or phone required",
  });

const acceptInviteSchema = z.object({
  inviteToken: z.string().min(32),
});

const tamberoRoleSchema = z.object({
  enabled: z.boolean(),
});

const createMemberSchema = z
  .object({
    tamboId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).max(40).optional(),
    role: z.string(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Poné al menos un correo o un teléfono.",
  });

membershipsRouter.patch(
  "/me/tambero-role",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = tamberoRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: auth.tenantId, userId: auth.userId } },
      include: { tambos: { select: { tamboId: true } } },
    });
    if (!membership) throw new HttpError(404, "Membership not found");

    let roles: Role[] = [...membership.roles];
    if (parsed.data.enabled) {
      if (!roles.includes("TAMBERO")) roles = [...roles, "TAMBERO"];
    } else {
      roles = roles.filter((role) => role !== "TAMBERO");
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { roles },
      include: { tambos: { select: { tamboId: true } } },
    });

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { mustChangePassword: true },
    });
    const ctx = authContextWithPasswordFlag(auth.userId, updated, Boolean(user?.mustChangePassword));
    const accessToken = signAccessToken(ctx);
    res.json({ roles: updated.roles, accessToken });
  },
);

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

membershipsRouter.post(
  "/create-member",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = createMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message;
      res.status(400).json({
        error: msg && !msg.startsWith("Invalid") ? msg : "Revisá los datos.",
      });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    const { item, temporaryPassword } = await createDirectMember({
      tenantId: auth.tenantId,
      tamboId: data.tamboId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      role: data.role,
    });

    res.status(201).json({ item, temporaryPassword });
  },
);

membershipsRouter.post(
  "/:id/reset-password",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const auth = req.auth!;
    const { temporaryPassword } = await resetMemberPassword({
      callerRoles: auth.roles,
      callerTenantId: auth.tenantId,
      membershipId: String(req.params.id),
    });
    res.json({ temporaryPassword });
  },
);

membershipsRouter.get(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        tamboId: z.string().uuid(),
        includeRevoked: z.enum(["true", "false"]).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisá los datos." });
      return;
    }

    const items = await listMembershipsForTambo({
      auth: req.auth!,
      tamboId: parsed.data.tamboId,
      includeRevoked: parsed.data.includeRevoked === "true",
    });
    res.json({ items });
  },
);

membershipsRouter.patch(
  "/:id",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        role: z.enum(["TAMBERO", "VETERINARIO"]).optional(),
        tamboIds: z.array(z.string().uuid()).optional(),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Revisá los datos." });
      return;
    }
    const item = await patchMembership({
      auth: req.auth!,
      membershipId: String(req.params.id),
      ...parsed.data,
    });
    res.json({ item });
  },
);

membershipsRouter.post(
  "/:id/revoke",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const item = await revokeMembership({
      auth: req.auth!,
      membershipId: String(req.params.id),
    });
    res.json({ item });
  },
);

membershipsRouter.post(
  "/:id/reactivate",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const item = await reactivateMembership({
      auth: req.auth!,
      membershipId: String(req.params.id),
    });
    res.json({ item });
  },
);

membershipsRouter.post(
  "/:id/cancel-invite",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    await cancelInvite({
      auth: req.auth!,
      membershipId: String(req.params.id),
    });
    res.status(204).end();
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
