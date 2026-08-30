export interface SupportTicket {
  id: string
  tenantId: string
  tamboId: string | null
  userId: string
  category: 'BUG' | 'QUESTION' | 'IMPROVEMENT' | 'OTHER'
  subject: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'OPEN' | 'IN_REVIEW' | 'IN_PROGRESS' | 'CLOSED'
  internalNote: string | null
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string; email?: string }
  tambo?: { id: string; name: string }
}

export interface AppPrototypeConfig {
  id: string
  tenantId: string | null
  name: string
  version: string | null
  codeUrl: string | null
  prototypeUrl: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}
