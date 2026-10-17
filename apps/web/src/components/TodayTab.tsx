import { useEffect, useState } from 'react'
import { api, photoFileUrl, type PartInstanceItem, type ServiceRequestProvider } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { TamboPicker, useTamboId } from './TamboPicker'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, StatCard } from './ui'

const CATEGORY_LABEL: Record<string, string> = {
  VACUUM_PUMP: 'Bomba de vacío',
  COLD_EQUIPMENT: 'Equipo de frío',
  MILKING_GROUP: 'Grupo de ordeñe',
  OTHER: 'Otro',
}

type PumpInterval = {
  deviceId: string
  start: string
  end: string | null
  durationMinutes: number | null
  ongoing: boolean
}

const SERVICE_STATUS_ES: Record<string, string> = {
  PENDING_APPROVAL: 'Esperando tu OK',
  OPEN: 'Enviado',
  ACKNOWLEDGED: 'Recibido',
  IN_PROGRESS: 'En curso',
  RESOLVED: 'Resuelto',
  CANCELLED: 'Cancelado',
}

type PendingService = {
  id: string
  category: string
  description: string
  urgency: string
  createdAt: string
  createdBy?: { name: string }
}

type OpenService = {
  id: string
  category: string
  description: string
  urgency: string
  status: string
  createdAt: string
  performedBy?: string | null
  providerNotifiedAt?: string | null
  serviceProvider?: ServiceRequestProvider | null
}

type PendingPhoto = {
  id: string
  photoUrl: string
  note: string | null
  takenAt: string
  animalId: string
  animal: { id: string; earTag: string }
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(minutes: number | null, ongoing: boolean) {
  if (ongoing || minutes == null) return 'en curso'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const INSTALL_CHIPS = [
  { key: 'today', label: 'Hoy', days: 0, approx: false },
  { key: '1w', label: 'Hace 1 semana', days: 7, approx: true },
  { key: '1m', label: 'Hace 1 mes', days: 30, approx: true },
  { key: '3m', label: 'Hace 3 meses', days: 91, approx: true },
] as const

function resolveChip(key: string, other: string): { date: Date; approx: boolean } | null {
  if (key === 'other') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(other.trim())
    if (!m) return null
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
    return { date, approx: false }
  }
  const preset = INSTALL_CHIPS.find((c) => c.key === key)
  if (!preset) return null
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - preset.days)
  return { date, approx: preset.approx }
}

function daysOverdue(p: PartInstanceItem): number | null {
  if (p.life?.kind !== 'USAGE_BASED' || p.life.status !== 'OVERDUE') return null
  if (p.life.estimatedReplacementDate) {
    const start = new Date(p.life.estimatedReplacementDate)
    const now = new Date()
    return Math.max(
      0,
      Math.round(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
          Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
          86_400_000,
      ),
    )
  }
  if (p.life.byTime) return Math.max(0, Math.round(p.life.byTime.days - p.life.byTime.lifeDays))
  return null
}

