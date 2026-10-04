/** Dueño/admin que no ordeña ni es veterinario: menú de supervisión. */
export function ownerOnly(roles: string[]): boolean {
  const owner = roles.includes("DUENIO") || roles.includes("ADMIN");
  if (!owner) return false;
  return !roles.includes("TAMBERO") && !roles.includes("VETERINARIO");
}
