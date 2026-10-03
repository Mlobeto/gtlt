import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { TamboPicker } from '../components/TamboPicker'
import { AppShell, type NavItem } from '../components/AppShell'
import { Badge, Button, Card, EmptyState, ErrorBanner, type BadgeTone } from '../components/ui'
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
    <div className="text-sm text-ink-muted space-y-1">
      {tambo.address ? <p>{tambo.address}</p> : null}
      {hasCoords ? (
        <a
          href={mapsUrl(lat, lng)}
          target="_blank"
          rel="noreferrer"
          className="text-primary-deep font-semibold hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Cómo llegar
        </a>
      ) : (
        <p className="text-ink-muted">Ubicación no cargada</p>
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

function statusTone(status: string): BadgeTone {
  if (status === 'OPEN') return 'ok'
  if (status === 'RESOLVED' || status === 'CANCELLED') return 'neutral'
  return 'warn'
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

  const backToInbox = () => {
    setView('inbox')
    setStatusMsg('')
    setError('')
  }

  const nav: NavItem<'inbox' | 'tambo'>[] = [{ key: 'inbox', label: 'Bandeja' }]
  if (tamboId) nav.push({ key: 'tambo', label: workspaceTambo?.name ?? 'Tambo' })

  return (
    <AppShell
      title={view === 'inbox' ? 'Bandeja' : workspaceTambo?.name ?? 'Tambo'}
      subtitle="Service"
      nav={nav}
      active={view}
      onSelect={(key) => (key === 'inbox' ? backToInbox() : setView('tambo'))}
      user={{ name: !loadingMe && user ? user.name : 'Cargando...', role: 'Técnico' }}
      onLogout={onLogout}
      headerRight={
        view === 'tambo' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={backToInbox}>
              Ver todo de nuevo
            </Button>
            <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {statusMsg && (
          <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
            {statusMsg}
          </div>
        )}

        {view === 'inbox' ? (
          <Card title="Todos tus pedidos abiertos">
            <p className="text-sm text-ink-muted mb-4">
              Pedidos de todos tus clientes. Tocá uno para entrar a ese tambo.
            </p>
            {loadingInbox ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : inbox.length === 0 ? (
              <EmptyState>No tenés pedidos pendientes en ningún tambo</EmptyState>
            ) : (
              <ul className="space-y-3">
                {inbox.map((item) => (
                  <li
                    key={item.id}
                    className="border border-line rounded-lg p-4 space-y-2 hover:border-primary/40 hover:bg-subtle transition"
                  >
                    <button
                      type="button"
                      disabled={openingId === item.id}
                      onClick={() => void openInboxItem(item)}
                      className="w-full text-left space-y-1 disabled:opacity-60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.urgency === 'URGENT' ? <Badge tone="danger">URGENTE</Badge> : null}
                          <p className="font-semibold text-ink">
                            {CATEGORY_LABEL[item.category] ?? item.category}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={statusTone(item.status)}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </Badge>
                          {item.createdAt ? (
                            <span className="text-xs text-ink-muted">
                              {new Date(item.createdAt).toLocaleString('es-AR')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm text-ink-muted">
                        {item.tenant.name} · {item.tambo.name}
                      </p>
                      <p className="text-sm text-ink">{item.description}</p>
                    </button>
                    <TamboDirections tambo={item.tambo} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <>
            <Card>
              <p className="text-sm text-ink-muted mb-2">
                Pedidos del tambo y el equipo cargado. Solo ves lo de este tambo.
              </p>
              <TamboDirections tambo={workspaceTambo} />
            </Card>

            <Card title="Pedidos">
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : !tamboId ? (
                <EmptyState>No hay tambos para mostrar.</EmptyState>
              ) : requests.length === 0 ? (
                <EmptyState>No hay pedidos abiertos.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {requests.map((r) => {
                    const next = NEXT_STATUS[r.status] ?? []
                    return (
                      <li key={r.id} className="border border-line rounded-lg p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.urgency === 'URGENT' ? <Badge tone="danger">URGENTE</Badge> : null}
                            <p className="font-semibold text-ink">{CATEGORY_LABEL[r.category] ?? r.category}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                            <span className="text-xs text-ink-muted">
                              {new Date(r.createdAt).toLocaleString('es-AR')}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-ink">{r.description}</p>
                        <TamboDirections tambo={workspaceTambo} />
                        {r.relatedPartInstance?.partType?.name ? (
                          <p className="text-xs text-ink-muted">Pieza: {r.relatedPartInstance.partType.name}</p>
                        ) : null}
                        {next.length === 0 ? (
                          <p className="text-sm text-ink-muted">Este pedido ya está cerrado.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {next.map((opt) => (
                              <Button
                                key={opt.value}
                                variant={opt.value === 'CANCELLED' ? 'secondary' : 'primary'}
                                disabled={busyId === r.id}
                                onClick={() => void changeStatus(r.id, opt.value)}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card title="Equipo del tambo">
              {loading ? (
                <EmptyState>Cargando equipo...</EmptyState>
              ) : parts.length === 0 ? (
                <EmptyState>Todavía no hay piezas cargadas.</EmptyState>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {parts.map((p) => (
                    <li key={p.id} className="border border-line rounded-lg p-4 space-y-2">
                      <p className="font-semibold text-ink">{p.partType.name}</p>
                      <p className="text-sm text-ink-muted">
                        {p.bajadaNumber != null ? `Bajada ${p.bajadaNumber}` : 'Nivel tambo'}
                        {p.brandModel ? ` · ${p.brandModel}` : ''}
                      </p>
                      {p.coldDetail ? (
                        <p className="text-sm text-ink-muted">
                          Frío: {p.coldDetail.brand} {p.coldDetail.model} · {p.coldDetail.capacityLiters} L
                        </p>
                      ) : null}
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={p.partType.name}
                          className="mt-1 w-full max-h-40 rounded-lg border border-line object-cover"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}