export function TodayTab({ auth }: { auth: AuthToken }) {
  const { tamboId, setTamboId, ready, error, setError } = useTamboId(auth.token)
  const [loading, setLoading] = useState(false)
  const [pumpStatus, setPumpStatus] = useState<'ON' | 'OFF' | null>(null)
  const [lastChangeAt, setLastChangeAt] = useState<string | null>(null)
  const [intervals, setIntervals] = useState<PumpInterval[]>([])
  const [pendingServices, setPendingServices] = useState<PendingService[]>([])
  const [openNoPanel, setOpenNoPanel] = useState<OpenService[]>([])
  const [resolveWho, setResolveWho] = useState<Record<string, string>>({})
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({})
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [dueParts, setDueParts] = useState<PartInstanceItem[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [chip, setChip] = useState('today')
  const [otherDate, setOtherDate] = useState('')

  useEffect(() => {
    if (!ready) return
    if (!tamboId) {
      setPumpStatus(null)
      setLastChangeAt(null)
      setIntervals([])
      setPendingServices([])
      setOpenNoPanel([])
      setPendingPhotos([])
      setDueParts([])
      setLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const from = startOfLocalDay(new Date()).toISOString()
        const to = endOfLocalDay(new Date()).toISOString()
        const [statusRes, historyRes, servicesRes, allServicesRes, photosRes, partsRes] = await Promise.all([
          api.getPumpStatus(auth.token, tamboId),
          api.getPumpStatusHistory(auth.token, tamboId, from, to),
          api.getServiceRequests(auth.token, tamboId, 'PENDING_APPROVAL'),
          api.getServiceRequests(auth.token, tamboId),
          api.getPendingPhotos(auth.token, tamboId),
          api.getPartInstances(auth.token, tamboId),
        ])
        if (cancelled) return
        setPumpStatus(statusRes.status)
        setLastChangeAt(statusRes.item?.occurredAt ?? null)
        setIntervals(historyRes.intervals || [])
        setPendingServices(servicesRes.items || [])
        setOpenNoPanel(
          ((allServicesRes.items || []) as OpenService[]).filter(
            (r) =>
              r.serviceProvider &&
              !r.serviceProvider.hasPanel &&
              ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(r.status),
          ),
        )
        setPendingPhotos(photosRes.items || [])
        const due = (partsRes.items || []).filter(
          (p) => p.life?.kind === 'USAGE_BASED' && (p.life.status === 'SOON' || p.life.status === 'OVERDUE'),
        )
        setDueParts(due)
        setSelectedIds(Object.fromEntries(due.map((p) => [p.id, true])))
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar el estado de hoy')
        setPumpStatus(null)
        setLastChangeAt(null)
        setIntervals([])
        setPendingServices([])
        setOpenNoPanel([])
        setPendingPhotos([])
        setDueParts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.token, tamboId, ready, setError])

  const refreshLists = async () => {
    if (!tamboId) return
    const [servicesRes, allServicesRes, photosRes] = await Promise.all([
      api.getServiceRequests(auth.token, tamboId, 'PENDING_APPROVAL'),
      api.getServiceRequests(auth.token, tamboId),
      api.getPendingPhotos(auth.token, tamboId),
    ])
    setPendingServices(servicesRes.items || [])
    setOpenNoPanel(
      ((allServicesRes.items || []) as OpenService[]).filter(
        (r) =>
          r.serviceProvider &&
          !r.serviceProvider.hasPanel &&
          ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(r.status),
      ),
    )
    setPendingPhotos(photosRes.items || [])
  }

  const markChanged = async () => {
    const instanceIds = dueParts.filter((p) => selectedIds[p.id]).map((p) => p.id)
    const installed = resolveChip(chip, otherDate)
    if (instanceIds.length === 0) {
      setError('Elegí al menos una pieza.')
      return
    }
    if (!installed) {
      setError('Elegí cuándo se instalaron.')
      return
    }
    try {
      setBusyId('batch')
      setError('')
      await api.replacePartInstancesBatch(auth.token, {
        instanceIds,
        installedAt: installed.date.toISOString(),
        installedAtApprox: installed.approx,
      })
      if (!tamboId) return
      const partsRes = await api.getPartInstances(auth.token, tamboId)
      const due = (partsRes.items || []).filter(
        (p) => p.life?.kind === 'USAGE_BASED' && (p.life.status === 'SOON' || p.life.status === 'OVERDUE'),
      )
      setDueParts(due)
      setSelectedIds(Object.fromEntries(due.map((p) => [p.id, true])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron marcar las piezas')
    } finally {
      setBusyId(null)
    }
  }

  const nextStatusOf = (status: string) => {
    if (status === 'OPEN') return 'ACKNOWLEDGED' as const
    if (status === 'ACKNOWLEDGED') return 'IN_PROGRESS' as const
    if (status === 'IN_PROGRESS') return 'RESOLVED' as const
    return null
  }

  const actOpenService = async (
    id: string,
    status: 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED',
  ) => {
    try {
      setBusyId(id)
      setError('')
      await api.updateServiceRequest(auth.token, id, {
        status,
        ...(status === 'RESOLVED'
          ? {
              performedBy: resolveWho[id]?.trim() || null,
              resolutionNotes: resolveNotes[id]?.trim() || null,
            }
          : {}),
      })
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pedido')
    } finally {
      setBusyId(null)
    }
  }

  const notifyWhatsapp = async (id: string) => {
    try {
      setBusyId(id)
      setError('')
      const { url } = await api.getServiceRequestWhatsappLink(auth.token, id)
      window.open(url, '_blank', 'noopener,noreferrer')
      await api.markServiceRequestNotified(auth.token, id)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo avisar por WhatsApp')
    } finally {
      setBusyId(null)
    }
  }

  const actService = async (id: string, action: 'approve' | 'reject') => {
    try {
      setBusyId(id)
      setError('')
      if (action === 'approve') await api.approveServiceRequest(auth.token, id)
      else await api.rejectServiceRequest(auth.token, id)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pedido')
    } finally {
      setBusyId(null)
    }
  }

  const markPhotoSeen = async (photo: PendingPhoto) => {
    try {
      setBusyId(photo.id)
      setError('')
      await api.reviewPhoto(auth.token, photo.animalId || photo.animal.id, photo.id)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la foto')
    } finally {
      setBusyId(null)
    }
  }

  const statusLabel =
    pumpStatus === 'ON' ? 'Encendida' : pumpStatus === 'OFF' ? 'Apagada' : 'Sin datos'

  const isLoading = !ready || loading
  const countValue = (n: number) => (isLoading ? '—' : n)

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Bomba de vacío"
          value={
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${pumpStatus === 'ON' ? 'bg-primary-light' : 'bg-ink-muted'}`}
              />
              {isLoading ? '—' : statusLabel}
            </span>
          }
          detail={!isLoading && lastChangeAt ? `Último cambio: ${formatTime(lastChangeAt)}` : undefined}
        />
        <StatCard
          label="Service por aprobar"
          value={countValue(pendingServices.length)}
          tone={!isLoading && pendingServices.length > 0 ? 'warn' : undefined}
        />
        <StatCard
          label="Fotos por revisar"
          value={countValue(pendingPhotos.length)}
          tone={!isLoading && pendingPhotos.length > 0 ? 'warn' : undefined}
        />
      </div>

      <Card title="Piezas por cambiar">
        {isLoading ? (
          <EmptyState>Cargando...</EmptyState>
        ) : dueParts.length === 0 ? (
          <EmptyState>Ninguna pieza próxima o vencida</EmptyState>
        ) : (
          <ul className="space-y-3">
            {dueParts.map((p) => (
              <li key={p.id} className="border border-line rounded-lg p-4 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedIds[p.id])}
                      onChange={(e) => setSelectedIds((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                    />
                    {p.partType.name}
                    {p.label ? ` · ${p.label}` : ''}
                    {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ''}
                  </label>
                  <Badge tone={p.life?.status === 'OVERDUE' ? 'danger' : 'warn'}>
                    {p.life?.status === 'OVERDUE' ? 'Para cambiar' : 'Cambiar pronto'}
                  </Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  Avance: {Math.round(Math.min(p.life?.percent ?? 0, 1) * 100)}%
                  {p.life?.estimatedReplacementDate
                    ? ` · estimado ${new Date(p.life.estimatedReplacementDate).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
                    : ''}
                </p>
                {(daysOverdue(p) ?? 0) > 14 ? (
                  <p className="text-sm text-accent-text">
                    ¿Ya se cambió? Registralo para que la cuenta de vida útil quede al día.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!isLoading && dueParts.length > 0 ? (
          <div className="pt-3 border-t border-line space-y-3">
            <div className="flex flex-wrap gap-2">
              {INSTALL_CHIPS.map((c) => (
                <Button key={c.key} variant={chip === c.key ? 'primary' : 'secondary'} onClick={() => setChip(c.key)}>
                  {c.label}
                </Button>
              ))}
              <Button variant={chip === 'other' ? 'primary' : 'secondary'} onClick={() => setChip('other')}>
                Fecha
              </Button>
            </div>
            {chip === 'other' ? (
              <Field label="AAAA-MM-DD" value={otherDate} onChange={(e) => setOtherDate(e.target.value)} />
            ) : null}
            <Button
              disabled={busyId === 'batch'}
              onClick={() => void markChanged()}
            >
              Marcar como cambiadas
            </Button>
            <p className="text-sm text-ink-muted">
              Para comprar:{' '}
            {Object.values(
              dueParts.reduce<Record<string, { name: string; units: number }>>((acc, p) => {
                const qty = p.quantityPerInstance ?? p.partType.quantityPerInstance ?? 1
                const cur = acc[p.partType.id] ?? { name: p.partType.name.toLowerCase(), units: 0 }
                cur.units += qty
                acc[p.partType.id] = cur
                return acc
              }, {}),
            )
              .map((row) => `${row.units} ${row.name}`)
              .join(' · ')}
          </p>
          </div>
        ) : null}
      </Card>

      <Card title="Pedidos de empresas sin panel">
        {isLoading ? (
          <EmptyState>Cargando...</EmptyState>
        ) : openNoPanel.length === 0 ? (
          <EmptyState>No hay pedidos en curso de empresas sin panel</EmptyState>
        ) : (
          <ul className="space-y-3">
            {openNoPanel.map((r) => {
              const next = nextStatusOf(r.status)
              const nextLabel =
                next === 'ACKNOWLEDGED'
                  ? 'Marcar recibido'
                  : next === 'IN_PROGRESS'
                    ? 'En curso'
                    : next === 'RESOLVED'
                      ? 'Resolver'
                      : ''
              return (
                <li key={r.id} className="border border-line rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.urgency === 'URGENT' ? 'danger' : 'neutral'}>
                        {r.urgency === 'URGENT' ? 'URGENTE' : 'Normal'}
                      </Badge>
                      <p className="font-semibold text-ink">{CATEGORY_LABEL[r.category] ?? r.category}</p>
                    </div>
                    <p className="text-xs text-ink-muted">{SERVICE_STATUS_ES[r.status] ?? r.status}</p>
                  </div>
                  <p className="text-sm text-ink-muted">{r.serviceProvider?.name}</p>
                  <p className="text-sm text-ink">{r.description}</p>
                  {r.performedBy ? (
                    <p className="text-sm text-ink-muted">Hizo el servicio: {r.performedBy}</p>
                  ) : null}
                  {r.serviceProvider?.hasPhone ? (
                    r.providerNotifiedAt ? (
                      <p className="text-xs text-ink-muted">
                        Avisado el{' '}
                        {new Date(r.providerNotifiedAt).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busyId === r.id}
                        onClick={() => void notifyWhatsapp(r.id)}
                      >
                        Avisar por WhatsApp
                      </Button>
                    )
                  ) : null}
                  {next === 'RESOLVED' ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field
                        label="Quién lo hizo"
                        value={resolveWho[r.id] ?? ''}
                        onChange={(e) => setResolveWho((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <Field
                        label="Notas"
                        value={resolveNotes[r.id] ?? ''}
                        onChange={(e) => setResolveNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {next ? (
                      <Button disabled={busyId === r.id} onClick={() => void actOpenService(r.id, next)}>
                        {nextLabel}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      disabled={busyId === r.id}
                      onClick={() => void actOpenService(r.id, 'CANCELLED')}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Service pendiente de tu OK">
        {isLoading ? (
          <EmptyState>Cargando...</EmptyState>
        ) : pendingServices.length === 0 ? (
          <EmptyState>No hay solicitudes esperando tu aprobación</EmptyState>
        ) : (
          <ul className="space-y-3">
            {pendingServices.map((r) => (
              <li key={r.id} className="border border-line rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.urgency === 'URGENT' ? 'danger' : 'neutral'}>
                      {r.urgency === 'URGENT' ? 'URGENTE' : 'Normal'}
                    </Badge>
                    <p className="font-semibold text-ink">{CATEGORY_LABEL[r.category] ?? r.category}</p>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {new Date(r.createdAt).toLocaleString('es-AR')}
                  </p>
                </div>
                <p className="text-sm text-ink">{r.description}</p>
                <p className="text-xs text-ink-muted">Pidió: {r.createdBy?.name ?? 'Alguien del tambo'}</p>
                <div className="flex gap-2 pt-1">
                  <Button disabled={busyId === r.id} onClick={() => void actService(r.id, 'approve')}>
                    Aprobar
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => void actService(r.id, 'reject')}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Fotos de consulta sin revisar">
        {isLoading ? (
          <EmptyState>Cargando...</EmptyState>
        ) : pendingPhotos.length === 0 ? (
          <EmptyState>No hay fotos de consulta pendientes</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingPhotos.map((p) => (
              <li key={p.id} className="border border-line rounded-lg p-3 space-y-2">
                {p.photoUrl ? (
                  <img
                    src={photoFileUrl(auth.token, p.photoUrl)}
                    alt={`Consulta caravana ${p.animal?.earTag ?? ''}`}
                    className="w-full max-h-48 rounded-lg border border-line object-cover"
                  />
                ) : null}
                <p className="font-semibold text-ink">Caravana {p.animal?.earTag ?? '—'}</p>
                {p.note ? <p className="text-sm text-ink">{p.note}</p> : null}
                <p className="text-xs text-ink-muted">
                  {new Date(p.takenAt).toLocaleString('es-AR')}
                </p>
                <Button disabled={busyId === p.id} onClick={() => void markPhotoSeen(p)}>
                  Marcar como visto
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Bomba de vacío">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : !tamboId ? (
          <EmptyState>No hay tambos para mostrar.</EmptyState>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-2xl font-bold text-ink">{statusLabel}</p>
              {lastChangeAt ? (
                <p className="text-sm text-ink-muted mt-1">
                  Último cambio: {new Date(lastChangeAt).toLocaleString('es-AR')}
                </p>
              ) : (
                <p className="text-sm text-ink-muted mt-1">Todavía no hay un cambio registrado.</p>
              )}
            </div>

            <div>
              <h5 className="text-sm font-semibold text-ink mb-2">Intervalos de hoy</h5>
              {intervals.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin actividad registrada hoy</p>
              ) : (
                <ul className="divide-y divide-line border border-line rounded-lg">
                  {intervals.map((interval) => (
                    <li
                      key={`${interval.deviceId}-${interval.start}`}
                      className="px-4 py-2.5 text-sm flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-2 text-ink">
                        {formatTime(interval.start)} –{' '}
                        {interval.ongoing || !interval.end ? (
                          <Badge tone="ok">en curso</Badge>
                        ) : (
                          formatTime(interval.end)
                        )}
                      </span>
                      <span className="text-ink-muted">
                        {formatDuration(interval.durationMinutes, interval.ongoing)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
