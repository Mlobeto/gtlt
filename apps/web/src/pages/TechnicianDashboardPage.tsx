import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { TamboPicker } from '../components/TamboPicker'
import type { AuthToken } from '../types/auth'

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function TamboDirections({
  tambo,
}: {
  tambo?: {
    latitude?: number | null
    longitude?: number | null
    address?: string | null
  } | null
}) {
  if (!tambo) return null
  const lat = tambo.latitude
  const lng = tambo.longitude
  const hasCoords = lat != null && lng != null
  return (
    <div className="text-sm text-gray-600 space-y-1">
      {tambo.address ? <p>{tambo.address}</p> : null}
      {hasCoords ? (
        <a
          href={mapsUrl(lat, lng)}
          target="_blank"
          rel="noreferrer"
          className="text-green-700 font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Cómo llegar
        </a>
      ) : (
        <p className="text-gray-500">Ubicación no cargada</p>
      )}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Espera dueño',
  OPEN: 'Abierta',
  ACKNOWLEDGED: 'Vista',
  IN_PROGRESS: 'En curso',
  RESOLVED: 'Resuelta',
  CANCELLED: 'Cancelada',
}

const CATEGORY_LABEL: Record<string, string> = {
  VACUUM_PUMP: 'Bomba de vacío',
  COLD_EQUIPMENT: 'Equipo de frío',
  MILKING_GROUP: 'Grupo de ordeñe',
  OTHER: 'Otro',
}

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  OPEN: [
    { value: 'ACKNOWLEDGED', label: 'Marcar vista' },
    { value: 'IN_PROGRESS', label: 'Empezar' },
    { value: 'CANCELLED', label: 'Cancelar' },
  ],
  ACKNOWLEDGED: [
    { value: 'IN_PROGRESS', label: 'Empezar' },
    { value: 'RESOLVED', label: 'Resolver' },
    { value: 'CANCELLED', label: 'Cancelar' },
  ],
  IN_PROGRESS: [
    { value: 'RESOLVED', label: 'Resolver' },
    { value: 'CANCELLED', label: 'Cancelar' },
  ],
}

type InboxItem = {
  id: string
  category: string
  status: string
  urgency: string
  description: string
  createdAt: string
  tenant: { id: string; name: string }
  tambo: {
    id: string
    name: string
    latitude?: number | null
    longitude?: number | null
    address?: string | null
  }
}

type ServiceRequestItem = {
  id: string
  category: string
  description: string
  urgency: string
  status: string
  createdAt: string
  relatedPartInstance?: {
    id: string
    partType?: { name: string }
  } | null
}

type PartInstanceItem = {
  id: string
  bajadaNumber: number | null
  brandModel: string | null
  photoUrl: string | null
  partType: { name: string }
  coldDetail: {
    brand: string
    model: string
    capacityLiters: string | number
  } | null
}

interface TechnicianDashboardPageProps {
  auth: AuthToken
  onLogout: () => void
  onSessionChange: (auth: AuthToken) => void
}

