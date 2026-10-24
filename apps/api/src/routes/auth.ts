import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/auth-tokens.js";
import { authContextWithPasswordFlag } from "../lib/access.js";
import { parseIdentifier } from "../lib/identity.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../lib/http-error.js";
import { invalidateAccess } from "../lib/access-session.js";

export const authRouter = Router();

const LOGIN_GENERIC = "Invalid credentials";
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    /** Clientes viejos mandan `email`; sigue valiendo. */
    email: z.string().min(1).optional(),
    password: z.string().min(1),
    /** Obligatorio si el user tiene memberships en más de un tenant. */
    tenantId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.identifier?.trim() || d.email?.trim()), {
    message: "identifier or email required",
  });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const { password, tenantId } = parsed.data;
  const raw = (parsed.data.identifier ?? parsed.data.email ?? "").trim();
  const identity = parseIdentifier(raw);
  if (!identity.ok) {
    res.status(401).json({ error: LOGIN_GENERIC });
    return;
  }

  const user =
    identity.kind === "email"
      ? await prisma.user.findUnique({ where: { email: identity.value } })
      : await prisma.user.findUnique({ where: { phone: identity.value } });

  if (!user?.passwordHash) {
    res.status(401).json({ error: LOGIN_GENERIC });
    return;
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now) / 1000));
    throw new HttpError(429, "Demasiados intentos. Probá de nuevo más tarde.", "LOGIN_LOCKED", {
      retryAfterSeconds,
    });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const next = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: next,
        lockedUntil: next >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_LOCK_MS) : null,
      },
    });
    res.status(401).json({ error: LOGIN_GENERIC });
    return;
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: {
      tenant: { select: { id: true, name: true } },
      tambos: { select: { tamboId: true } },
    },
  });

  if (memberships.length === 0) {
    const pending = await prisma.membership.count({
      where: { userId: user.id, status: "PENDING" },
    });
    res.status(403).json({
      error: pending
        ? "Invitation pending: accept invite before login"
        : "User has no tenant membership",
      code: pending ? "MEMBERSHIP_PENDING" : "NO_MEMBERSHIP",
    });
    return;
  }

  let membership = memberships[0];
  if (tenantId) {
    const found = memberships.find((m) => m.tenantId === tenantId);
    if (!found) {
      res.status(403).json({ error: "No membership for this tenant" });
      return;
    }
    membership = found;
  } else if (memberships.length > 1) {
    res.status(400).json({
      error: "tenantId required",
      tenants: memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        roles: m.roles,
      })),
    });
    return;
  }

  const auth = authContextWithPasswordFlag(user.id, membership, user.mustChangePassword);

  const accessToken = signAccessToken(auth);

  res.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    tenant: membership.tenant,
    roles: membership.roles,
    tamboIds: auth.tamboIds,
    mustChangePassword: user.mustChangePassword,
  });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const auth = req.auth!;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, name: true, phone: true, mustChangePassword: true },
  });

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { id: true, name: true, timezone: true },
  });

  const tambos =
    auth.tamboIds === null
      ? await prisma.tambo.findMany({
          where: { tenantId: auth.tenantId, active: true },
          select: { id: true, name: true, bajadaCount: true },
          orderBy: { name: "asc" },
        })
      : await prisma.tambo.findMany({
          where: {
            tenantId: auth.tenantId,
            id: { in: auth.tamboIds },
            active: true,
          },
          select: { id: true, name: true, bajadaCount: true },
          orderBy: { name: "asc" },
        });

  res.json({
    user,
    tenant,
    roles: auth.roles,
    tamboAccess: auth.tamboIds === null ? "ALL" : "RESTRICTED",
    tambos,
    mustChangePassword: user.mustChangePassword,
  });
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  const parsed = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    throw new HttpError(400, "La clave nueva tiene que ser distinta de la actual.");
  }

  const auth = req.auth!;
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user?.passwordHash) {
    throw new HttpError(401, "User not found");
  }
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    throw new HttpError(400, "La clave actual no es correcta.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, sessionsValidAfter: new Date() },
  });
  invalidateAccess(user.id);

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, tenantId: auth.tenantId, status: "ACTIVE" },
    include: {
      tenant: { select: { id: true, name: true } },
      tambos: { select: { tamboId: true } },
    },
  });
  if (!membership) {
    throw new HttpError(403, "User has no tenant membership");
  }

  const ctx = authContextWithPasswordFlag(user.id, membership, false);
  const accessToken = signAccessToken(ctx);
  res.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name },
    tenant: membership.tenant,
    roles: membership.roles,
    tamboIds: ctx.tamboIds,
    mustChangePassword: false,
  });
});

authRouter.post("/switch-tenant", authenticate, async (req, res) => {
  const parsed = z.object({ tenantId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const membership = await prisma.membership.findFirst({
    where: {
      userId: auth.userId,
      tenantId: parsed.data.tenantId,
      status: "ACTIVE",
    },
    include: {
      tenant: { select: { id: true, name: true } },
      tambos: { select: { tamboId: true } },
      user: { select: { id: true, email: true, name: true, mustChangePassword: true } },
    },
  });

  if (!membership) {
    throw new HttpError(403, "No membership for this tenant");
  }

  const ctx = authContextWithPasswordFlag(
    auth.userId,
    membership,
    membership.user.mustChangePassword,
  );
  const accessToken = signAccessToken(ctx);

  res.json({
    accessToken,
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
    },
    tenant: membership.tenant,
    roles: membership.roles,
    tamboIds: ctx.tamboIds,
    mustChangePassword: membership.user.mustChangePassword,
  });
});
