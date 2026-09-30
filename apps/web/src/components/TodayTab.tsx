import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { TamboPicker, useTamboId } from './TamboPicker'

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
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!tamboId) {
      setPumpStatus(null)
      setLastChangeAt(null)
      setIntervals([])
      setPendingServices([])
      setPendingPhotos([])
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
        const [statusRes, historyRes, servicesRes, photosRes] = await Promise.all([
          api.getPumpStatus(auth.token, tamboId),
          api.getPumpStatusHistory(auth.token, tamboId, from, to),
          api.getServiceRequests(auth.token, tamboId, 'PENDING_APPROVAL'),
          api.getPendingPhotos(auth.token, tamboId),
        ])
        if (cancelled) return
        setPumpStatus(statusRes.status)
        setLastChangeAt(statusRes.item?.occurredAt ?? null)
        setIntervals(historyRes.intervals || [])
        setPendingServices(servicesRes.items || [])
        setPendingPhotos(photosRes.items || [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar el estado de hoy')
        setPumpStatus(null)
        setLastChangeAt(null)
        setIntervals([])
        setPendingServices([])
        setPendingPhotos([])
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Hoy</h3>
        <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-gray-900">Service pendiente de tu OK</h4>
        {!ready || loading ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : pendingServices.length === 0 ? (
          <p className="text-sm text-gray-500">No hay solicitudes esperando tu aprobación</p>
        ) : (
          <ul className="space-y-3">
            {pendingServices.map((r) => (
              <li key={r.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-gray-900">
                    {r.urgency === 'URGENT' ? 'URGENTE · ' : ''}
                    {CATEGORY_LABEL[r.category] ?? r.category}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleString('es-AR')}
                  </p>
                </div>
                <p className="text-sm text-gray-700">{r.description}</p>
                <p className="text-xs text-gray-500">Pidió: {r.createdBy?.name ?? 'Alguien del tambo'}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void actService(r.id, 'approve')}
                    className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void actService(r.id, 'reject')}
                    className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h4 className="font-semibold text-gray-900">Fotos de consulta sin revisar</h4>
        {!ready || loading ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : pendingPhotos.length === 0 ? (
          <p className="text-sm text-gray-500">No hay fotos de consulta pendientes</p>
        ) : (
          <ul className="space-y-3">
            {pendingPhotos.map((p) => (
              <li key={p.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt={`Consulta caravana ${p.animal?.earTag ?? ''}`}
                    className="max-h-48 rounded-lg border border-gray-100 object-cover"
                  />
                ) : null}
                <p className="font-medium text-gray-900">Caravana {p.animal?.earTag ?? '—'}</p>
                {p.note ? <p className="text-sm text-gray-700">{p.note}</p> : null}
                <p className="text-xs text-gray-500">
                  {new Date(p.takenAt).toLocaleString('es-AR')}
                </p>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void markPhotoSeen(p)}
                  className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Marcar como visto
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h4 className="font-semibold text-gray-900">Bomba de vacío</h4>

        {!ready || loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : !tamboId ? (
          <p className="text-sm text-gray-500">No hay tambos para mostrar.</p>
        ) : (
          <>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{statusLabel}</p>
              {lastChangeAt ? (
                <p className="text-sm text-gray-500 mt-1">
                  Último cambio: {new Date(lastChangeAt).toLocaleString('es-AR')}
                </p>
              ) : (
                <p className="text-sm text-gray-500 mt-1">Todavía no hay un cambio registrado.</p>
              )}
            </div>

            <div>
              <h5 className="text-sm font-semibold text-gray-700 mb-2">Intervalos de hoy</h5>
              {intervals.length === 0 ? (
                <p className="text-sm text-gray-500">Sin actividad registrada hoy</p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {intervals.map((interval) => (
                    <li
                      key={`${interval.deviceId}-${interval.start}`}
                      className="px-3 py-2 text-sm flex justify-between gap-4"
                    >
                      <span className="text-gray-800">
                        {formatTime(interval.start)} –{' '}
                        {interval.ongoing || !interval.end ? 'en curso' : formatTime(interval.end)}
                      </span>
                      <span className="text-gray-500">
                        {formatDuration(interval.durationMinutes, interval.ongoing)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
