import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AdminPlan } from '../types/dashboard'

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
      <h3 className="text-lg font-semibold text-gray-900">Planes</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">{plan.name} ({plan.code})</h4>
                  {plan.priceUsd ? (
                    <p className="text-sm text-gray-600 mt-1">
                      USD {plan.priceUsd} → $ {plan.priceArs} ARS
                      {plan.fxRate ? ` (dólar oficial $${plan.fxRate})` : ''}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1">Sin costo</p>
                  )}
                  {plan.priceArsUpdatedAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Actualizado: {new Date(plan.priceArsUpdatedAt).toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    plan.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {plan.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3">
                {editingId === plan.id ? (
                  <>
                    <input
                      type="number"
                      step="0.01"
                      value={priceDraft}
                      onChange={(e) => setPriceDraft(e.target.value)}
                      placeholder="Precio en USD"
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-32"
                    />
                    <button
                      onClick={() => savePrice(plan.id)}
                      disabled={saving}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEdit(plan)}
                    className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                  >
                    Editar precio (USD)
                  </button>
                )}
                <button
                  onClick={() => toggleActive(plan)}
                  disabled={saving}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  {plan.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
