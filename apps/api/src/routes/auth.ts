import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAccessToken } from "../lib/auth-tokens.js";
import { resolveTamboIds } from "../lib/access.js";
import { authenticate } from "../middleware/authenticate.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Obligatorio si el user tiene memberships en más de un tenant. */
  tenantId: z.string().uuid().optional(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const { email, password, tenantId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: {
      tenant: { select: { id: true, name: true } },
      tambos: { select: { tamboId: true } },
    },
  });

  if (memberships.length === 0) {
    res.status(403).json({ error: "User has no tenant membership" });
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

  const auth = {
    userId: user.id,
    tenantId: membership.tenantId,
    roles: membership.roles,
    tamboIds: resolveTamboIds(membership),
  };

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
  });
});

authRouter.get("/me", authenticate, async (req, res) => {
  const auth = req.auth!;
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, name: true, phone: true },
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
  });
});
