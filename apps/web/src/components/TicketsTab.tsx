import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { SupportTicket } from '../types/dashboard'
import { Badge, Button, EmptyState, ErrorBanner, inputClass, type BadgeTone } from './ui'

interface TicketsTabProps {
  auth: AuthToken
  /** Solo DUENIO/ADMIN o desarrolladora (vía API admin) pueden actualizar estado y notas. */
  canManage: boolean
  canCreate?: boolean
  adminView?: boolean
}

export function TicketsTab({ auth, canManage, canCreate = false, adminView = false }: TicketsTabProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [internalNote, setInternalNote] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    subject: '',
    description: '',
    category: 'QUESTION' as SupportTicket['category'],
    priority: 'MEDIUM' as SupportTicket['priority'],
    tamboId: '',
  })

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const result = adminView
        ? await api.getAdminSupportTickets(auth.token, statusFilter || undefined)
        : await api.getSupportTickets(auth.token, statusFilter || undefined)
      setTickets(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canCreate) return
    api.getTambos(auth.token).then((r) => setTambos(r.items || [])).catch(() => undefined)
  }, [auth, canCreate])

  useEffect(() => {
    fetchTickets()
  }, [statusFilter])

  const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
    try {
      setUpdatingStatus(true)
      await (adminView
        ? api.updateAdminSupportTicket(auth.token, ticketId, {
            status: newStatus,
            internalNote: internalNote || undefined,
          })
        : api.updateSupportTicket(auth.token, ticketId, {
            status: newStatus,
            internalNote: internalNote || undefined,
          }))
      setInternalNote('')
      setSelectedTicket(null)
      await fetchTickets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const getPriorityTone = (priority: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      LOW: 'neutral',
      MEDIUM: 'info',
      HIGH: 'danger',
      URGENT: 'danger',
    }
    return tones[priority] || 'neutral'
  }

  const getStatusTone = (status: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      OPEN: 'ok',
      IN_REVIEW: 'warn',
      IN_PROGRESS: 'warn',
      CLOSED: 'neutral',
    }
    return tones[status] || 'neutral'
  }

  const labelClass = 'block text-sm font-semibold text-ink mb-1'
  const readonlyClass = 'text-ink bg-subtle p-3 rounded-lg'

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">Todos los estados</option>
          <option value="OPEN">Abierto</option>
          <option value="IN_REVIEW">En revisión</option>
          <option value="IN_PROGRESS">En progreso</option>
          <option value="CLOSED">Cerrado</option>
        </select>
        <Button onClick={fetchTickets}>Actualizar</Button>
        {canCreate ? (
          <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
            Nuevo ticket
          </Button>
        ) : null}
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {showCreate && canCreate ? (
        <form
          className="bg-surface border border-line rounded-xl p-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              setCreating(true)
              setError('')
              await api.createSupportTicket(auth.token, {
                subject: createForm.subject,
                description: createForm.description,
                category: createForm.category,
                priority: createForm.priority,
                tamboId: createForm.tamboId || null,
              })
              setCreateForm({
                subject: '',
                description: '',
                category: 'QUESTION',
                priority: 'MEDIUM',
                tamboId: '',
              })
              setShowCreate(false)
              await fetchTickets()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No se pudo crear el ticket')
            } finally {
              setCreating(false)
            }
          }}
        >
          <input
            required
            className={inputClass}
            placeholder="Asunto"
            value={createForm.subject}
            onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
          />
          <textarea
            required
            className={inputClass}
            rows={4}
            placeholder="Qué pasó"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              className={inputClass}
              value={createForm.category}
              onChange={(e) =>
                setCreateForm({ ...createForm, category: e.target.value as SupportTicket['category'] })
              }
            >
              <option value="BUG">Falla</option>
              <option value="QUESTION">Consulta</option>
              <option value="IMPROVEMENT">Mejora</option>
              <option value="OTHER">Otro</option>
            </select>
            <select
              className={inputClass}
              value={createForm.priority}
              onChange={(e) =>
                setCreateForm({ ...createForm, priority: e.target.value as SupportTicket['priority'] })
              }
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
            <select
              className={inputClass}
              value={createForm.tamboId}
              onChange={(e) => setCreateForm({ ...createForm, tamboId: e.target.value })}
            >
              <option value="">Sin tambo</option>
              {tambos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? 'Enviando...' : 'Crear ticket'}
          </Button>
        </form>
      ) : null}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState>No hay tickets para mostrar</EmptyState>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-surface border border-line rounded-xl p-4 hover:border-primary/40 hover:bg-subtle transition cursor-pointer"
              onClick={() => setSelectedTicket(ticket)}
            >
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{ticket.subject}</h3>
                  <p className="text-sm text-ink-muted mt-1 break-words">
                    {ticket.description.substring(0, 100)}...
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={getPriorityTone(ticket.priority)}>{ticket.priority}</Badge>
                  <Badge tone={getStatusTone(ticket.status)}>{ticket.status}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-ink-muted mt-3">
                <span>
                  {ticket.tenant?.name ? `${ticket.tenant.name} · ` : ''}
                  {ticket.user?.name} - {ticket.tambo?.name || 'Sin tambo'}
                </span>
                <span>{new Date(ticket.createdAt).toLocaleDateString('es-AR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para actualizar ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-brand-dark/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-line rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-ink mb-4">{selectedTicket.subject}</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className={labelClass}>Descripción</label>
                <p className={readonlyClass}>{selectedTicket.description}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Categoría</label>
                  <p className={readonlyClass}>{selectedTicket.category}</p>
                </div>
                <div>
                  <label className={labelClass}>Prioridad</label>
                  <p className={readonlyClass}>{selectedTicket.priority}</p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Estado</label>
                {canManage ? (
                  <select
                    value={selectedTicket.status}
                    onChange={(e) =>
                      setSelectedTicket({ ...selectedTicket, status: e.target.value as any })
                    }
                    className={inputClass}
                  >
                    <option value="OPEN">Abierto</option>
                    <option value="IN_REVIEW">En revisión</option>
                    <option value="IN_PROGRESS">En progreso</option>
                    <option value="CLOSED">Cerrado</option>
                  </select>
                ) : (
                  <p className={readonlyClass}>{selectedTicket.status}</p>
                )}
              </div>

              {canManage && (
                <div>
                  <label className={labelClass}>Nota interna</label>
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Agregar nota interna (visible solo para el equipo)"
                    className={inputClass}
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedTicket(null)}>
                {canManage ? 'Cancelar' : 'Cerrar'}
              </Button>
              {canManage && (
                <Button
                  onClick={() => handleUpdateStatus(selectedTicket.id, selectedTicket.status)}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? 'Guardando...' : 'Guardar'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
