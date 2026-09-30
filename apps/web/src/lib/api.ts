const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

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

  async getTambos(token: string) {
    const res = await fetch(`${API_URL}/tambos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'No se pudieron cargar los tambos')
    }
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
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || 'Failed to invite member')
    }
    return res.json()
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
