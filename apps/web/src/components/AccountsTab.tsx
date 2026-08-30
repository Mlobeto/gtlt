import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AdminTenant } from '../types/dashboard'

interface AccountsTabProps {
  auth: AuthToken
}

const emptyForm = {
  tenantName: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  planCode: 'STANDARD' as 'STANDARD' | 'LIFETIME',
}

export function AccountsTab({ auth }: AccountsTabProps) {
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchTenants = async () => {
    try {
      setLoading(true)
      const result = await api.getAdminTenants(auth.token)
      setTenants(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cuentas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      await api.createAdminTenant(auth.token, formData)
      setFormData(emptyForm)
      setShowForm(false)
      await fetchTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cuenta')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePlanChange = async (tenantId: string, planCode: 'STANDARD' | 'LIFETIME') => {
    try {
      setSavingId(tenantId)
      await api.updateAdminTenantSubscription(auth.token, tenantId, { planCode })
      await fetchTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar el plan')
    } finally {
      setSavingId(null)
    }
  }

  const handleStatusChange = async (tenantId: string, status: 'ACTIVE' | 'CANCELED') => {
    try {
      setSavingId(tenantId)
      await api.updateAdminTenantSubscription(auth.token, tenantId, { status })
      await fetchTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el estado')
    } finally {
      setSavingId(null)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      PAST_DUE: 'bg-yellow-100 text-yellow-800',
      CANCELED: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Cuentas</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          {showForm ? 'Cancelar' : 'Crear cuenta'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del tambo / tenant</label>
              <input
                type="text"
                value={formData.tenantName}
                onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
                placeholder="ej. Tambo García"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del dueño</label>
              <input
                type="text"
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del dueño</label>
              <input
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña inicial</label>
              <input
                type="text"
                value={formData.ownerPassword}
                onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                placeholder="mínimo 6 caracteres"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={formData.planCode}
                onChange={(e) =>
                  setFormData({ ...formData, planCode: e.target.value as 'STANDARD' | 'LIFETIME' })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              >
                <option value="STANDARD">Estándar (pago)</option>
                <option value="LIFETIME">Lifetime (gratis de por vida)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No hay cuentas todavía</div>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                  <p className="text-sm text-gray-600">
                    {tenant.owner ? `${tenant.owner.name} · ${tenant.owner.email}` : 'Sin dueño asignado'}
                  </p>
                </div>
                {tenant.subscription && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(tenant.subscription.status)}`}>
                    {tenant.subscription.status}
                  </span>
                )}
              </div>

              {tenant.subscription && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                  <span className="text-gray-600">
                    Plan: <strong>{tenant.subscription.plan.name}</strong>
                    {tenant.subscription.plan.priceUsd
                      ? ` · USD ${tenant.subscription.plan.priceUsd} (≈ $${tenant.subscription.plan.priceArs} ARS)`
                      : ' · sin costo'}
                  </span>

                  <select
                    value={tenant.subscription.plan.code}
                    onChange={(e) =>
                      handlePlanChange(tenant.id, e.target.value as 'STANDARD' | 'LIFETIME')
                    }
                    disabled={savingId === tenant.id}
                    className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 text-sm"
                  >
                    <option value="STANDARD">Estándar</option>
                    <option value="LIFETIME">Lifetime</option>
                  </select>

                  {tenant.subscription.status === 'CANCELED' ? (
                    <button
                      onClick={() => handleStatusChange(tenant.id, 'ACTIVE')}
                      disabled={savingId === tenant.id}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      Reactivar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(tenant.id, 'CANCELED')}
                      disabled={savingId === tenant.id}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
                    >
                      Dar de baja
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
