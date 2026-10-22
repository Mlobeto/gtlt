import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/api'
import { timeAgo } from '../lib/format'
import type { AuthToken } from '../types/auth'
import type { AppNotification, NotificationType } from '../types/dashboard'
import { Button } from './ui'

export type BellTab = 'today' | 'works' | 'animals'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-accent'

function payloadAnimalId(payload: AppNotification['payload']): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const value = payload.animalId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function destinationForNotification(
  type: NotificationType,
  payload: AppNotification['payload'],
): { tab: BellTab; animalId?: string } | null {
  if (
    type === 'SERVICE_REQUESTED' ||
    type === 'SERVICE_PENDING_APPROVAL' ||
    type === 'SERVICE_APPROVED' ||
    type === 'SERVICE_REJECTED'
  ) {
    return { tab: 'today' }
  }
  if (type === 'WORK_REPORT_SUBMITTED') return { tab: 'works' }
  if (type === 'ANIMAL_PHOTO_CONSULT') {
    return { tab: 'animals', animalId: payloadAnimalId(payload) }
  }
  return null
}

export function NotificationsBell({
  auth,
  onNavigate,
  activeTab,
}: {
  auth: AuthToken
  onNavigate: (destino: { tab: BellTab; animalId?: string }) => void
  activeTab?: string
}) {
  const panelId = useId()
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFetchRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  const closePanel = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => bellRef.current?.focus())
  }, [])

  const load = useCallback(async (force = false) => {
    const t = Date.now()
    if (!force && t - lastFetchRef.current < 10_000) return
    lastFetchRef.current = t
    try {
      const data = await api.getNotifications(auth.token, false)
      setItems(data.items || [])
      setUnreadCount(data.unreadCount ?? 0)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los avisos')
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    void load(true)
  }, [auth.token, load])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onFocus = () => {
      void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  useEffect(() => {
    setOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!open) return
    setNow(new Date())
    const first = panelRef.current?.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePanel()
      }
    }
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || bellRef.current?.contains(target)) return
      closePanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, closePanel])

  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount)
  const ariaLabel = unreadCount > 0 ? `Avisos, ${unreadCount} sin leer` : 'Avisos'

  const markOne = async (item: AppNotification) => {
    const wasUnread = !item.readAt
    const prevItems = items
    const prevUnread = unreadCount
    if (wasUnread) {
      const stamped = new Date().toISOString()
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, readAt: stamped } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    closePanel()
    const dest = destinationForNotification(item.type, item.payload)
    if (dest) onNavigate(dest)
    try {
      await api.markNotificationRead(auth.token, item.id)
    } catch (err) {
      setItems(prevItems)
      setUnreadCount(prevUnread)
      setError(err instanceof Error ? err.message : 'No se pudo marcar el aviso')
    }
  }

  const markAll = async () => {
    if (unreadCount === 0) return
    const prevItems = items
    const prevUnread = unreadCount
    const stamped = new Date().toISOString()
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: stamped })))
    setUnreadCount(0)
    try {
      await api.markAllNotificationsRead(auth.token)
    } catch (err) {
      setItems(prevItems)
      setUnreadCount(prevUnread)
      setError(err instanceof Error ? err.message : 'No se pudieron marcar los avisos')
    }
  }

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`relative h-11 w-11 shrink-0 rounded-full border-[1.5px] border-ink bg-transparent inline-flex items-center justify-center text-ink ${focusRing}`}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-danger text-white text-[11px] font-bold leading-none inline-flex items-center justify-center border-2 border-accent">
            {unreadLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Avisos"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,400px)] max-h-[70vh] overflow-y-auto bg-surface border border-line rounded-[28px] shadow-lg p-4"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[17px] font-bold text-ink">Avisos</h2>
            <Button
              variant="ghost"
              className="min-h-11 shrink-0 text-sm"
              disabled={unreadCount === 0}
              onClick={() => void markAll()}
            >
              Marcar todos como leídos
            </Button>
          </div>

          {error ? (
            <div className="mb-3 px-3 py-2 rounded-lg bg-danger-soft text-danger text-sm">
              <p>{error}</p>
              <Button variant="ghost" className="min-h-11 mt-1 px-0" onClick={() => void load(true)}>
                Reintentar
              </Button>
            </div>
          ) : null}

          {loading && items.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">No hay avisos.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-t border-line first:border-t-0">
                  <button
                    type="button"
                    onClick={() => void markOne(item)}
                    className={`w-full text-left min-h-11 py-3 px-1 flex gap-3 rounded-xl ${focusRing} hover:bg-subtle`}
                  >
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-accent'}`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink text-[15px]">{item.title}</span>
                      <span className="block text-ink-muted text-[14px] line-clamp-2 mt-0.5">{item.body}</span>
                      <span className="block text-ink-muted text-[13px] mt-1">{timeAgo(item.createdAt, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
