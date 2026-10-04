import { useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type BillingSummary,
  type DeviceItem,
  type DeviceKind,
  type EquipmentLine,
  type TamboHardware,
  type TamboLifecycleState,
  type PowerSupply,
  type TamboRequestItem,
  type TamboRequestStatus,
} from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, TextareaField } from './ui'

const KIND_LABEL: Record<DeviceKind, string> = {
  VACUUM_PUMP_SENSOR: 'Sensor de bomba de vacío',
  FLOW_METER: 'Caudalímetro',
  RFID_READER: 'Lector de caravanas',
}

const REQUEST_STATUS: Record<TamboRequestStatus, string> = {
  SENT: 'Enviado',
  QUOTED: 'Cotizado',
  ACCEPTED: 'Aceptado',
  DECLINED: 'Rechazado por el dueño',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
  CONVERTED: 'Convertido',
}

type TamboRow = {
  id: string
  name: string
  bajadaCount: number
  active: boolean
  activatedAt?: string | null
  state?: TamboLifecycleState
  powerSupply?: PowerSupply | null
}

function powerLabel(value: PowerSupply | null | undefined) {
  if (value === 'MONOPHASE') return 'Monofásica'
  if (value === 'THREEPHASE') return 'Trifásica'
  return 'Sin informar'
}

function money(n: number) {
  return `$${n.toLocaleString('es-AR')}`
}

function billingLine(billing: BillingSummary | null) {
  if (!billing) return ''
  const installing = ` · ${billing.installingTambos ?? 0} en instalación (todavía no se cobran)`
  if (billing.courtesy) return `Cuenta sin cargo${installing}`
  return `${billing.activeTambos} activo${billing.activeTambos === 1 ? '' : 's'} × ${money(billing.unitPriceArs)} = ${money(billing.monthlyTotalArs)} por mes${installing}`
}

function tamboState(t: TamboRow): TamboLifecycleState {
  if (t.state) return t.state
  if (!t.active) return 'ARCHIVED'
  if (!t.activatedAt) return 'INSTALLING'
  return 'ACTIVE'
}

function stateBadge(state: TamboLifecycleState) {
  if (state === 'ACTIVE') return <Badge tone="ok">Activo</Badge>
  if (state === 'INSTALLING') return <Badge tone="warn">En instalación</Badge>
  return <Badge tone="neutral">Archivado</Badge>
}

function requestTone(status: TamboRequestStatus) {
  if (status === 'ACCEPTED' || status === 'CONVERTED') return 'ok' as const
  if (status === 'QUOTED' || status === 'SENT') return 'warn' as const
  if (status === 'DECLINED' || status === 'REJECTED') return 'danger' as const
  return 'neutral' as const
}

function deviceStatus(item: DeviceItem) {
  if (!item.lastSeenAt) return 'Esperando primer contacto'
  if (item.connected) return 'Conectado'
  return 'Sin señal'
}

function hasHardware(h: TamboHardware) {
  return h.pumpSensor || h.flowMeters || h.rfidReaders
}

