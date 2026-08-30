import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type NotifyInput = {
  tenantId: string;
  userId: string;
  tamboId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Prisma.InputJsonValue;
};

export async function createNotification(input: NotifyInput) {
  return prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      tamboId: input.tamboId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {},
    },
  });
}

/** Dueños y admins ACTIVE del tenant (destinatarios típicos de pedidos de service). */
export async function listOwnerAdminUserIds(tenantId: string): Promise<string[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      OR: [{ roles: { has: "DUENIO" } }, { roles: { has: "ADMIN" } }],
    },
    select: { userId: true },
  });
  return [...new Set(memberships.map((m) => m.userId))];
}

export async function notifyOwners(
  tenantId: string,
  input: Omit<NotifyInput, "userId" | "tenantId"> & { excludeUserId?: string },
) {
  const userIds = await listOwnerAdminUserIds(tenantId);
  const targets = userIds.filter((id) => id !== input.excludeUserId);
  if (targets.length === 0) return [];

  return Promise.all(
    targets.map((userId) =>
      createNotification({
        tenantId,
        userId,
        tamboId: input.tamboId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      }),
    ),
  );
}
