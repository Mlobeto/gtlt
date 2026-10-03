import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AdminPlan } from '../types/dashboard'
import { Badge, Button, Card, ErrorBanner, inputClass } from './ui'

interface PlansTabProps {
  auth: AuthToken
}

export function PlansTab({ auth }: PlansTabProps) {
  const [plans, setPlans] = useState<AdminPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [priceDraft, setPriceDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchPlans = async () => {
    try {
      setLoading(true)
      const result = await api.getAdminPlans(auth.token)
      setPlans(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar planes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  const startEdit = (plan: AdminPlan) => {
    setEditingId(plan.id)
    setPriceDraft(plan.priceUsd ?? '')
  }

  const savePrice = async (planId: string) => {
    try {
      setSaving(true)
      await api.updateAdminPlan(auth.token, planId, {
        priceUsd: priceDraft === '' ? null : Number(priceDraft),
      })
      setEditingId(null)
      await fetchPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el precio')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (plan: AdminPlan) => {
    try {
      setSaving(true)
      await api.updateAdminPlan(auth.token, plan.id, { active: !plan.active })
      await fetchPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold text-ink">{plan.name} ({plan.code})</h4>
                  {plan.priceUsd ? (
                    <p className="text-sm text-ink-muted mt-1">
                      USD {plan.priceUsd} → $ {plan.priceArs} ARS
                      {plan.fxRate ? ` (dólar oficial $${plan.fxRate})` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-muted mt-1">Sin costo</p>
                  )}
                  {plan.priceArsUpdatedAt && (
                    <p className="text-xs text-ink-muted mt-1">
                      Actualizado: {new Date(plan.priceArsUpdatedAt).toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
                <Badge tone={plan.active ? 'ok' : 'neutral'}>{plan.active ? 'Activo' : 'Inactivo'}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {editingId === plan.id ? (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      value={priceDraft}
                      onChange={(e) => setPriceDraft(e.target.value)}
                      placeholder="Precio en USD"
                      className={`${inputClass} w-32`}
                    />
                    <Button onClick={() => savePrice(plan.id)} disabled={saving}>
                      Guardar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => startEdit(plan)}>
                    Editar precio (USD)
                  </Button>
                )}
                <Button variant="ghost" onClick={() => toggleActive(plan)} disabled={saving}>
                  {plan.active ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
