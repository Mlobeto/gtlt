import { useCallback, useEffect, useState } from 'react'
import { api, type PartTypeConfigItem } from '../lib/api'
import { Button, Card, EmptyState, ErrorBanner, Field } from './ui'

export function PartLifeSettings({ token }: { token: string }) {
  const [items, setItems] = useState<PartTypeConfigItem[]>([])
  const [usage, setUsage] = useState<Record<string, string>>({})
  const [months, setMonths] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const res = await api.getPartTypeConfig(token)
      const list = res.items || []
      setItems(list)
      setUsage(
        Object.fromEntries(
          list.map((i) => [i.partTypeId, i.tenantUsageThreshold != null ? String(i.tenantUsageThreshold) : '']),
        ),
      )
      setMonths(
        Object.fromEntries(
          list.map((i) => [i.partTypeId, i.tenantLifeMonths != null ? String(i.tenantLifeMonths) : '']),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la vida útil')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (item: PartTypeConfigItem) => {
    const usageThreshold = usage[item.partTypeId] ? Number(usage[item.partTypeId]) : null
    const lifeMonths = months[item.partTypeId] ? Number(months[item.partTypeId]) : null
    try {
      setBusy(true)
      setError('')
      await api.putPartTypeConfig(token, item.partTypeId, { usageThreshold, lifeMonths })
      setStatus('Umbral guardado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const reset = async (item: PartTypeConfigItem) => {
    try {
      setBusy(true)
      setError('')
      await api.deletePartTypeConfig(token, item.partTypeId)
      setStatus('Volviste al valor por defecto.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo volver al valor por defecto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Vida útil de las piezas">
      <p className="text-sm text-ink-muted mb-4">
        Cuántos ordeñes por bajada, o cuántos meses, se sugiere antes de cambiarla. Las pezoneras de
        silicona suelen durar más que las de goma.
      </p>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {status ? (
        <div className="mb-3 bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
          {status}
        </div>
      ) : null}
      {items.length === 0 ? (
        <EmptyState>No hay piezas con vida útil.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.partTypeId} className="border border-line rounded-lg p-4 space-y-3">
              <p className="font-semibold text-ink">{item.name}</p>
              <p className="text-sm text-ink-muted">
                Por defecto:{' '}
                {item.defaultUsageThreshold != null ? `${item.defaultUsageThreshold} ordeñes` : '—'}
                {' · '}
                {item.defaultLifeMonths != null ? `${item.defaultLifeMonths} meses` : '—'}
                {' · '}
                Efectivo: {item.effectiveUsageThreshold ?? '—'} ordeñes · {item.effectiveLifeMonths ?? '—'} meses
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Ordeñes de la cuenta"
                  type="number"
                  value={usage[item.partTypeId] ?? ''}
                  onChange={(e) => setUsage((prev) => ({ ...prev, [item.partTypeId]: e.target.value }))}
                />
                <Field
                  label="Meses de la cuenta"
                  type="number"
                  value={months[item.partTypeId] ?? ''}
                  onChange={(e) => setMonths((prev) => ({ ...prev, [item.partTypeId]: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void save(item)}>
                  Guardar
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void reset(item)}>
                  Volver al valor por defecto
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
