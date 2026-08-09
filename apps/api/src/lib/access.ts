import type { Membership, Role } from "@prisma/client";

/** Dueño/admin ven todos los tambos del tenant. */
export function hasAllTamboAccess(roles: Role[]): boolean {
  return roles.includes("DUENIO") || roles.includes("ADMIN");
}

export function resolveTamboIds(
  membership: Membership & { tambos: { tamboId: string }[] },
): string[] | null {
  if (hasAllTamboAccess(membership.roles)) {
    return null;
  }
  return membership.tambos.map((t) => t.tamboId);
}

/** Valida que el tambo esté permitido para el auth actual. */
export function assertTamboAccess(
  tamboIds: string[] | null,
  tamboId: string,
): void {
  if (tamboIds === null) return;
  if (!tamboIds.includes(tamboId)) {
    const err = new Error("No access to this tambo");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}
