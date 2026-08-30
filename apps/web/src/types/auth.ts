export interface AuthToken {
  token: string
  userId: string
  tenantId: string
  roles: string[]
}

export interface User {
  id: string
  email: string
  name: string
}
