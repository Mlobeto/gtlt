import crypto from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import { normalizeEmail, normalizePhone, PHONE_INVALID_MESSAGE } from "./identity.js";

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
  let email: string | undefined;
  if (input.email?.trim()) {
    const parsed = normalizeEmail(input.email);
    if (!parsed.ok) throw new HttpError(400, "Revisá el correo.");
    email = parsed.value;
  }
  let phone: string | undefined;
  if (input.phone?.trim()) {
    const parsed = normalizePhone(input.phone);
    if (!parsed.ok) throw new HttpError(400, PHONE_INVALID_MESSAGE);
    phone = parsed.value;
  }
  if (!email && !phone) {
    throw new HttpError(400, "Poné al menos un correo o un teléfono.");
  }

  const byEmail = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const byPhone = phone ? await prisma.user.findUnique({ where: { phone } }) : null;
  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    throw new HttpError(409, "Ese correo y ese teléfono pertenecen a personas distintas.");
  }
  let user = byPhone ?? byEmail;

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
        email: email ?? null,
        phone: phone ?? null,
        name: input.name?.trim() || email || phone || fallbackName,
      },
    });
  } else {
    const patch: { name?: string; email?: string; phone?: string } = {};
    if (input.name?.trim()) patch.name = input.name.trim();
    if (email && !user.email) patch.email = email;
    if (phone && !user.phone) patch.phone = phone;
    if (Object.keys(patch).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: patch,
      });
    }
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
