import { useEffect, useState } from 'react'
import { api, type PartInstanceItem } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { TamboPicker, useTamboId } from './TamboPicker'
import { Badge, Button, Card, EmptyState, ErrorBanner, StatCard } from './ui'

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

type PendingService = {
  id: string
  category: string
  description: string
  urgency: string
  createdAt: string
  createdBy?: { name: string }
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

export function TodayTab({ auth }: { auth: AuthToken }) {
  const { tamboId, setTamboId, ready, error, setError } = useTamboId(auth.token)
  const [loading, setLoading] = useState(false)
  const [pumpStatus, setPumpStatus] = useState<'ON' | 'OFF' | null>(null)
  const [lastChangeAt, setLastChangeAt] = useState<string | null>(null)
  const [intervals, setIntervals] = useState<PumpInterval[]>([])
  const [pendingServices, setPendingServices] = useState<PendingService[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const [dueParts, setDueParts] = useState<PartInstanceItem[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!tamboId) {
      setPumpStatus(null)
      setLastChangeAt(null)
      setIntervals([])
      setPendingServices([])
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
        const [statusRes, historyRes, servicesRes, photosRes, partsRes] = await Promise.all([
          api.getPumpStatus(auth.token, tamboId),
          api.getPumpStatusHistory(auth.token, tamboId, from, to),
          api.getServiceRequests(auth.token, tamboId, 'PENDING_APPROVAL'),
          api.getPendingPhotos(auth.token, tamboId),
          api.getPartInstances(auth.token, tamboId),
        ])
        if (cancelled) return
        setPumpStatus(statusRes.status)
        setLastChangeAt(statusRes.item?.occurredAt ?? null)
        setIntervals(historyRes.intervals || [])
        setPendingServices(servicesRes.items || [])
        setPendingPhotos(photosRes.items || [])
        setDueParts(
          (partsRes.items || []).filter(
            (p) => p.life?.kind === 'USAGE_BASED' && (p.life.status === 'SOON' || p.life.status === 'OVERDUE'),
          ),
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar el estado de hoy')
        setPumpStatus(null)
        setLastChangeAt(null)
        setIntervals([])
        setPendingServices([])
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
    const [servicesRes, photosRes] = await Promise.all([
      api.getServiceRequests(auth.token, tamboId, 'PENDING_APPROVAL'),
      api.getPendingPhotos(auth.token, tamboId),
    ])
    setPendingServices(servicesRes.items || [])
    setPendingPhotos(photosRes.items || [])
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
                  <p className="font-semibold text-ink">
                    {p.partType.name}
                    {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ''}
                  </p>
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
              </li>
            ))}
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
                    src={p.photoUrl}
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