export function TechnicianDashboardPage({
  auth,
  onLogout,
  onSessionChange,
}: TechnicianDashboardPageProps) {
  const [view, setView] = useState<'inbox' | 'tambo'>('inbox')
  const [tamboId, setTamboId] = useState('')
  const [loadingMe, setLoadingMe] = useState(true)
  const [user, setUser] = useState<{ name: string } | null>(null)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [workspaceTambo, setWorkspaceTambo] = useState<{
    id: string
    name: string
    latitude?: number | null
    longitude?: number | null
    address?: string | null
  } | null>(null)
  const [requests, setRequests] = useState<ServiceRequestItem[]>([])
  const [parts, setParts] = useState<PartInstanceItem[]>([])

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.getMe(auth.token)
        setUser(data.user)
      } catch (err) {
        console.error('Failed to fetch user', err)
      } finally {
        setLoadingMe(false)
      }
    }
    void fetchMe()
  }, [auth.token])

  useEffect(() => {
    if (view !== 'inbox') return
    let cancelled = false
    const load = async () => {
      try {
        setLoadingInbox(true)
        setError('')
        const result = await api.getMyServiceRequests(auth.token)
        if (cancelled) return
        setInbox(result.items || [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar tus pedidos')
        setInbox([])
      } finally {
        if (!cancelled) setLoadingInbox(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.token, view])

  useEffect(() => {
    if (view !== 'tambo' || !tamboId) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const ws = await api.getTechnicianWorkspace(auth.token, tamboId)
        if (cancelled) return
        setRequests(ws.serviceRequests || [])
        setParts(ws.partInstances || [])
        setWorkspaceTambo(ws.tambo || null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar el tambo')
        setRequests([])
        setParts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.token, tamboId, view])

  const openInboxItem = async (item: InboxItem) => {
    try {
      setOpeningId(item.id)
      setError('')
      if (item.tenant.id !== auth.tenantId) {
        const result = await api.switchTenant(auth.token, item.tenant.id)
        onSessionChange({
          token: result.accessToken,
          userId: result.user.id,
          tenantId: result.tenant.id,
          roles: result.roles,
        })
      }
      setTamboId(item.tambo.id)
      setView('tambo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el pedido')
    } finally {
      setOpeningId(null)
    }
  }

  const changeStatus = async (id: string, status: string) => {
    try {
      setBusyId(id)
      setStatusMsg('')
      await api.updateServiceRequest(auth.token, id, {
        status: status as 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED',
      })
      const ws = await api.getTechnicianWorkspace(auth.token, tamboId)
      setRequests(ws.serviceRequests || [])
      setParts(ws.partInstances || [])
      setStatusMsg(`Pedido: ${STATUS_LABEL[status] ?? status}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pedido')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">GTLT Service</h1>
            <p className="text-sm text-gray-600 mt-1">
              {!loadingMe && user ? `Hola, ${user.name} · Técnico` : 'Cargando...'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {view === 'tambo' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setView('inbox')
                    setStatusMsg('')
                    setError('')
                  }}
                  className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1"
                >
                  Ver todo de nuevo
                </button>
                <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
              </>
            ) : null}
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}
        {statusMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            {statusMsg}
          </div>
        )}

        {view === 'inbox' ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Todos tus pedidos abiertos</h2>
            <p className="text-sm text-gray-600">
              Pedidos de todos tus clientes. Tocá uno para entrar a ese tambo.
            </p>
            {loadingInbox ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            ) : inbox.length === 0 ? (
              <p className="text-sm text-gray-500">No tenés pedidos pendientes en ningún tambo</p>
            ) : (
              <ul className="space-y-3">
                {inbox.map((item) => (
                  <li key={item.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                    <button
                      type="button"
                      disabled={openingId === item.id}
                      onClick={() => void openInboxItem(item)}
                      className="w-full text-left space-y-1 disabled:opacity-50"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-semibold text-gray-900">
                          {item.urgency === 'URGENT' ? 'URGENTE · ' : ''}
                          {CATEGORY_LABEL[item.category] ?? item.category}
                        </p>
                        <p className="text-sm text-gray-500">
                          {STATUS_LABEL[item.status] ?? item.status}
                          {item.createdAt
                            ? ` · ${new Date(item.createdAt).toLocaleString('es-AR')}`
                            : ''}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">
                        {item.tenant.name} · {item.tambo.name}
                      </p>
                      <p className="text-sm text-gray-700">{item.description}</p>
                    </button>
                    <TamboDirections tambo={item.tambo} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              Pedidos del tambo y el equipo cargado. Solo ves lo de este tambo.
            </p>
            <TamboDirections tambo={workspaceTambo} />

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Pedidos</h2>
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : !tamboId ? (
                <p className="text-sm text-gray-500">No hay tambos para mostrar.</p>
              ) : requests.length === 0 ? (
                <p className="text-sm text-gray-500">No hay pedidos abiertos.</p>
              ) : (
                <ul className="space-y-3">
                  {requests.map((r) => {
                    const next = NEXT_STATUS[r.status] ?? []
                    return (
                      <li key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-semibold text-gray-900">
                            {r.urgency === 'URGENT' ? 'URGENTE · ' : ''}
                            {CATEGORY_LABEL[r.category] ?? r.category}
                          </p>
                          <p className="text-sm text-gray-500">
                            {STATUS_LABEL[r.status] ?? r.status} ·{' '}
                            {new Date(r.createdAt).toLocaleString('es-AR')}
                          </p>
                        </div>
                        <p className="text-sm text-gray-700">{r.description}</p>
                        <TamboDirections tambo={workspaceTambo} />
                        {r.relatedPartInstance?.partType?.name ? (
                          <p className="text-xs text-gray-500">Pieza: {r.relatedPartInstance.partType.name}</p>
                        ) : null}
                        {next.length === 0 ? (
                          <p className="text-sm text-gray-500">Este pedido ya está cerrado.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {next.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                disabled={busyId === r.id}
                                onClick={() => void changeStatus(r.id, opt.value)}
                                className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Equipo del tambo</h2>
              {loading ? (
                <p className="text-sm text-gray-500">Cargando equipo...</p>
              ) : parts.length === 0 ? (
                <p className="text-sm text-gray-500">Todavía no hay piezas cargadas.</p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parts.map((p) => (
                    <li key={p.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                      <p className="font-semibold text-gray-900">{p.partType.name}</p>
                      <p className="text-sm text-gray-600">
                        {p.bajadaNumber != null ? `Bajada ${p.bajadaNumber}` : 'Nivel tambo'}
                        {p.brandModel ? ` · ${p.brandModel}` : ''}
                      </p>
                      {p.coldDetail ? (
                        <p className="text-sm text-gray-600">
                          Frío: {p.coldDetail.brand} {p.coldDetail.model} · {p.coldDetail.capacityLiters} L
                        </p>
                      ) : null}
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={p.partType.name}
                          className="mt-1 max-h-40 rounded-lg border border-gray-100 object-cover"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
