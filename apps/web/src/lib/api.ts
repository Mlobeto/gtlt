const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export class ApiError extends Error {
  status: number
  code?: string
  body?: unknown

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

async function toApiError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return new ApiError(body?.error || fallback, res.status, body?.code, body)
}

export type AcceptedInvite = {
  item: {
    id: string
    roles: string[]
    tenant: { id: string; name: string }
    tambos: { tamboId: string }[]
    user: { id: string; email: string | null; name: string }
  }
}

export type AdminInstaller = {
  id: string
  canInstallDevices: boolean
  tenant: { id: string; name: string }
  user: { id: string; name: string; email: string | null }
  serviceProvider: { id: string; name: string } | null
}

export type BillingSummary = {
  activeTambos: number
  installingTambos: number
  unitPriceArs: number
  monthlyTotalArs: number
  nextTotalArs: number
  planName: string
  courtesy: boolean
}

export type TamboLifecycleState = 'ACTIVE' | 'INSTALLING' | 'ARCHIVED'

export type TamboHardware = {
  pumpSensor: boolean
  flowMeters: boolean
  rfidReaders: boolean
}

export type EquipmentLine = {
  kind: DeviceKind
  label: string
  quantity: number
}

export type TamboRequestStatus =
  | 'SENT'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONVERTED'

export type QuoteItem = {
  description: string
  quantity: number
  unitPrice: number
  currency: string
}

export type PowerSupply = 'MONOPHASE' | 'THREEPHASE'

export type PartFieldKind = 'TEXT' | 'NUMBER' | 'SELECT' | 'BOOLEAN'

export type PartTypeField = {
  id: string
  partTypeId: string
  key: string
  label: string
  kind: PartFieldKind
  unit: string | null
  options: string[]
  required: boolean
  min: number | null
  max: number | null
  helpText: string | null
  sortOrder: number
  active: boolean
}

export type TamboRequestItem = {
  id: string
  tenantId: string
  name: string
  address: string | null
  bajadaCount: number
  hardware: TamboHardware
  equipmentList: EquipmentLine[]
  serviceProviderId: string | null
  notes: string | null
  powerSupply?: PowerSupply | null
  status: TamboRequestStatus
  quoteItems: QuoteItem[] | null
  quoteTotal: number | null
  quoteCurrency: string | null
  quoteValidUntil: string | null
  quoteNotes: string | null
  quotedAt: string | null
  rejectionReason: string | null
  tamboId: string | null
  createdAt: string
  serviceProvider?: { id: string; name: string } | null
  requestedBy?: { id: string; name: string; email: string | null }
  quotedBy?: { id: string; name: string; email: string | null } | null
  tambo?: { id: string; name: string; active: boolean; activatedAt: string | null } | null
  tenant?: { id: string; name: string }
}

export type InstallingTambo = {
  id: string
  tenantId: string
  tenant: { id: string; name: string }
  name: string
  address: string | null
  bajadaCount: number
  powerSupply?: PowerSupply | null
  active: boolean
  activatedAt: string | null
  state: TamboLifecycleState
  activeDevices: number
  connectedDevices: number
  devices: { id: string; kind: DeviceKind; label: string | null; lastSeenAt: string | null; connected: boolean }[]
}

export type DeviceKind = 'VACUUM_PUMP_SENSOR' | 'FLOW_METER' | 'RFID_READER'

export type PartLifeStatus = 'OK' | 'SOON' | 'OVERDUE'

export type PartLife = {
  kind: 'NONE' | 'USAGE_BASED'
  status?: PartLifeStatus
  percent?: number
  byUsage?: { percent: number; milkings: number; threshold: number; usageSource: 'COUNTED' | 'ESTIMATED' }
  byTime?: { percent: number; days: number; lifeDays: number; lifeMonths: number }
  estimatedReplacementDate?: string | null
}

export type PartInstanceItem = {
  id: string
  bajadaNumber: number | null
  installedAt: string
  installedAtApprox?: boolean
  partType: { id: string; name: string; pattern: string }
  life?: PartLife
}

export type PartTypeConfigItem = {
  partTypeId: string
  code: string
  name: string
  defaultUsageThreshold: number | null
  defaultLifeMonths: number | null
  tenantUsageThreshold: number | null
  tenantLifeMonths: number | null
  effectiveUsageThreshold: number | null
  effectiveLifeMonths: number | null
}

