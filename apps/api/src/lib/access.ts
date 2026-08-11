import type { Membership, Role } from "@prisma/client";
import { HttpError } from "./http-error.js";

/** Dueño/admin ven todos los tambos del tenant. TECNICO nunca. */
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
    throw new HttpError(403, "No access to this tambo");
  }
}
