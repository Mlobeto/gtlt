export interface AuthToken {
  token: string
  userId: string
  tenantId: string
  roles: string[]
}

/** Únicos roles con acceso al panel web: dueño del tambo y desarrolladora. */
export const WEB_ALLOWED_ROLES = ['DUENIO', 'DESARROLLADORA'] as const

export interface User {
  id: string
  email: string
  name: string
}
