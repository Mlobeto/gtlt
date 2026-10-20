import { useCallback, useEffect, useState } from 'react'
import {
  api,
  photoFileUrl,
  type MilkDeliveryComparisonItem,
} from '../lib/api'
import type { AuthToken } from '../types/auth'
import { TamboPicker, useTamboId } from './TamboPicker'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field } from './ui'

function formatMoment(date: string | null, shift: 'MORNING' | 'AFTERNOON' | null) {
  if (!date || !shift) return 'Sin momento'
  const [, m, d] = date.split('-')
  const turn = shift === 'MORNING' ? 'después de la mañana' : 'después de la tarde'
  return `${d}/${m} · ${turn}`
}

function formatSigned(n: number, suffix: string) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}${suffix}`
}

function statusBadge(item: MilkDeliveryComparisonItem) {
  const s = item.comparison.status
  if (s === 'OK') return <Badge tone="ok">OK</Badge>
  if (s === 'ALERT') return <Badge tone="danger">Diferencia grande</Badge>
  if (s === 'NO_THRESHOLD') return <Badge tone="neutral">Sin umbral</Badge>
  if (item.comparison.reason === 'FIRST_DELIVERY') {
    return <Badge tone="neutral">Es la primera entrega</Badge>
  }
  if (item.comparison.reason === 'NO_PICKUP_MOMENT') {
    return <Badge tone="neutral">Sin momento</Badge>
  }
  if (item.comparison.reason === 'MISSING_TURNS') {
    return <Badge tone="warn">Faltan turnos</Badge>
  }
  return <Badge tone="neutral">Sin comparación</Badge>
}

export function DeliveriesTab({ auth }: { auth: AuthToken }) {
  const { tamboId, setTamboId, ready, error, setError } = useTamboId(auth.token)
  const [items, setItems] = useState<MilkDeliveryComparisonItem[]>([])
  const [threshold, setThreshold] = useState('')
  const [savedThreshold, setSavedThreshold] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!tamboId) return
    try {
      setError('')
      const res = await api.getMilkDeliveryComparisons(auth.token, tamboId, 50)
      setItems(res.items)
      setSavedThreshold(res.thresholdPct)
      setThreshold(res.thresholdPct == null ? '' : String(res.thresholdPct))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las entregas')
    }
  }, [auth.token, tamboId, setError])

  useEffect(() => {
    if (!ready || !tamboId) return
    void load()
  }, [ready, tamboId, load])

  const saveThreshold = async () => {
    if (!tamboId) return
    const trimmed = threshold.trim()
    const value = trimmed === '' ? null : Number(trimmed.replace(',', '.'))
    if (value != null && (!Number.isFinite(value) || value < 0.1 || value > 50)) {
      setError('El porcentaje tiene que estar entre 0,1 y 50, o vacío.')
      return
    }
    try {
      setBusy(true)
      setError('')
      const res = await api.updateTamboDeliverySettings(auth.token, tamboId, value)
      setSavedThreshold(res.item.deliveryDiffThresholdPct)
      setStatus('Umbral guardado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el umbral')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Entregas</h2>
        <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
      </div>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {status ? (
        <div className="bg-success-soft border border-success/30 text-success-text px-4 py-3 rounded-lg text-sm">
          {status}
        </div>
      ) : null}

      <Card title="Diferencia aceptable con la fábrica (%)">
        <Field
          label="Umbral"
          hint="Si la fábrica informa más o menos que lo ordeñado por más de este porcentaje, la entrega se marca. Vacío: no se marca nada"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          placeholder="Sin marcar"
        />
        <div className="mt-3">
          <Button onClick={() => void saveThreshold()} disabled={busy || !tamboId}>
            Guardar umbral
          </Button>
        </div>
        {savedThreshold == null ? (
          <p className="text-xs text-ink-muted mt-2">Este tambo no tiene umbral: la comparación se ve, sin alerta.</p>
        ) : null}
      </Card>

      <Card title="Camión de la fábrica">
        {items.length === 0 ? (
          <EmptyState>Todavía no hay entregas.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Momento</th>
                  <th className="py-2 pr-3 font-semibold">Tanque</th>
                  <th className="py-2 pr-3 font-semibold">Camión</th>
                  <th className="py-2 pr-3 font-semibold">Ordeñado según CAL</th>
                  <th className="py-2 pr-3 font-semibold">Guachera</th>
                  <th className="py-2 pr-3 font-semibold">Diferencia</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 font-semibold">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const alert = item.comparison.status === 'ALERT'
                  const comparable = item.comparison.status !== 'NOT_COMPARABLE'
                  return (
                    <tr
                      key={item.delivery.id}
                      className={
                        alert
                          ? 'border-b border-line bg-danger-soft/60'
                          : 'border-b border-line'
                      }
                    >
                      <td className="py-2 pr-3 text-ink">
                        {formatMoment(item.delivery.pickupDate, item.delivery.pickupShift)}
                      </td>
                      <td className="py-2 pr-3">{item.delivery.coldTankLiters} L</td>
                      <td className="py-2 pr-3">{item.delivery.truckDeclaredLiters} L</td>
                      <td className="py-2 pr-3">
                        {comparable ? `${item.comparison.measuredLiters} L` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {item.delivery.guacheraLiters != null
                          ? `${item.delivery.guacheraLiters} L`
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {comparable ? (
                          <>
                            {formatSigned(item.comparison.differenceLiters, ' L')}
                            <span className="text-ink-muted">
                              {' '}
                              ({formatSigned(item.comparison.differencePct, '%')})
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {statusBadge(item)}
                        {item.comparison.missingTurns.length > 0 ? (
                          <p className="text-xs text-ink-muted mt-1">
                            Falta:{' '}
                            {item.comparison.missingTurns
                              .map((t) => {
                                const [, m, d] = t.date.split('-')
                                return `${d}/${m} ${t.shift === 'MORNING' ? 'mañana' : 'tarde'}`
                              })
                              .join(', ')}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {item.delivery.ticketPhotoUrl ? (
                          <a
                            href={photoFileUrl(auth.token, item.delivery.ticketPhotoUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            Ver ticket
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
