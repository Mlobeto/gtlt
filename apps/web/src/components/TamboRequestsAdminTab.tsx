import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type InstallingTambo,
  type QuoteItem,
  type TamboRequestItem,
  type TamboRequestStatus,
} from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, TextareaField } from './ui'

const REQUEST_STATUS: Record<TamboRequestStatus, string> = {
  SENT: 'Enviado',
  QUOTED: 'Cotizado',
  ACCEPTED: 'Aceptado',
  DECLINED: 'Rechazado por el dueño',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
  CONVERTED: 'Convertido',
}

function money(n: number) {
  return `$${n.toLocaleString('es-AR')}`
}

function hasHardware(item: TamboRequestItem) {
  const h = item.hardware
  return Boolean(h?.pumpSensor || h?.flowMeters || h?.rfidReaders)
}

function canCreateTambo(item: TamboRequestItem) {
  return item.status === 'ACCEPTED' || (item.status === 'SENT' && !hasHardware(item))
}

export function TamboRequestsAdminTab({ auth }: { auth: AuthToken }) {
  const [items, setItems] = useState<TamboRequestItem[]>([])
  const [installing, setInstalling] = useState<InstallingTambo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TamboRequestStatus | ''>('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [quoteCurrency, setQuoteCurrency] = useState('ARS')
  const [quoteValidUntil, setQuoteValidUntil] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [quoteRows, setQuoteRows] = useState<QuoteItem[]>([
    { description: '', quantity: 1, unitPrice: 0, currency: 'ARS' },
  ])

  const selected = items.find((i) => i.id === selectedId) ?? null

  const load = useCallback(async () => {
    try {
      setError('')
      const [reqs, inst] = await Promise.all([
        api.getAdminTamboRequests(auth.token, statusFilter ? { status: statusFilter } : undefined),
        api.getAdminInstallingTambos(auth.token),
      ])
      setItems(reqs.items || [])
      setInstalling(inst.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos')
    }
  }, [auth.token, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) return
    setQuoteCurrency(selected.quoteCurrency || 'ARS')
    setQuoteValidUntil(selected.quoteValidUntil ? selected.quoteValidUntil.slice(0, 10) : '')
    setQuoteNotes(selected.quoteNotes || '')
    setQuoteRows(
      selected.quoteItems?.length
        ? selected.quoteItems
        : [{ description: '', quantity: 1, unitPrice: 0, currency: selected.quoteCurrency || 'ARS' }],
    )
    setRejectReason('')
  }, [selectedId])

  const saveQuote = async () => {
    if (!selected) return
    const rows = quoteRows
      .map((row) => ({
        ...row,
        description: row.description.trim(),
        currency: quoteCurrency,
      }))
      .filter((row) => row.description.length > 0)
    if (rows.length === 0) {
      setError('Agregá al menos un ítem de cotización.')
      return
    }
    const quoteTotal = rows.reduce((acc, row) => acc + row.quantity * row.unitPrice, 0)
    try {
      setBusy(true)
      setError('')
      await api.quoteAdminTamboRequest(auth.token, selected.id, {
        quoteItems: rows,
        quoteTotal: Number(quoteTotal.toFixed(2)),
        quoteCurrency,
        quoteValidUntil: quoteValidUntil
          ? new Date(`${quoteValidUntil}T23:59:59.000Z`).toISOString()
          : null,
        quoteNotes: quoteNotes.trim() || null,
      })
      setStatus('Cotización guardada.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cotización')
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!selected) return
    if (!rejectReason.trim()) {
      setError('El rechazo necesita un motivo.')
      return
    }
    try {
      setBusy(true)
      setError('')
      await api.rejectAdminTamboRequest(auth.token, selected.id, rejectReason.trim())
      setStatus('Pedido rechazado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar')
    } finally {
      setBusy(false)
    }
  }

  const createTambo = async () => {
    if (!selected) return
    try {
      setBusy(true)
      setError('')
      await api.createAdminTambo(auth.token, selected.id)
      setStatus('Tambo creado en instalación.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el tambo')
    } finally {
      setBusy(false)
    }
  }

  const activate = async (id: string) => {
    try {
      setBusy(true)
      setError('')
      await api.activateAdminTambo(auth.token, id)
      setStatus('Tambo activado. Empieza a contar para la suscripción.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {status ? (
        <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
          {status}
        </div>
      ) : null}

      <Card
        title="Pedidos de tambo"
        action={
          <SelectField
            label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TamboRequestStatus | '')}
          >
            <option value="">Todos</option>
            {(Object.keys(REQUEST_STATUS) as TamboRequestStatus[]).map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS[s]}
              </option>
            ))}
          </SelectField>
        }
      >
        {items.length === 0 ? (
          <EmptyState>No hay pedidos.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full text-left border rounded-lg p-3 ${
                    selectedId === item.id ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
                  }`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{item.name}</p>
                    <Badge tone={item.status === 'ACCEPTED' || item.status === 'CONVERTED' ? 'ok' : 'neutral'}>
                      {REQUEST_STATUS[item.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {item.tenant?.name ?? item.tenantId} · {item.bajadaCount} bajadas
                    {item.serviceProvider ? ` · ${item.serviceProvider.name}` : ' · solo software'}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected ? (
        <Card title={`Detalle · ${selected.name}`}>
          <div className="space-y-3 text-sm text-ink">
            <p className="text-ink-muted">
              {selected.tenant?.name} · pedido por {selected.requestedBy?.name}
              {selected.address ? ` · ${selected.address}` : ''}
            </p>
            <p>{selected.bajadaCount} bajadas</p>
            {selected.notes ? <p>Notas: {selected.notes}</p> : null}
            <ul className="text-ink-muted space-y-1">
              {(selected.equipmentList ?? []).length === 0 ? (
                <li>Sin equipos de hardware.</li>
              ) : (
                (selected.equipmentList ?? []).map((line) => (
                  <li key={line.kind}>
                    {line.label}: {line.quantity}
                  </li>
                ))
              )}
            </ul>

            {selected.status === 'SENT' || selected.status === 'QUOTED' ? (
              <div className="space-y-3 border-t border-line pt-3">
                <p className="font-semibold">Cotización (en nombre del proveedor)</p>
                {quoteRows.map((row, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-3">
                    <Field
                      label="Descripción"
                      value={row.description}
                      onChange={(e) =>
                        setQuoteRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)),
                        )
                      }
                    />
                    <Field
                      label="Cantidad"
                      type="number"
                      min={0}
                      value={String(row.quantity)}
                      onChange={(e) =>
                        setQuoteRows((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, quantity: Number(e.target.value) || 0 } : r,
                          ),
                        )
                      }
                    />
                    <Field
                      label="Precio unitario"
                      type="number"
                      min={0}
                      value={String(row.unitPrice)}
                      onChange={(e) =>
                        setQuoteRows((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, unitPrice: Number(e.target.value) || 0 } : r,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  onClick={() =>
                    setQuoteRows((prev) => [
                      ...prev,
                      { description: '', quantity: 1, unitPrice: 0, currency: quoteCurrency },
                    ])
                  }
                >
                  Agregar ítem
                </Button>
                <Field
                  label="Moneda"
                  value={quoteCurrency}
                  onChange={(e) => setQuoteCurrency(e.target.value.toUpperCase())}
                />
                <Field
                  label="Vigencia"
                  type="date"
                  value={quoteValidUntil}
                  onChange={(e) => setQuoteValidUntil(e.target.value)}
                />
                <TextareaField
                  label="Notas de cotización"
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  rows={3}
                />
                <p className="text-ink-muted">
                  Total:{' '}
                  {money(
                    quoteRows.reduce((acc, row) => acc + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0),
                  )}{' '}
                  {quoteCurrency}
                </p>
                <Button disabled={busy} onClick={() => void saveQuote()}>
                  Guardar cotización
                </Button>
              </div>
            ) : null}

            {selected.quoteItems ? (
              <div className="space-y-1">
                <p className="font-semibold">Cotización cargada</p>
                {(selected.quoteItems ?? []).map((item, i) => (
                  <p key={`${item.description}-${i}`} className="text-ink-muted">
                    {item.description} · {item.quantity} × {money(item.unitPrice)} {item.currency}
                  </p>
                ))}
                {selected.quoteTotal != null ? (
                  <p>
                    Total: {money(selected.quoteTotal)} {selected.quoteCurrency}
                  </p>
                ) : null}
              </div>
            ) : null}

            {selected.status !== 'CONVERTED' && selected.status !== 'CANCELLED' && selected.status !== 'REJECTED' ? (
              <div className="space-y-2 border-t border-line pt-3">
                <TextareaField
                  label="Rechazar con motivo"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                />
                <Button variant="danger" disabled={busy} onClick={() => void reject()}>
                  Rechazar
                </Button>
              </div>
            ) : null}

            {canCreateTambo(selected) ? (
              <Button disabled={busy} onClick={() => void createTambo()}>
                Crear tambo
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title="Tambos en instalación">
        {installing.length === 0 ? (
          <EmptyState>No hay tambos en instalación.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {installing.map((t) => (
              <li key={t.id} className="border border-line rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{t.name}</p>
                  <Badge tone="warn">En instalación</Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  {t.tenant.name} · {t.activeDevices} dispositivo{t.activeDevices === 1 ? '' : 's'} ·{' '}
                  {t.connectedDevices} conectado{t.connectedDevices === 1 ? '' : 's'}
                </p>
                <ul className="text-sm text-ink-muted space-y-1">
                  {t.devices.length === 0 ? (
                    <li>Todavía no hay dispositivos.</li>
                  ) : (
                    t.devices.map((d) => (
                      <li key={d.id}>
                        {d.label || d.kind} · {d.connected ? 'Conectado' : 'Sin señal'}
                      </li>
                    ))
                  )}
                </ul>
                <Button disabled={busy} onClick={() => void activate(t.id)}>
                  Activar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