export type AdminPartType = {
  id: string
  code: string
  name: string
  description: string | null
  pattern: 'REACTIVE' | 'USAGE_BASED' | 'BRANDED'
  appliesPerBajada: boolean
  defaultUsageThreshold: number | null
  defaultLifeMonths: number | null
  sortOrder: number
  active: boolean
  installedCount: number
  fields?: PartTypeField[]
}

export type DeviceItem = {
  id: string
  tamboId: string
  kind: DeviceKind
  bajadaNumber: number | null
  label: string | null
  lastSeenAt: string | null
  connected: boolean
  createdAt: string
}

export const api = {
  async login(email: string, password: string, tenantId?: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantId }),
    })
    const body = await res.json().catch(() => null)
    if (res.status === 400 && body?.error === 'tenantId required' && Array.isArray(body.tenants)) {
      const err = new Error('tenantId required') as Error & {
        code: 'TENANT_REQUIRED'
        tenants: { id: string; name: string; roles: string[] }[]
      }
      err.code = 'TENANT_REQUIRED'
      err.tenants = body.tenants
      throw err
    }
    if (!res.ok) throw new Error(body?.error || 'Login failed')
    return body
  },

  async getMe(token: string) {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Error al obtener el usuario')
    return res.json()
  },

  async getSupportTickets(token: string, status?: string) {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    const res = await fetch(`${API_URL}/support-tickets?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch tickets')
    return res.json()
  },

  async createSupportTicket(token: string, data: any) {
    const res = await fetch(`${API_URL}/support-tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create ticket')
    return res.json()
  },

  async updateSupportTicket(token: string, id: string, data: any) {
    const res = await fetch(`${API_URL}/support-tickets/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update ticket')
    return res.json()
  },

  async getAppPrototypeConfigs(token: string) {
    const res = await fetch(`${API_URL}/app-prototype-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch configs')
    return res.json()
  },

  async createAppPrototypeConfig(token: string, data: any) {
    const res = await fetch(`${API_URL}/app-prototype-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create config')
    return res.json()
  },

  async updateAppPrototypeConfig(token: string, id: string, data: any) {
    const res = await fetch(`${API_URL}/app-prototype-config/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update config')
    return res.json()
  },

  async getAdminInstallers(token: string, tenantId: string) {
    const res = await fetch(
      `${API_URL}/admin/installers?tenantId=${encodeURIComponent(tenantId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar los técnicos')
    return res.json() as Promise<{ items: AdminInstaller[] }>
  },

  async updateAdminInstaller(token: string, membershipId: string, enabled: boolean) {
    const res = await fetch(`${API_URL}/admin/memberships/${membershipId}/installer`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar el permiso de instalador')
    return res.json() as Promise<{ item: AdminInstaller }>
  },

  async getAdminTenants(token: string) {
    const res = await fetch(`${API_URL}/admin/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch accounts')
    return res.json()
  },

  async createAdminTenant(token: string, data: any) {
    const res = await fetch(`${API_URL}/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to create account')
    }
    return res.json()
  },

  async updateAdminTenantSubscription(token: string, tenantId: string, data: any) {
    const res = await fetch(`${API_URL}/admin/tenants/${tenantId}/subscription`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update subscription')
    return res.json()
  },

  async getAdminPlans(token: string) {
    const res = await fetch(`${API_URL}/admin/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch plans')
    return res.json()
  },

  async updateAdminPlan(token: string, planId: string, data: any) {
    const res = await fetch(`${API_URL}/admin/plans/${planId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update plan')
    return res.json()
  },

  async getTambos(token: string, includeArchived = false) {
    const q = includeArchived ? '?includeArchived=1' : ''
    const res = await fetch(`${API_URL}/tambos${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar los tambos')
    }
    return res.json() as Promise<{
      items: {
        id: string
        name: string
        bajadaCount: number
        active: boolean
        activatedAt?: string | null
        state?: TamboLifecycleState
        serviceRequiresOwnerApproval?: boolean
        latitude?: number | null
        longitude?: number | null
        address?: string | null
      }[]
    }>
  },

  async getBillingSummary(token: string) {
    const res = await fetch(`${API_URL}/tambos/billing-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cargar el resumen de costo')
    return res.json() as Promise<BillingSummary>
  },

  async getEquipmentPreview(
    token: string,
    query: { bajadaCount: number } & TamboHardware,
  ) {
    const params = new URLSearchParams({
      bajadaCount: String(query.bajadaCount),
      pumpSensor: String(query.pumpSensor),
      flowMeters: String(query.flowMeters),
      rfidReaders: String(query.rfidReaders),
    })
    const res = await fetch(`${API_URL}/tambo-requests/equipment-preview?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo calcular el listado de equipos')
    return res.json() as Promise<{ items: EquipmentLine[]; hardware: TamboHardware }>
  },

  async getTamboRequests(token: string) {
    const res = await fetch(`${API_URL}/tambo-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar los pedidos')
    return res.json() as Promise<{
      items: TamboRequestItem[]
      serviceProviders: { id: string; name: string }[]
    }>
  },

  async createTamboRequest(
    token: string,
    data: {
      name: string
      address?: string
      bajadaCount: number
      hardware: TamboHardware
      serviceProviderId?: string | null
      notes?: string
      powerSupply?: PowerSupply | null
    },
  ) {
    const res = await fetch(`${API_URL}/tambo-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo enviar el pedido')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async acceptTamboRequest(token: string, id: string) {
    const res = await fetch(`${API_URL}/tambo-requests/${id}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo aceptar la cotización')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async declineTamboRequest(token: string, id: string, reason?: string) {
    const res = await fetch(`${API_URL}/tambo-requests/${id}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo rechazar la cotización')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async cancelTamboRequest(token: string, id: string) {
    const res = await fetch(`${API_URL}/tambo-requests/${id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cancelar el pedido')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async getAdminTamboRequests(token: string, query?: { status?: TamboRequestStatus; tenantId?: string }) {
    const params = new URLSearchParams()
    if (query?.status) params.set('status', query.status)
    if (query?.tenantId) params.set('tenantId', query.tenantId)
    const q = params.toString() ? `?${params}` : ''
    const res = await fetch(`${API_URL}/admin/tambo-requests${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar los pedidos')
    return res.json() as Promise<{ items: TamboRequestItem[] }>
  },

  async getAdminTamboRequest(token: string, id: string) {
    const res = await fetch(`${API_URL}/admin/tambo-requests/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cargar el pedido')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async quoteAdminTamboRequest(
    token: string,
    id: string,
    data: {
      quoteItems: QuoteItem[]
      quoteTotal: number
      quoteCurrency: string
      quoteValidUntil?: string | null
      quoteNotes?: string | null
    },
  ) {
    const res = await fetch(`${API_URL}/admin/tambo-requests/${id}/quote`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cargar la cotización')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async rejectAdminTamboRequest(token: string, id: string, reason: string) {
    const res = await fetch(`${API_URL}/admin/tambo-requests/${id}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo rechazar el pedido')
    return res.json() as Promise<{ item: TamboRequestItem }>
  },

  async createAdminTambo(token: string, requestId: string) {
    const res = await fetch(`${API_URL}/admin/tambos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo crear el tambo')
    return res.json()
  },

  async activateAdminTambo(token: string, id: string) {
    const res = await fetch(`${API_URL}/admin/tambos/${id}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo activar el tambo')
    return res.json()
  },

  async getAdminInstallingTambos(token: string) {
    const res = await fetch(`${API_URL}/admin/tambos?state=installing`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar los tambos en instalación')
    return res.json() as Promise<{ items: InstallingTambo[] }>
  },

  async updateTambo(
    token: string,
    tamboId: string,
    data: {
      name?: string
      bajadaCount?: number
      serviceRequiresOwnerApproval?: boolean
      powerSupply?: PowerSupply | null
    },
  ) {
    const res = await fetch(`${API_URL}/tambos/${tamboId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar el tambo')
    return res.json() as Promise<{ item: { id: string; name: string; bajadaCount: number; active: boolean } }>
  },

  async setTamboActive(token: string, tamboId: string, active: boolean) {
    const res = await fetch(`${API_URL}/tambos/${tamboId}/active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ active }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar el estado del tambo')
    return res.json() as Promise<{ item: { id: string; name: string; active: boolean }; billing: BillingSummary }>
  },

  async requestDeviceRemoval(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/tambos/${tamboId}/request-device-removal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo pedir el retiro de dispositivos')
    return res.json()
  },

  async getAnimals(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/animals?tamboId=${encodeURIComponent(tamboId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar los animales')
    }
    return res.json()
  },

  async getPumpStatus(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/tambos/${encodeURIComponent(tamboId)}/pump-status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo cargar el estado de la bomba')
    }
    return res.json() as Promise<{
      status: 'ON' | 'OFF' | null
      item?: { occurredAt: string; status: 'ON' | 'OFF' }
    }>
  },

  async getPumpStatusHistory(token: string, tamboId: string, from: string, to: string) {
    const params = new URLSearchParams({ from, to })
    const res = await fetch(
      `${API_URL}/tambos/${encodeURIComponent(tamboId)}/pump-status/history?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo cargar el historial de la bomba')
    }
    return res.json() as Promise<{
      intervals: {
        deviceId: string
        start: string
        end: string | null
        durationMinutes: number | null
        ongoing: boolean
      }[]
    }>
  },

  async getAnimalTimeline(token: string, animalId: string) {
    const res = await fetch(`${API_URL}/animals/${animalId}/timeline`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch animal timeline')
    return res.json()
  },

  async getAdminSupportTickets(token: string, status?: string) {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    const res = await fetch(`${API_URL}/admin/support-tickets?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch tickets')
    return res.json()
  },

  async updateAdminSupportTicket(token: string, id: string, data: any) {
    const res = await fetch(`${API_URL}/admin/support-tickets/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update ticket')
    return res.json()
  },

  async getTeam(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/memberships?tamboId=${encodeURIComponent(tamboId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch team')
    return res.json()
  },

  async inviteMember(
    token: string,
    data: { tamboId: string; email?: string; phone?: string; name?: string; role: 'TAMBERO' | 'VETERINARIO' },
  ) {
    const res = await fetch(`${API_URL}/memberships/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'Failed to invite member')
    return res.json() as Promise<{ item: { id: string }; inviteToken: string | null }>
  },

  async acceptInviteRegister(data: { inviteToken: string; password: string; name?: string }) {
    const res = await fetch(`${API_URL}/memberships/accept-invite/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo activar la invitación')
    return res.json() as Promise<AcceptedInvite>
  },

  async acceptInvite(token: string, inviteToken: string) {
    const res = await fetch(`${API_URL}/memberships/accept-invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inviteToken }),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo aceptar la invitación')
    return res.json() as Promise<AcceptedInvite>
  },

  async getTamboServiceProvider(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/tambos/${tamboId}/service-provider`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch service provider')
    return res.json()
  },

  async updateTamboServiceProvider(token: string, tamboId: string, serviceProviderId: string) {
    const res = await fetch(`${API_URL}/tambos/${tamboId}/service-provider`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ serviceProviderId }),
    })
    if (!res.ok) throw new Error('Failed to update service provider')
    return res.json()
  },

  async getAdminServiceProviders(token: string) {
    const res = await fetch(`${API_URL}/admin/service-providers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch service providers')
    return res.json()
  },

  async getTechnicianWorkspace(token: string, tamboId: string) {
    const res = await fetch(
      `${API_URL}/service-requests/workspace?tamboId=${encodeURIComponent(tamboId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo cargar el workspace del técnico')
    }
    return res.json()
  },

  async updateServiceRequest(
    token: string,
    id: string,
    data: { status?: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED' },
  ) {
    const res = await fetch(`${API_URL}/service-requests/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo actualizar el pedido')
    }
    return res.json()
  },

  async getMyServiceRequests(token: string) {
    const res = await fetch(`${API_URL}/my/service-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar tus pedidos')
    }
    return res.json() as Promise<{
      items: {
        id: string
        category: string
        status: string
        urgency: string
        description: string
        createdAt: string
        tenant: { id: string; name: string }
        tambo: {
          id: string
          name: string
          latitude: number | null
          longitude: number | null
          address: string | null
        }
      }[]
    }>
  },

  async switchTenant(token: string, tenantId: string) {
    const res = await fetch(`${API_URL}/auth/switch-tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo cambiar de tambo')
    }
    return res.json()
  },

  async getServiceRequests(token: string, tamboId: string, status?: string) {
    const params = new URLSearchParams({ tamboId })
    if (status) params.set('status', status)
    const res = await fetch(`${API_URL}/service-requests?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar los pedidos de service')
    }
    return res.json()
  },

  async approveServiceRequest(token: string, id: string) {
    const res = await fetch(`${API_URL}/service-requests/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo aprobar el pedido')
    }
    return res.json()
  },

  async rejectServiceRequest(token: string, id: string) {
    const res = await fetch(`${API_URL}/service-requests/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo rechazar el pedido')
    }
    return res.json()
  },

  async getPendingPhotos(token: string, tamboId: string) {
    const res = await fetch(
      `${API_URL}/tambos/${encodeURIComponent(tamboId)}/photos/pending-review`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar las fotos pendientes')
    }
    return res.json()
  },

  async getDevices(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/devices?tamboId=${encodeURIComponent(tamboId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar los dispositivos')
    return res.json() as Promise<{
      items: DeviceItem[]
      canManage: boolean
      tambo: { id: string; bajadaCount: number } | null
    }>
  },

  async createDevice(
    token: string,
    data: {
      tamboId: string
      kind: DeviceKind
      bajadaNumber?: number | null
      label?: string | null
    },
  ) {
    const res = await fetch(`${API_URL}/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo instalar el dispositivo')
    return res.json() as Promise<{ item: DeviceItem; deviceToken: string }>
  },

  async rotateDeviceToken(token: string, id: string) {
    const res = await fetch(`${API_URL}/devices/${id}/rotate-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo generar la clave nueva')
    return res.json() as Promise<{ item: DeviceItem; deviceToken: string }>
  },

  async retireDevice(token: string, id: string) {
    const res = await fetch(`${API_URL}/devices/${id}/retire`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo retirar el dispositivo')
    return res.json() as Promise<{ item: DeviceItem }>
  },

  async getPartInstances(token: string, tamboId: string) {
    const res = await fetch(`${API_URL}/part-instances?tamboId=${encodeURIComponent(tamboId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudieron cargar las piezas')
    return res.json() as Promise<{ items: PartInstanceItem[] }>
  },

  async getPartTypeConfig(token: string) {
    const res = await fetch(`${API_URL}/part-type-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cargar la vida útil')
    return res.json() as Promise<{ items: PartTypeConfigItem[] }>
  },

  async putPartTypeConfig(
    token: string,
    partTypeId: string,
    data: { usageThreshold?: number | null; lifeMonths?: number | null },
  ) {
    const res = await fetch(`${API_URL}/part-type-config/${partTypeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo guardar el umbral')
    return res.json()
  },

  async deletePartTypeConfig(token: string, partTypeId: string) {
    const res = await fetch(`${API_URL}/part-type-config/${partTypeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo volver al valor por defecto')
    return res.json()
  },

  async getAdminPartTypes(token: string) {
    const res = await fetch(`${API_URL}/admin/part-types`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo cargar el catálogo')
    return res.json() as Promise<{ items: AdminPartType[] }>
  },

  async createAdminPartType(
    token: string,
    data: {
      name: string
      description?: string
      appliesPerBajada: boolean
      pattern: 'REACTIVE' | 'USAGE_BASED'
      defaultUsageThreshold?: number | null
      defaultLifeMonths?: number | null
      sortOrder?: number
    },
  ) {
    const res = await fetch(`${API_URL}/admin/part-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo crear la pieza')
    return res.json()
  },

  async updateAdminPartType(
    token: string,
    id: string,
    data: Partial<{
      name: string
      description: string | null
      appliesPerBajada: boolean
      pattern: 'REACTIVE' | 'USAGE_BASED'
      defaultUsageThreshold: number | null
      defaultLifeMonths: number | null
      sortOrder: number
      active: boolean
    }>,
  ) {
    const res = await fetch(`${API_URL}/admin/part-types/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar la pieza')
    return res.json()
  },

  async createAdminPartTypeField(
    token: string,
    partTypeId: string,
    data: {
      label: string
      kind: PartFieldKind
      unit?: string | null
      options?: string[]
      required?: boolean
      min?: number | null
      max?: number | null
      helpText?: string | null
      sortOrder?: number
    },
  ) {
    const res = await fetch(`${API_URL}/admin/part-types/${partTypeId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo crear el campo')
    return res.json() as Promise<{ item: PartTypeField }>
  },

  async updateAdminPartTypeField(
    token: string,
    partTypeId: string,
    fieldId: string,
    data: Partial<{
      label: string
      kind: PartFieldKind
      unit: string | null
      options: string[]
      required: boolean
      min: number | null
      max: number | null
      helpText: string | null
      sortOrder: number
      active: boolean
    }>,
  ) {
    const res = await fetch(`${API_URL}/admin/part-types/${partTypeId}/fields/${fieldId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar el campo')
    return res.json() as Promise<{ item: PartTypeField }>
  },

  async patchAdminTambo(token: string, id: string, data: { powerSupply: PowerSupply | null }) {
    const res = await fetch(`${API_URL}/admin/tambos/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw await toApiError(res, 'No se pudo actualizar el tambo')
    return res.json()
  },

  async reviewPhoto(token: string, animalId: string, photoId: string) {
    const res = await fetch(`${API_URL}/animals/${animalId}/photos/${photoId}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudo marcar la foto como vista')
    }
    return res.json()
  },
}
