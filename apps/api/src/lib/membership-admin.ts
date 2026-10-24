import type { MembershipStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import { normalizeEmail, normalizePhone, PHONE_INVALID_MESSAGE } from "./identity.js";
import { requireTamboInTenant } from "./tambo-scope.js";
import { invalidateAccess } from "./access-session.js";
import type { AuthContext } from "../types/express.js";

const MANAGEABLE_ROLES: Role[] = ["TAMBERO", "VETERINARIO"];
const FORBIDDEN_ROLES: Role[] = ["DUENIO", "ADMIN", "TECNICO", "DESARROLLADORA"];

export const SHARED_ACCOUNT_MESSAGE =
  "Esta persona también tiene acceso en otra cuenta. Tiene que cambiar su clave ella misma o pedirla a soporte.";
export const IDENTITY_TAKEN_MESSAGE = "Ese teléfono (o correo) ya lo usa otra persona.";
export const NOT_MANAGEABLE_MESSAGE = "Esa persona la gestiona otra cuenta o soporte";

export function isManageableRoles(roles: Role[]): boolean {
  return roles.length > 0 && roles.every((role) => MANAGEABLE_ROLES.includes(role));
}

export async function loadTenantMembership(tenantId: string, membershipId: string) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      user: true,
      tambos: { select: { tamboId: true } },
    },
  });
  if (!membership || membership.tenantId !== tenantId) {
    throw new HttpError(404, "No encontrado.");
  }
  return membership;
}

export function assertManageable(
  membership: { userId: string; roles: Role[] },
  callerUserId: string,
): void {
  if (membership.userId === callerUserId) {
    throw new HttpError(403, "No podés hacer esto sobre tu propia cuenta.");
  }
  if (membership.roles.some((role) => FORBIDDEN_ROLES.includes(role)) || !isManageableRoles(membership.roles)) {
    throw new HttpError(403, NOT_MANAGEABLE_MESSAGE);
  }
}

export async function userIsSharedAccount(userId: string, tenantId: string): Promise<boolean> {
  const other = await prisma.membership.count({
    where: { userId, tenantId: { not: tenantId } },
  });
  return other > 0;
}

function serializeItem(
  membership: {
    id: string;
    roles: Role[];
    status: MembershipStatus;
    companyName: string | null;
    revokedAt: Date | null;
    user: { id: string; name: string; email: string | null; phone: string | null };
    tambos: { tamboId: string }[];
  },
  opts: { callerUserId: string; sharedAccount: boolean },
) {
  return {
    id: membership.id,
    roles: membership.roles,
    status: membership.status,
    companyName: membership.companyName,
    revokedAt: membership.revokedAt,
    manageable:
      membership.user.id !== opts.callerUserId && isManageableRoles(membership.roles),
    sharedAccount: opts.sharedAccount,
    tamboIds: membership.tambos.map((t) => t.tamboId),
    user: membership.user,
  };
}