export function TambosSection({ token }: { token: string }) {
  const [tambos, setTambos] = useState<TamboRow[]>([])
  const [requests, setRequests] = useState<TamboRequestItem[]>([])
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [preview, setPreview] = useState<EquipmentLine[]>([])
  const [devicesByTambo, setDevicesByTambo] = useState<Record<string, DeviceItem[]>>({})
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [bajadaCount, setBajadaCount] = useState('8')
  const [hardware, setHardware] = useState<TamboHardware>({
    pumpSensor: false,
    flowMeters: false,
    rfidReaders: false,
  })
  const [providerId, setProviderId] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBajadas, setEditBajadas] = useState('')
  const [editPower, setEditPower] = useState<PowerSupply | ''>('')
  const [powerSupply, setPowerSupply] = useState<PowerSupply | ''>('')
  const [deviceBlock, setDeviceBlock] = useState<{ tamboId: string; count: number } | null>(null)
  const [bajadaBlock, setBajadaBlock] = useState<string>('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [list, summary, reqs] = await Promise.all([
        api.getTambos(token, true),
        api.getBillingSummary(token),
        api.getTamboRequests(token),
      ])
      const items = list.items || []
      setTambos(items)
      setBilling(summary)
      setRequests(reqs.items || [])
      setProviders(reqs.serviceProviders || [])
      const devices = await Promise.all(
        items.map(async (t) => {
          try {
            const res = await api.getDevices(token, t.id)
            return [t.id, res.items || []] as const
          } catch {
            return [t.id, []] as const
          }
        }),
      )
      setDevicesByTambo(Object.fromEntries(devices))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tambos')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!showForm) return
    const count = Number(bajadaCount)
    if (!Number.isInteger(count) || count < 1 || count > 60) {
      setPreview([])
      return
    }
    const handle = window.setTimeout(() => {
      void api
        .getEquipmentPreview(token, { bajadaCount: count, ...hardware })
        .then((res) => setPreview(res.items || []))
        .catch(() => setPreview([]))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [token, showForm, bajadaCount, hardware])

  const submitRequest = async () => {
    const count = Number(bajadaCount)
    if (name.trim().length < 2 || !Number.isInteger(count) || count < 1 || count > 60) {
      setError('Nombre (2–80) y bajadas (1–60) son obligatorios.')
      return
    }
    if (hasHardware(hardware) && !powerSupply) {
      setError('Si pedís hardware hay que indicar la corriente (monofásica o trifásica).')
      return
    }
    if (hasHardware(hardware) && !providerId) {
      setError('Si pedís hardware hay que elegir un proveedor del catálogo.')
      return
    }
    try {
      setBusy(true)
      setError('')
      await api.createTamboRequest(token, {
        name: name.trim(),
        address: address.trim() || undefined,
        bajadaCount: count,
        hardware,
        serviceProviderId: hasHardware(hardware) ? providerId : null,
        notes: notes.trim() || undefined,
        powerSupply: powerSupply || null,
      })
      setShowForm(false)
      setName('')
      setAddress('')
      setNotes('')
      setHardware({ pumpSensor: false, flowMeters: false, rfidReaders: false })
      setProviderId('')
      setPowerSupply('')
      setStatus('Pedido enviado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el pedido')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (id: string) => {
    const count = Number(editBajadas)
    try {
      setBusy(true)
      setError('')
      setBajadaBlock('')
      await api.updateTambo(token, id, {
        name: editName.trim(),
        bajadaCount: count,
        powerSupply: editPower || null,
      })
      setEditingId(null)
      setStatus('Tambo actualizado.')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BAJADAS_EN_USO') {
        const body = err.body as { blockers?: { type: string; bajadaNumber: number | null }[] }
        const detail = (body.blockers ?? [])
          .map((b) => `${b.type} (bajada ${b.bajadaNumber})`)
          .join(', ')
        setBajadaBlock(detail || err.message)
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo actualizar el tambo')
      }
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (tambo: TamboRow, active: boolean) => {
    if (active) {
      if (!window.confirm('¿Restaurar este tambo? Si ya estaba activado, vuelve a contar para el costo mensual.')) return
    } else if (!window.confirm('Dejás de pagar este tambo. Los datos se conservan.')) {
      return
    }
    try {
      setBusy(true)
      setError('')
      setDeviceBlock(null)
      const result = await api.setTamboActive(token, tambo.id, active)
      setBilling(result.billing)
      setStatus(active ? 'Tambo restaurado.' : 'Tambo archivado.')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TAMBO_HAS_DEVICES') {
        const body = err.body as { count?: number }
        setDeviceBlock({ tamboId: tambo.id, count: body.count ?? 0 })
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
      }
    } finally {
      setBusy(false)
    }
  }

  const requestRemoval = async (tamboId: string) => {
    try {
      setBusy(true)
      setError('')
      await api.requestDeviceRemoval(token, tamboId)
      setStatus('Pedido de retiro enviado al técnico.')
      setDeviceBlock(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo pedir el retiro')
    } finally {
      setBusy(false)
    }
  }

  const actOnRequest = async (action: 'accept' | 'decline' | 'cancel', id: string) => {
    try {
      setBusy(true)
      setError('')
      if (action === 'accept') await api.acceptTamboRequest(token, id)
      if (action === 'cancel') await api.cancelTamboRequest(token, id)
      if (action === 'decline') {
        const reason = window.prompt('Motivo (opcional)') ?? undefined
        await api.declineTamboRequest(token, id, reason || undefined)
      }
      setStatus(
        action === 'accept'
          ? 'Cotización aceptada.'
          : action === 'decline'
            ? 'Cotización rechazada.'
            : 'Pedido cancelado.',
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pedido')
    } finally {
      setBusy(false)
    }
  }

  const subscriptionHint = billing
    ? billing.courtesy
      ? 'La cuenta es sin cargo. Los equipos y la instalación los cotiza el proveedor.'
      : `La suscripción es de ${money(billing.unitPriceArs)} por mes por tambo y empieza a cobrarse cuando el tambo se activa. Los equipos y la instalación los cotiza el proveedor.`
    : 'La suscripción empieza a cobrarse cuando el tambo se activa. Los equipos y la instalación los cotiza el proveedor.'

  return (
    <div className="space-y-4">
      <Card title="Mis tambos">
        <p className="text-sm text-ink-muted mb-4">{billingLine(billing)}</p>
        {error ? <ErrorBanner>{error}</ErrorBanner> : null}
        {status ? (
          <div className="mb-3 bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
            {status}
          </div>
        ) : null}
        {deviceBlock ? (
          <div className="mb-3 space-y-2">
            <ErrorBanner>
              Este tambo tiene {deviceBlock.count} dispositivo
              {deviceBlock.count === 1 ? '' : 's'} instalado
              {deviceBlock.count === 1 ? '' : 's'}. Para darlo de baja hay que retirarlos.
            </ErrorBanner>
            <Button disabled={busy} onClick={() => void requestRemoval(deviceBlock.tamboId)}>
              Pedir retiro de dispositivos
            </Button>
          </div>
        ) : null}
        {bajadaBlock ? <ErrorBanner>{bajadaBlock}</ErrorBanner> : null}

        {loading ? (
          <EmptyState>Cargando tambos...</EmptyState>
        ) : tambos.length === 0 ? (
          <EmptyState>No hay tambos.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {tambos.map((t) => (
              <li key={t.id} className="border border-line rounded-lg p-4 space-y-2">
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <Field label="Nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Field
                      label="Bajadas"
                      type="number"
                      min={1}
                      max={60}
                      value={editBajadas}
                      onChange={(e) => setEditBajadas(e.target.value)}
                    />
                    <SelectField
                      label="Corriente"
                      value={editPower}
                      onChange={(e) => setEditPower(e.target.value as PowerSupply | '')}
                    >
                      <option value="">Sin informar</option>
                      <option value="MONOPHASE">Monofásica</option>
                      <option value="THREEPHASE">Trifásica</option>
                    </SelectField>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy} onClick={() => void saveEdit(t.id)}>
                        Guardar
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink">{t.name}</p>
                      {stateBadge(tamboState(t))}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {t.bajadaCount} bajadas · Corriente: {powerLabel(t.powerSupply)}
                    </p>
                  </>
                )}

                <ul className="text-sm text-ink-muted space-y-1">
                  {(devicesByTambo[t.id] ?? []).length === 0 ? (
                    <li>Sin dispositivos instalados.</li>
                  ) : (
                    (devicesByTambo[t.id] ?? []).map((d) => (
                      <li key={d.id}>
                        {KIND_LABEL[d.kind]}
                        {d.bajadaNumber != null ? ` · bajada ${d.bajadaNumber}` : ''}
                        {` · ${deviceStatus(d)}`}
                      </li>
                    ))
                  )}
                </ul>

                {editingId === t.id ? null : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(t.id)
                        setEditName(t.name)
                        setEditBajadas(String(t.bajadaCount))
                        setEditPower(t.powerSupply ?? '')
                        setBajadaBlock('')
                      }}
                    >
                      Editar
                    </Button>
                    {t.active ? (
                      <Button variant="danger" disabled={busy} onClick={() => void setActive(t, false)}>
                        Archivar
                      </Button>
                    ) : (
                      <Button disabled={busy} onClick={() => void setActive(t, true)}>
                        Restaurar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-3">
          {showForm ? (
            <div className="space-y-3 border-t border-line pt-4">
              <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Dirección (opcional)" value={address} onChange={(e) => setAddress(e.target.value)} />
              <Field
                label="Cantidad de bajadas"
                type="number"
                min={1}
                max={60}
                value={bajadaCount}
                onChange={(e) => setBajadaCount(e.target.value)}
              />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">Hardware</p>
                {(
                  [
                    ['pumpSensor', 'Sensor de bomba de vacío'],
                    ['flowMeters', 'Caudalímetro en cada bajada'],
                    ['rfidReaders', 'Lector de caravanas en cada bajada'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={hardware[key]}
                      onChange={(e) => setHardware((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <SelectField
                label="Corriente eléctrica"
                hint="Define qué motores y equipos se pueden instalar. Obligatoria si hay hardware."
                value={powerSupply}
                onChange={(e) => setPowerSupply(e.target.value as PowerSupply | '')}
              >
                <option value="">Sin informar</option>
                <option value="MONOPHASE">Monofásica</option>
                <option value="THREEPHASE">Trifásica</option>
              </SelectField>
              {hasHardware(hardware) ? (
                <SelectField label="Proveedor" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  <option value="">Elegí un proveedor</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              <TextareaField label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">Equipos estimados</p>
                {preview.length === 0 ? (
                  <p className="text-sm text-ink-muted">Pedido solo de software: sin equipos de hardware.</p>
                ) : (
                  <ul className="text-sm text-ink-muted space-y-1">
                    {preview.map((line) => (
                      <li key={line.kind}>
                        {line.label}: {line.quantity}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-sm text-ink-muted">{subscriptionHint}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void submitRequest()}>
                  Enviar pedido
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              Pedir un tambo
            </Button>
          )}
        </div>
      </Card>

      <Card title="Mis pedidos de tambo">
        {requests.length === 0 ? (
          <EmptyState>Todavía no hay pedidos.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="border border-line rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{r.name}</p>
                  <Badge tone={requestTone(r.status)}>{REQUEST_STATUS[r.status]}</Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  {r.bajadaCount} bajadas
                  {r.serviceProvider ? ` · ${r.serviceProvider.name}` : ' · solo software'} ·
                  Corriente: {powerLabel(r.powerSupply)}
                </p>
                <ul className="text-sm text-ink-muted space-y-1">
                  {(r.equipmentList ?? []).length === 0 ? (
                    <li>Sin equipos de hardware.</li>
                  ) : (
                    (r.equipmentList ?? []).map((line) => (
                      <li key={line.kind}>
                        {line.label}: {line.quantity}
                      </li>
                    ))
                  )}
                </ul>
                {r.status === 'QUOTED' || r.quoteItems ? (
                  <div className="space-y-1 text-sm text-ink">
                    <p className="font-semibold">Cotización</p>
                    {(r.quoteItems ?? []).map((item, i) => (
                      <p key={`${item.description}-${i}`} className="text-ink-muted">
                        {item.description} · {item.quantity} × {money(item.unitPrice)} {item.currency}
                      </p>
                    ))}
                    {r.quoteTotal != null ? (
                      <p>
                        Total: {money(r.quoteTotal)} {r.quoteCurrency}
                      </p>
                    ) : null}
                    {r.quoteValidUntil ? (
                      <p className="text-ink-muted">
                        Vigencia: {new Date(r.quoteValidUntil).toLocaleDateString('es-AR')}
                      </p>
                    ) : null}
                    {r.quoteNotes ? <p className="text-ink-muted">{r.quoteNotes}</p> : null}
                  </div>
                ) : null}
                {r.rejectionReason ? (
                  <p className="text-sm text-ink-muted">Motivo: {r.rejectionReason}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === 'QUOTED' ? (
                    <>
                      <Button disabled={busy} onClick={() => void actOnRequest('accept', r.id)}>
                        Aceptar
                      </Button>
                      <Button variant="danger" disabled={busy} onClick={() => void actOnRequest('decline', r.id)}>
                        Rechazar
                      </Button>
                    </>
                  ) : null}
                  {r.status === 'SENT' || r.status === 'QUOTED' ? (
                    <Button variant="ghost" disabled={busy} onClick={() => void actOnRequest('cancel', r.id)}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
