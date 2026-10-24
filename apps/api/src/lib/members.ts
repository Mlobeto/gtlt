import bcrypt from "bcryptjs";
import type { MembershipStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import { generateTemporaryPassword } from "./temp-password.js";
import { normalizeEmail, normalizePhone, PHONE_INVALID_MESSAGE } from "./identity.js";
import { invalidateAccess } from "./access-session.js";

export const DIRECT_MEMBER_ROLES = ["TAMBERO", "VETERINARIO"] as const;
export type DirectMemberRole = (typeof DIRECT_MEMBER_ROLES)[number];

const PROTECTED_ROLES: Role[] = ["DUENIO", "ADMIN", "TECNICO", "DESARROLLADORA"];

export const USER_EXISTS_MESSAGE =
  "Esa persona ya tiene una cuenta en CAL. Invitala con el enlace para sumarla a este tambo.";
export const SHARED_ACCOUNT_MESSAGE =
  "Esta persona también tiene acceso en otra cuenta. Tiene que cambiar su clave ella misma o pedirla a soporte.";

export type MembershipRef = {
  tenantId: string;
  status: MembershipStatus | string;
};

export type DirectCreateDecision =
  | { action: "create" }
  | { action: "activate_stub" }
  | { action: "reject_exists"; status: 409; code: "USER_EXISTS"; message: string }
  | { action: "reject_other_tenant"; status: 409; code: "USER_EXISTS"; message: string };

export type ResetDecision =
  | { action: "allow" }
  | { action: "reject"; status: 403 | 404 | 409; code?: string; message: string };

export function isDirectMemberRole(role: string): role is DirectMemberRole {
  return role === "TAMBERO" || role === "VETERINARIO";
}

export function decideDirectCreate(
  user: { passwordHash: string | null; memberships: MembershipRef[] } | null,
  tenantId: string,
): DirectCreateDecision {
  if (!user) return { action: "create" };
  if (user.passwordHash) {
    return {
      action: "reject_exists",
      status: 409,
      code: "USER_EXISTS",
      message: USER_EXISTS_MESSAGE,
    };
  }
  const activeElsewhere = user.memberships.some(
    (m) => m.status === "ACTIVE" && m.tenantId !== tenantId,
  );
  if (activeElsewhere) {
    return {
      action: "reject_other_tenant",
      status: 409,
      code: "USER_EXISTS",
      message: USER_EXISTS_MESSAGE,
    };
  }
  return { action: "activate_stub" };
}

export function decideResetPassword(input: {
  callerRoles: Role[];
  callerTenantId: string;
  membership: {
    tenantId: string;
    status: string;
    roles: Role[];
    user: { passwordHash: string | null; memberships: { tenantId: string }[] };
  } | null;
}): ResetDecision {
  const canCall = input.callerRoles.includes("DUENIO") || input.callerRoles.includes("ADMIN");
  if (!canCall) {
    return { action: "reject", status: 403, message: "No tenés permiso para restablecer claves." };
  }
  const membership = input.membership;
  if (!membership || membership.tenantId !== input.callerTenantId || membership.status !== "ACTIVE") {
    return { action: "reject", status: 404, message: "No encontrado." };
  }
  if (!membership.user.passwordHash) {
    return { action: "reject", status: 404, message: "No encontrado." };
  }
  if (membership.roles.some((role) => PROTECTED_ROLES.includes(role))) {
    return {
      action: "reject",
      status: 403,
      message: "No podés restablecer la clave de esta persona.",
    };
  }
  const shared = membership.user.memberships.some((m) => m.tenantId !== input.callerTenantId);
  if (shared) {
    return {
      action: "reject",
      status: 409,
      code: "SHARED_ACCOUNT",
      message: SHARED_ACCOUNT_MESSAGE,
    };
  }
  return { action: "allow" };
}

export function displayIdentifier(input: {
  typedPhone?: string | null;
  typedEmail?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const typed = (input.typedPhone ?? input.typedEmail ?? "").trim();
  if (typed) return typed;
  if (input.email) return input.email;
  if (input.phone) {
    if (input.phone.startsWith("+549")) return input.phone.slice(4);
    if (input.phone.startsWith("+")) return input.phone.slice(1);
    return input.phone;
  }
  return "";
}

type CreateMemberInput = {
  tenantId: string;
  tamboId: string;
  name: string;
  phone?: string;
  email?: string;
  role: string;
};

export type MemberItem = {
  id: string;
  roles: Role[];
  status: MembershipStatus;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
};

async function resolveIdentities(input: { email?: string; phone?: string }) {
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
  return { email, phone };
}

export async function createDirectMember(
  input: CreateMemberInput,
): Promise<{ item: MemberItem; temporaryPassword: string }> {
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "Poné el nombre.");
  if (!isDirectMemberRole(input.role)) {
    throw new HttpError(400, "Solo se puede dar de alta a un tambero o a un veterinario.");
  }
  const role = input.role;
  const { email, phone } = await resolveIdentities(input);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const item = await prisma.$transaction(async (tx) => {
    const byEmail = email ? await tx.user.findUnique({ where: { email } }) : null;
    const byPhone = phone ? await tx.user.findUnique({ where: { phone } }) : null;
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      throw new HttpError(409, "Ese correo y ese teléfono pertenecen a personas distintas.");
    }

    let user = byPhone ?? byEmail;
    if (user) {
      const memberships = await tx.membership.findMany({
        where: { userId: user.id },
        select: { tenantId: true, status: true },
      });
      const decision = decideDirectCreate(
        { passwordHash: user.passwordHash, memberships },
        input.tenantId,
      );
      if (decision.action === "reject_exists" || decision.action === "reject_other_tenant") {
        throw new HttpError(decision.status, decision.message, decision.code);
      }
    }

    if (!user) {
      user = await tx.user.create({
        data: {
          name,
          email: email ?? null,
          phone: phone ?? null,
          passwordHash,
          mustChangePassword: true,
          failedLogins: 0,
          lockedUntil: null,
          sessionsValidAfter: new Date(),
        },
      });
    } else {
      const patch: Prisma.UserUpdateInput = {
        passwordHash,
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
        sessionsValidAfter: new Date(),
        name,
      };
      if (email && !user.email) patch.email = email;
      if (phone && !user.phone) patch.phone = phone;
      user = await tx.user.update({ where: { id: user.id }, data: patch });
    }

    const membership = await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
      create: {
        tenantId: input.tenantId,
        userId: user.id,
        roles: [role],
        status: "ACTIVE",
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
      update: {
        roles: [role],
        status: "ACTIVE",
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });

    const already = await tx.membershipTambo.findUnique({
      where: { membershipId_tamboId: { membershipId: membership.id, tamboId: input.tamboId } },
    });
    if (!already) {
      await tx.membershipTambo.create({
        data: {
          tenantId: input.tenantId,
          membershipId: membership.id,
          tamboId: input.tamboId,
        },
      });
    }

    return {
      id: membership.id,
      roles: membership.roles,
      status: membership.status,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
    };
  });

  invalidateAccess(item.user.id);
  return { item, temporaryPassword };
}

export async function resetMemberPassword(input: {
  callerRoles: Role[];
  callerTenantId: string;
  membershipId: string;
}): Promise<{ temporaryPassword: string }> {
  const membership = await prisma.membership.findUnique({
    where: { id: input.membershipId },
    include: {
      user: {
        include: { memberships: { select: { tenantId: true } } },
      },
    },
  });

  const decision = decideResetPassword({
    callerRoles: input.callerRoles,
    callerTenantId: input.callerTenantId,
    membership,
  });
  if (decision.action === "reject") {
    throw new HttpError(decision.status, decision.message, decision.code);
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await prisma.user.update({
    where: { id: membership!.userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
      sessionsValidAfter: new Date(),
    },
  });
  invalidateAccess(membership!.userId);
  return { temporaryPassword };
}
