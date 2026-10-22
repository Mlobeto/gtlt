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
  tenant?: { id: string; name: string }
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
  activeTambos?: number
  installingTambos?: number
  owner: { id: string; name: string; email: string | null } | null
  tambos?: {
    id: string
    name: string
    state: 'ACTIVE' | 'INSTALLING' | 'ARCHIVED'
    bajadaCount: number
    pumpCount: number
    powerSupply: 'MONOPHASE' | 'THREEPHASE' | null
    defaultServiceProvider: { id: string; name: string } | null
    providerSince: string | null
  }[]
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
  electronicId?: string | null
  photoUrl?: string | null
  notes?: string | null
  enteredAt?: string | null
  motherId?: string | null
  sireId?: string | null
}

export interface TimelineItem {
  kind: string
  id: string
  at: string
  type: string
  summary: string
  notes: string | null
  liters?: number
  bajadaNumber?: number
  photoUrl?: string | null
  milkWithdrawalUntil?: string | null
  expectedCalvingAt?: string | null
  productName?: string | null
}

export type AnimalAlertCode =
  | 'DRY_OFF'
  | 'CALVING_SOON'
  | 'CALVING_OVERDUE'
  | 'PREGNANCY_CHECK'
  | 'MILK_WITHDRAWAL'

export interface AnimalSummary {
  animal: Animal
  mother: { id: string; earTag: string } | null
  sire: { id: string; name: string; registrationCode: string | null } | null
  pregnancy: {
    pregnant: boolean
    servedAt: string | null
    expectedCalvingAt: string | null
    lastCalvingAt: string | null
    lastAbortionAt: string | null
  }
  lactation: {
    lactationNumber: number
    lastCalvingAt: string | null
    daysInMilk: number | null
  }
  alerts: { code: AnimalAlertCode; daysDelta: number; date: string }[]
  lastControl: { performedAt: string; liters: number; bajadaNumber: number } | null
  previousControl: { performedAt: string; liters: number; bajadaNumber: number } | null
}

export type AncestorNode =
  | {
      kind: 'ANIMAL'
      id: string
      earTag: string
      status: string
      birthDate: string | null
      breed: string | null
      photoUrl: string | null
      tamboId: string
      tamboName: string
      mother: AncestorNode
      father: AncestorNode
      truncated: boolean
    }
  | {
      kind: 'SIRE'
      sireId: string
      name: string
      registrationCode: string | null
      isExternal: boolean
    }
  | { kind: 'UNKNOWN' }

export interface OffspringRow {
  id: string
  earTag: string
  status: string
  birthDate: string | null
  breed: string | null
  photoUrl: string | null
  via: 'MOTHER' | 'SIRE'
}

export interface AnimalGenealogy {
  animal: { id: string; earTag: string }
  mother: AncestorNode
  father: AncestorNode
  offspring: OffspringRow[]
}
