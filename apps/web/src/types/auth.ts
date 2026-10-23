export interface AuthToken {
  token: string
  userId: string
  tenantId: string
  roles: string[]
  mustChangePassword?: boolean
}

/** Roles con acceso al panel web: dueño, desarrolladora y técnico. */
export const WEB_ALLOWED_ROLES = ['DUENIO', 'DESARROLLADORA', 'TECNICO'] as const

export interface User {
  id: string
  email: string | null
  phone?: string | null
  name: string
}

/** Dueño/desarrolladora ganan al técnico si una cuenta mezclara roles. */
export function isTechnicianWebSession(roles: string[]) {
  const hasOwnerOrDev = roles.includes('DUENIO') || roles.includes('DESARROLLADORA')
  return roles.includes('TECNICO') && !hasOwnerOrDev
}
