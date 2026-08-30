const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const api = {
  async login(email: string, password: string, tenantId?: string) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantId }),
    })
    if (!res.ok) throw new Error('Login failed')
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
}
