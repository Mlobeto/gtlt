import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type DeviceKind,
  type HardwareBudget,
  type HardwareProductItem,
  type QuantityRule,
} from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, TextareaField } from './ui'

const emptyForm = {
  name: '',
  description: '',
  deviceKind: '' as '' | DeviceKind,
  quantityRule: 'PER_BAJADA' as QuantityRule,
  fixedQuantity: '4',
  unitPrice: '',
  currency: 'USD' as 'USD' | 'ARS',
  sortOrder: '0',
}

const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  FLOW_METER: 'Caudalímetro',
  RFID_READER: 'Lector de caravanas',
  VACUUM_PUMP_SENSOR: 'Sensor de bomba de vacío',
  GATE_SENSOR: 'Sensor de tranquera',
}

function quantityLabel(item: Pick<HardwareProductItem, 'quantityRule' | 'fixedQuantity'>) {
  if (item.quantityRule === 'PER_BAJADA') return 'por bajada'
  if (item.quantityRule === 'PER_PUMP') return 'por bomba'
  return `fija: ${item.fixedQuantity ?? '—'}`
}

function priceLabel(item: HardwareProductItem) {
  if (item.unitPrice == null) return 'Sin precio'
  return `${item.unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${item.currency}`
}

export function HardwareProductsAdminTab({ auth }: { auth: AuthToken }) {
  const [items, setItems] = useState<HardwareProductItem[]>([])
  const [editing, setEditing] = useState<HardwareProductItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bajadaCount, setBajadaCount] = useState('8')
  const [pumpCount, setPumpCount] = useState('1')
  const [budget, setBudget] = useState<HardwareBudget | null>(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const result = await api.getAdminHardwareProducts(auth.token)
      const next = result.items || []
      setItems(next)
      setSelectedIds((current) =>
        current.length ? current.filter((id) => next.some((p) => p.id === id && p.active)) : next.filter((p) => p.active).map((p) => p.id),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
    }
  }, [auth.token])

  useEffect(() => {
    void load()
  }, [load])

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setForm(emptyForm)
    setStatus('')
  }

  const startEdit = (item: HardwareProductItem) => {
    setCreating(false)
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      deviceKind: item.deviceKind ?? '',
      quantityRule: item.quantityRule,
      fixedQuantity: String(item.fixedQuantity ?? 4),
      unitPrice: item.unitPrice == null ? '' : String(item.unitPrice),
      currency: item.currency === 'ARS' ? 'ARS' : 'USD',
      sortOrder: String(item.sortOrder ?? 0),
    })
    setStatus('')
  }

  const payload = () => ({
    name: form.name.trim(),
    description: form.description.trim() || null,
    deviceKind: form.deviceKind || null,
    quantityRule: form.quantityRule,
    fixedQuantity: form.quantityRule === 'FIXED' ? Number(form.fixedQuantity) : null,
    unitPrice: form.unitPrice.trim() === '' ? null : Number(form.unitPrice),
    currency: form.currency,
    sortOrder: Number(form.sortOrder) || 0,
  })

  const save = async () => {
    try {
      setBusy(true)
      setError('')
      if (creating) {
        await api.createAdminHardwareProduct(auth.token, payload())
        setStatus('Equipo creado.')
      } else if (editing) {
        await api.updateAdminHardwareProduct(auth.token, editing.id, payload())
        setStatus('Equipo actualizado.')
      }
      setCreating(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el equipo')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (item: HardwareProductItem) => {
    try {
      setBusy(true)
      setError('')
      await api.updateAdminHardwareProduct(auth.token, item.id, { active: !item.active })
      setStatus(item.active ? 'Equipo desactivado.' : 'Equipo reactivado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBusy(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
    setBudget(null)
  }

  const calculate = async () => {
    try {
      setBusy(true)
      setError('')
      const result = await api.previewHardwareBudget(auth.token, {
        selectedProductIds: selectedIds,
        bajadaCount: Number(bajadaCount),
        pumpCount: Number(pumpCount),
      })
      setBudget(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el presupuesto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {status ? (
        <div className="bg-success-soft border border-success/30 text-success-text px-4 py-3 rounded-lg text-sm">
          {status}
        </div>
      ) : null}

      <Card
        title="Equipos y precios"
        action={
          <Button variant="secondary" onClick={startCreate}>
            Nuevo equipo
          </Button>
        }
      >
        <p className="text-sm text-ink-muted mb-4">
          Una sola lista de precios. El presupuesto es informativo: no factura. La suscripción mensual se muestra aparte.
          Sin precio cargado, el presupuesto lo dice.
        </p>
        {items.length === 0 ? (
          <EmptyState>Todavía no hay equipos en el catálogo.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-ink-muted">
                  <th className="py-2 pr-3 font-semibold">Nombre</th>
                  <th className="py-2 pr-3 font-semibold">Cantidad</th>
                  <th className="py-2 pr-3 font-semibold">Precio</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-ink">
                      {item.name}
                      <span className="block text-xs text-ink-muted">{item.code}</span>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{quantityLabel(item)}</td>
                    <td className="py-2 pr-3 text-ink">{priceLabel(item)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={item.active ? 'ok' : 'neutral'}>{item.active ? 'Activo' : 'Inactivo'}</Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={() => startEdit(item)}>
                          Editar
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => void toggleActive(item)}>
                          {item.active ? 'Desactivar' : 'Reactivar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating || editing ? (
        <Card title={creating ? 'Nuevo equipo' : `Editar · ${editing?.name}`}>
          <div className="space-y-3 max-w-xl">
            <p className="text-sm text-ink-muted">
              El código se genera del nombre y no se puede cambiar después. Dejá el precio vacío si todavía no lo
              cargaste.
            </p>
            <Field
              label="Nombre"
              hint="Ej. Caudalímetro"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextareaField
              label="Descripción"
              hint="Qué incluye o dónde se instala. Opcional."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
            <SelectField
              label="Tipo de dispositivo"
              hint="Qué se registra al instalarlo. Vacío si este equipo no genera un dispositivo."
              value={form.deviceKind}
              onChange={(e) => setForm((f) => ({ ...f, deviceKind: e.target.value as '' | DeviceKind }))}
            >
              <option value="">Ninguno</option>
              {(Object.keys(DEVICE_KIND_LABEL) as DeviceKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {DEVICE_KIND_LABEL[kind]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Regla de cantidad"
              hint="Por bajada = una por cada bajada del tambo. Por bomba = una por cada bomba. Fija = siempre la misma cantidad."
              value={form.quantityRule}
              onChange={(e) => setForm((f) => ({ ...f, quantityRule: e.target.value as QuantityRule }))}
            >
              <option value="PER_BAJADA">Por bajada</option>
              <option value="PER_PUMP">Por bomba</option>
              <option value="FIXED">Fija</option>
            </SelectField>
            {form.quantityRule === 'FIXED' ? (
              <Field
                label="Cantidad fija"
                hint="Entre 1 y 100. Ejemplo: 4 sensores de tranquera."
                type="number"
                min={1}
                max={100}
                value={form.fixedQuantity}
                onChange={(e) => setForm((f) => ({ ...f, fixedQuantity: e.target.value }))}
              />
            ) : null}
            <Field
              label="Precio unitario"
              hint="Lo carga la desarrolladora. Vacío = sin precio; el presupuesto lo marca."
              type="number"
              min={0}
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
              placeholder="Sin precio"
            />
            <SelectField
              label="Moneda"
              hint="No se convierten monedas: cada una se suma por separado."
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as 'USD' | 'ARS' }))}
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </SelectField>
            <Field
              label="Orden"
              hint="Menor número aparece primero en la tabla."
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void save()}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Presupuesto estimado">
        <p className="text-sm text-ink-muted mb-4">
          Informativo. No factura ni se mezcla con la suscripción mensual.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-xl mb-4">
          <Field
            label="Bajadas"
            hint="De 1 a 60"
            type="number"
            min={1}
            max={60}
            value={bajadaCount}
            onChange={(e) => setBajadaCount(e.target.value)}
          />
          <Field
            label="Bombas"
            hint="De 1 a 10"
            type="number"
            min={1}
            max={10}
            value={pumpCount}
            onChange={(e) => setPumpCount(e.target.value)}
          />
        </div>
        <ul className="space-y-2 mb-4">
          {items.filter((item) => item.active).map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleSelected(item.id)}
                />
                <span>
                  {item.name} · {quantityLabel(item)} · {priceLabel(item)}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button disabled={busy || selectedIds.length === 0} onClick={() => void calculate()}>
          Calcular
        </Button>
        {budget ? (
          <div className="mt-4 space-y-2">
            <ul className="text-sm text-ink space-y-1">
              {budget.lines.map((line) => (
                <li key={line.productId}>
                  {line.name}: {line.quantity} u.
                  {line.unitPrice == null
                    ? ' · Sin precio'
                    : ` · ${line.unitPrice} ${line.currency} = ${line.subtotal} ${line.currency}`}
                </li>
              ))}
            </ul>
            {Object.keys(budget.totalsByCurrency).length > 0 ? (
              <p className="text-sm font-semibold text-ink">
                Totales:{' '}
                {Object.entries(budget.totalsByCurrency)
                  .map(([currency, total]) => `${total} ${currency}`)
                  .join(' · ')}
              </p>
            ) : null}
            {budget.missingPrices ? (
              <p className="text-sm text-ink-muted">Falta cargar el precio de al menos un equipo seleccionado.</p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
