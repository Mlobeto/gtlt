import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const membershipsRouter = Router();

const inviteSchema = z
  .object({
    tamboId: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    companyName: z.string().trim().max(200).optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: "email or phone required",
  });

const acceptSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(6).max(100).optional(),
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
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    let user =
      (data.email
        ? await prisma.user.findUnique({ where: { email: data.email } })
        : null) ??
      (data.phone
        ? await prisma.user.findFirst({ where: { phone: data.phone } })
        : null);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          name: data.name?.trim() || data.email || data.phone || "Técnico",
        },
      });
    } else if (data.name?.trim()) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: data.name.trim() },
      });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

    const membership = await prisma.membership.upsert({
      where: {
        tenantId_userId: { tenantId: auth.tenantId, userId: user.id },
      },
      create: {
        tenantId: auth.tenantId,
        userId: user.id,
        roles: ["TECNICO"],
        status: "PENDING",
        companyName: data.companyName,
        inviteToken,
        inviteTokenExpiresAt,
      },
      update: {
        roles: ["TECNICO"],
        status: "PENDING",
        companyName: data.companyName ?? undefined,
        inviteToken,
        inviteTokenExpiresAt,
      },
      include: { tambos: true },
    });

    const already = membership.tambos.some((t) => t.tamboId === data.tamboId);
    if (!already) {
      await prisma.membershipTambo.create({
        data: {
          tenantId: auth.tenantId,
          membershipId: membership.id,
          tamboId: data.tamboId,
        },
      });
    }

    const full = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
      include: {
        user: { select: { id: true, email: true, phone: true, name: true } },
        tambos: { select: { tamboId: true } },
      },
    });

    res.status(201).json({
      item: full,
      // TODO: hoy se entrega a mano/por WhatsApp; cuando haya envío de email automático
      // (docs/reglas-negocio-app.md), sacar este campo de la respuesta HTTP y mandarlo
      // solo por el canal privado.
      inviteToken,
    });
  },
);

/**
 * Técnico con JWT (membership pendiente se permite solo vía token especial…
 * En este spike: login con password tras setear en accept, o accept con user ya logueado.
 *
 * Flujo: invite crea user; técnico hace POST accept-invite autenticado
 * (debe poder loguearse si ya tenía password, o registrarse).
 * Para stub sin password: POST /memberships/accept-invite/register con email+password.
 */
membershipsRouter.post(
  "/accept-invite",
  authenticate,
  async (req, res) => {
    const parsed = acceptSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const membership = await prisma.membership.findUnique({
      where: {
        tenantId_userId: { tenantId: auth.tenantId, userId: auth.userId },
      },
    });

    if (!membership) {
      throw new HttpError(404, "Membership not found");
    }
    if (!membership.roles.includes("TECNICO")) {
      throw new HttpError(403, "Not a technician membership");
    }

    if (parsed.data.password) {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      await prisma.user.update({
        where: { id: auth.userId },
        data: {
          passwordHash,
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
        },
      });
    } else if (parsed.data.name) {
      await prisma.user.update({
        where: { id: auth.userId },
        data: { name: parsed.data.name },
      });
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE" },
      include: {
        user: { select: { id: true, email: true, phone: true, name: true } },
        tambos: { select: { tamboId: true } },
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
