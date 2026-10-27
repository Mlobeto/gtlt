export function isOwnerOrAdmin(roles: string[]): boolean {
  return roles.includes("DUENIO") || roles.includes("ADMIN");
}

/** Dueño/admin que no ordeña ni es veterinario: menú de supervisión. */
export function ownerOnly(roles: string[]): boolean {
  if (!isOwnerOrAdmin(roles)) return false;
  return !roles.includes("TAMBERO") && !roles.includes("VETERINARIO");
}
