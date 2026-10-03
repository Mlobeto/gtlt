import crypto from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";

type CreateInviteInput = {
  tenantId: string;
  tamboId: string;
  email?: string;
  phone?: string;
  name?: string;
  role: Role;
  companyName?: string;
  serviceProviderId?: string | null;
};

export async function createInvite(input: CreateInviteInput) {
  let user =
    (input.email
      ? await prisma.user.findUnique({ where: { email: input.email } })
      : null) ??
    (input.phone
      ? await prisma.user.findFirst({ where: { phone: input.phone } })
      : null);

  const fallbackName =
    input.role === "TECNICO"
      ? "Técnico"
      : input.role === "VETERINARIO"
        ? "Veterinario"
        : "Tambero";

  if (user) {
    const existing = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
      include: { tambos: true },
    });
    if (existing?.status === "ACTIVE") {
      if (!existing.roles.includes(input.role)) {
        throw new HttpError(409, "Esa persona ya es miembro con otro rol. No se cambia automáticamente.");
      }
      if (!existing.tambos.some((t) => t.tamboId === input.tamboId)) {
        await prisma.membershipTambo.create({
          data: {
            tenantId: input.tenantId,
            membershipId: existing.id,
            tamboId: input.tamboId,
          },
        });
      }
      const item = await prisma.membership.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          user: { select: { id: true, email: true, phone: true, name: true } },
          tambos: { select: { tamboId: true } },
        },
      });
      return { item, inviteToken: null };
    }
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        name: input.name?.trim() || input.email || input.phone || fallbackName,
      },
    });
  } else if (input.name?.trim()) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { name: input.name.trim() },
    });
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: input.tenantId, userId: user.id },
    },
    create: {
      tenantId: input.tenantId,
      userId: user.id,
      roles: [input.role],
      status: "PENDING",
      companyName: input.companyName,
      serviceProviderId: input.serviceProviderId ?? null,
      inviteToken,
      inviteTokenExpiresAt,
    },
    update: {
      roles: [input.role],
      status: "PENDING",
      companyName: input.companyName ?? undefined,
      serviceProviderId: input.serviceProviderId ?? null,
      inviteToken,
      inviteTokenExpiresAt,
    },
    include: { tambos: true },
  });

  const already = membership.tambos.some((t) => t.tamboId === input.tamboId);
  if (!already) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: input.tenantId,
        membershipId: membership.id,
        tamboId: input.tamboId,
      },
    });
  }

  const item = await prisma.membership.findUniqueOrThrow({
    where: { id: membership.id },
    include: {
      user: { select: { id: true, email: true, phone: true, name: true } },
      tambos: { select: { tamboId: true } },
    },
  });

  return { item, inviteToken };
}