export async function listMembershipsForTambo(input: {
  auth: AuthContext;
  tamboId: string;
  includeRevoked: boolean;
}) {
  await requireTamboInTenant(input.auth, input.tamboId);
  const items = await prisma.membership.findMany({
    where: {
      tenantId: input.auth.tenantId,
      tambos: { some: { tamboId: input.tamboId } },
      ...(input.includeRevoked ? {} : { status: { not: "REVOKED" } }),
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      tambos: { select: { tamboId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const userIds = items.map((m) => m.user.id);
  const others =
    userIds.length === 0
      ? []
      : await prisma.membership.findMany({
          where: { userId: { in: userIds }, tenantId: { not: input.auth.tenantId } },
          select: { userId: true },
        });
  const shared = new Set(others.map((m) => m.userId));
  return items.map((m) =>
    serializeItem(m, {
      callerUserId: input.auth.userId,
      sharedAccount: shared.has(m.user.id),
    }),
  );
}

export async function patchMembership(input: {
  auth: AuthContext;
  membershipId: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  tamboIds?: string[];
}) {
  const membership = await loadTenantMembership(input.auth.tenantId, input.membershipId);
  assertManageable(membership, input.auth.userId);
  if (membership.status !== "ACTIVE" && membership.status !== "PENDING") {
    throw new HttpError(409, "Esa persona no se puede editar en este estado.");
  }

  const touchesIdentity =
    input.name !== undefined || input.phone !== undefined || input.email !== undefined;
  const shared = await userIsSharedAccount(membership.userId, input.auth.tenantId);
  if (touchesIdentity && shared) {
    throw new HttpError(409, SHARED_ACCOUNT_MESSAGE, "SHARED_ACCOUNT");
  }

  let nextEmail = membership.user.email;
  let nextPhone = membership.user.phone;
  if (input.email !== undefined) {
    if (!input.email.trim()) {
      nextEmail = null;
    } else {
      const parsed = normalizeEmail(input.email);
      if (!parsed.ok) throw new HttpError(400, "Revisá el correo.");
      nextEmail = parsed.value;
    }
  }
  if (input.phone !== undefined) {
    if (!input.phone.trim()) {
      nextPhone = null;
    } else {
      const parsed = normalizePhone(input.phone);
      if (!parsed.ok) throw new HttpError(400, PHONE_INVALID_MESSAGE);
      nextPhone = parsed.value;
    }
  }
  if (!nextEmail && !nextPhone) {
    throw new HttpError(400, "Tiene que quedar un correo o un teléfono.");
  }
  if (nextEmail && nextEmail !== membership.user.email) {
    const taken = await prisma.user.findUnique({ where: { email: nextEmail } });
    if (taken && taken.id !== membership.userId) {
      throw new HttpError(409, IDENTITY_TAKEN_MESSAGE, "IDENTITY_TAKEN");
    }
  }
  if (nextPhone && nextPhone !== membership.user.phone) {
    const taken = await prisma.user.findUnique({ where: { phone: nextPhone } });
    if (taken && taken.id !== membership.userId) {
      throw new HttpError(409, IDENTITY_TAKEN_MESSAGE, "IDENTITY_TAKEN");
    }
  }

  let nextRole: Role | undefined;
  if (input.role !== undefined) {
    if (input.role !== "TAMBERO" && input.role !== "VETERINARIO") {
      throw new HttpError(400, "Solo se puede asignar tambero o veterinario.");
    }
    nextRole = input.role;
  }

  if (input.tamboIds) {
    if (input.tamboIds.length < 1) {
      throw new HttpError(400, "Tiene que quedar al menos un tambo.");
    }
    const unique = [...new Set(input.tamboIds)];
    for (const tamboId of unique) {
      await requireTamboInTenant(input.auth, tamboId);
    }
  }

  const roleChanged = nextRole !== undefined && (membership.roles.length !== 1 || membership.roles[0] !== nextRole);
  const tambosChanged =
    input.tamboIds !== undefined &&
    (() => {
      const current = new Set(membership.tambos.map((t) => t.tamboId));
      const next = new Set(input.tamboIds);
      if (current.size !== next.size) return true;
      for (const id of next) if (!current.has(id)) return true;
      return false;
    })();

  const cutSessions = membership.status === "ACTIVE" && (roleChanged || tambosChanged);

  await prisma.$transaction(async (tx) => {
    if (touchesIdentity) {
      const patch: Prisma.UserUpdateInput = {};
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new HttpError(400, "Poné el nombre.");
        patch.name = name;
      }
      if (input.email !== undefined) patch.email = nextEmail;
      if (input.phone !== undefined) patch.phone = nextPhone;
      if (Object.keys(patch).length > 0) {
        await tx.user.update({ where: { id: membership.userId }, data: patch });
      }
    }
    const memPatch: Prisma.MembershipUpdateInput = {};
    if (nextRole) memPatch.roles = [nextRole];
    if (cutSessions) memPatch.sessionsValidAfter = new Date();
    if (Object.keys(memPatch).length > 0) {
      await tx.membership.update({ where: { id: membership.id }, data: memPatch });
    }
    if (input.tamboIds) {
      const unique = [...new Set(input.tamboIds)];
      await tx.membershipTambo.deleteMany({ where: { membershipId: membership.id } });
      await tx.membershipTambo.createMany({
        data: unique.map((tamboId) => ({
          tenantId: input.auth.tenantId,
          membershipId: membership.id,
          tamboId,
        })),
      });
    }
  });

  if (cutSessions) invalidateAccess(membership.userId, input.auth.tenantId);

  const updated = await prisma.membership.findUniqueOrThrow({
    where: { id: membership.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      tambos: { select: { tamboId: true } },
    },
  });
  return serializeItem(updated, {
    callerUserId: input.auth.userId,
    sharedAccount: await userIsSharedAccount(updated.userId, input.auth.tenantId),
  });
}

export async function revokeMembership(input: { auth: AuthContext; membershipId: string }) {
  const membership = await loadTenantMembership(input.auth.tenantId, input.membershipId);
  assertManageable(membership, input.auth.userId);
  if (membership.status !== "ACTIVE") {
    throw new HttpError(409, "Solo se puede dar de baja a alguien que está activo.");
  }
  const now = new Date();
  await prisma.membership.update({
    where: { id: membership.id },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revokedById: input.auth.userId,
      sessionsValidAfter: now,
      inviteToken: null,
      inviteTokenExpiresAt: null,
    },
  });
  invalidateAccess(membership.userId, input.auth.tenantId);
  const updated = await prisma.membership.findUniqueOrThrow({
    where: { id: membership.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      tambos: { select: { tamboId: true } },
    },
  });
  return serializeItem(updated, {
    callerUserId: input.auth.userId,
    sharedAccount: await userIsSharedAccount(updated.userId, input.auth.tenantId),
  });
}

export async function reactivateMembership(input: { auth: AuthContext; membershipId: string }) {
  const membership = await loadTenantMembership(input.auth.tenantId, input.membershipId);
  assertManageable(membership, input.auth.userId);
  if (membership.status !== "REVOKED") {
    throw new HttpError(409, "Esa persona no está dada de baja.");
  }
  if (!membership.user.passwordHash) {
    throw new HttpError(409, "Esa persona no llegó a crear su clave: creá una invitación nueva.");
  }
  await prisma.membership.update({
    where: { id: membership.id },
    data: { status: "ACTIVE", revokedAt: null, revokedById: null },
  });
  invalidateAccess(membership.userId, input.auth.tenantId);
  const updated = await prisma.membership.findUniqueOrThrow({
    where: { id: membership.id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      tambos: { select: { tamboId: true } },
    },
  });
  return serializeItem(updated, {
    callerUserId: input.auth.userId,
    sharedAccount: await userIsSharedAccount(updated.userId, input.auth.tenantId),
  });
}

export async function cancelInvite(input: { auth: AuthContext; membershipId: string }) {
  const membership = await loadTenantMembership(input.auth.tenantId, input.membershipId);
  assertManageable(membership, input.auth.userId);
  if (membership.status !== "PENDING") {
    throw new HttpError(409, "Esa invitación ya no está pendiente.");
  }
  const userId = membership.userId;
  await prisma.membershipTambo.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membership.delete({ where: { id: membership.id } });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && !user.passwordHash) {
    const other = await prisma.membership.count({ where: { userId } });
    if (other === 0) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch {
        // Conservar si tiene registros propios.
      }
    }
  }
}
