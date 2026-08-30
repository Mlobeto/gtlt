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

export interface AdminPlan {
  id: string
  code: 'STANDARD' | 'LIFETIME'
  name: string
  priceUsd: string | null
  priceArs: number
  fxRate: string | null
  fxRateSource: string | null
  priceArsUpdatedAt: string | null
  billingIntervalMonths: number | null
  active: boolean
}

export interface AdminTenant {
  id: string
  name: string
  createdAt: string
  owner: { id: string; name: string; email: string | null } | null
  subscription: {
    id: string
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
    currentPeriodEnd: string | null
    plan: { code: 'STANDARD' | 'LIFETIME'; name: string; priceUsd: string | null; priceArs: number }
  } | null
}

export interface Tambo {
  id: string
  name: string
  bajadaCount: number
}

export interface Animal {
  id: string
  tamboId: string
  earTag: string
  status: 'ACTIVE' | 'DRY' | 'SOLD' | 'DEAD'
  birthDate: string | null
  breed?: string | null
}

export interface TimelineItem {
  kind: string
  id: string
  at: string
  type: string
  summary: string
  notes: string | null
}
