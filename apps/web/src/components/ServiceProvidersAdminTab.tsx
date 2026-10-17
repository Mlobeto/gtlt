import { useCallback, useEffect, useState } from 'react'
import { api, type AdminServiceProvider } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field } from './ui'

export function ServiceProvidersAdminTab({ auth }: { auth: AuthToken }) {
  const [items, setItems] = useState<AdminServiceProvider[]>([])
  const [editing, setEditing] = useState<AdminServiceProvider | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const result = await api.getAdminServiceProviders(auth.token)
      setItems((result.items || []).filter((p) => p.tenantId == null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
    }
  }, [auth.token])

  useEffect(() => {
    void load()
  }, [load])

  const startEdit = (item: AdminServiceProvider) => {
    setEditing(item)
    setContactName(item.contactName ?? '')
    setContactPhone(item.contactPhone ?? '')
    setStatus('')
  }

  const saveContact = async () => {
    if (!editing) return
    try {
      setBusy(true)
      setError('')
      await api.updateAdminServiceProvider(auth.token, editing.id, {
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
      })
      setEditing(null)
      setStatus('Contacto actualizado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el contacto')
    } finally {
      setBusy(false)
    }
  }

  const togglePanel = async (item: AdminServiceProvider) => {
    const next = !item.hasPanel
    const ok = window.confirm(
      next
        ? 'Si lo activás, la empresa gestiona sus pedidos y el dueño deja de poder cambiarles el estado. ¿Activar “Tiene panel”?'
        : 'Si lo desactivás, el dueño vuelve a poder gestionar el estado del pedido. ¿Sacar el panel?',
    )
    if (!ok) return
    try {
      setBusy(true)
      setError('')
      await api.updateAdminServiceProvider(auth.token, item.id, { hasPanel: next })
      setStatus(next ? `${item.name} ahora tiene panel.` : `${item.name} ya no tiene panel.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el panel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card title="Proveedores">
        <div className="space-y-4">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {status ? <p className="text-sm text-ink-muted">{status}</p> : null}
          {items.length === 0 ? (
            <EmptyState>No hay empresas socias en el catálogo.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {items.map((p) => (
                <li key={p.id} className="border border-line rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-sm text-ink-muted">
                        {p.contactName || p.contactPhone
                          ? [p.contactName, p.contactPhone].filter(Boolean).join(' · ')
                          : 'Sin contacto'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.hasPanel ? 'ok' : 'neutral'}>
                        {p.hasPanel ? 'Tiene panel' : 'Sin panel'}
                      </Badge>
                      <Button variant="secondary" onClick={() => startEdit(p)}>
                        Editar contacto
                      </Button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={p.hasPanel}
                      disabled={busy}
                      onChange={() => void togglePanel(p)}
                    />
                    Tiene panel
                  </label>
                  <p className="text-xs text-ink-muted">
                    Si lo activás, la empresa gestiona sus pedidos y el dueño deja de poder
                    cambiarles el estado.
                  </p>
                </li>
              ))}
            </ul>
          )}

          {editing ? (
            <div className="border border-line rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">Contacto de {editing.name}</p>
              <Field label="Nombre de contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} />
              <Field
                label="Teléfono"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                hint="Celular internacional para wa.me (ej. 5491112345678)."
              />
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void saveContact()}>
                  Guardar
                </Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
