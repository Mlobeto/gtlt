import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AdminTenant } from '../types/dashboard'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, inputClass, type BadgeTone } from './ui'

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

  const getStatusTone = (status: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      ACTIVE: 'ok',
      PAST_DUE: 'warn',
      CANCELED: 'danger',
    }
    return tones[status] || 'neutral'
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : 'Crear cuenta'}</Button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {showForm && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Nombre del tambo / tenant"
                type="text"
                value={formData.tenantName}
                onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
                placeholder="ej. Tambo García"
                required
              />
              <Field
                label="Nombre del dueño"
                type="text"
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                required
              />
              <Field
                label="Email del dueño"
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                required
              />
              <Field
                label="Contraseña inicial"
                type="text"
                value={formData.ownerPassword}
                onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                placeholder="mínimo 6 caracteres"
                required
              />
              <SelectField
                label="Plan"
                value={formData.planCode}
                onChange={(e) =>
                  setFormData({ ...formData, planCode: e.target.value as 'STANDARD' | 'LIFETIME' })
                }
              >
                <option value="STANDARD">Estándar (pago)</option>
                <option value="LIFETIME">Lifetime (gratis de por vida)</option>
              </SelectField>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creando...' : 'Crear cuenta'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState>No hay cuentas todavía</EmptyState>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{tenant.name}</h3>
                  <p className="text-sm text-ink-muted break-all">
                    {tenant.owner ? `${tenant.owner.name} · ${tenant.owner.email}` : 'Sin dueño asignado'}
                  </p>
                </div>
                {tenant.subscription && (
                  <Badge tone={getStatusTone(tenant.subscription.status)}>
                    {tenant.subscription.status}
                  </Badge>
                )}
              </div>

              {tenant.subscription && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                  <span className="text-ink-muted">
                    Plan: <strong className="text-ink">{tenant.subscription.plan.name}</strong>
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
                    className={`${inputClass} w-auto py-1.5 text-sm`}
                  >
                    <option value="STANDARD">Estándar</option>
                    <option value="LIFETIME">Lifetime</option>
                  </select>

                  {tenant.subscription.status === 'CANCELED' ? (
                    <Button
                      onClick={() => handleStatusChange(tenant.id, 'ACTIVE')}
                      disabled={savingId === tenant.id}
                    >
                      Reactivar
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => handleStatusChange(tenant.id, 'CANCELED')}
                      disabled={savingId === tenant.id}
                    >
                      Dar de baja
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
