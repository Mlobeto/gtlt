import { useCallback, useEffect, useState } from 'react'
import { api, type AdminPartType } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, TextareaField } from './ui'

const emptyForm = {
  name: '',
  description: '',
  appliesPerBajada: true,
  pattern: 'USAGE_BASED' as 'REACTIVE' | 'USAGE_BASED',
  defaultUsageThreshold: '',
  defaultLifeMonths: '',
  sortOrder: '0',
}

export function PartTypesAdminTab({ auth }: { auth: AuthToken }) {
  const [items, setItems] = useState<AdminPartType[]>([])
  const [editing, setEditing] = useState<AdminPartType | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const res = await api.getAdminPartTypes(auth.token)
      setItems(res.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
    }
  }, [auth.token])

  useEffect(() => {
    void load()
  }, [load])

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setForm(emptyForm)
  }

  const startEdit = (item: AdminPartType) => {
    setCreating(false)
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      appliesPerBajada: item.appliesPerBajada,
      pattern: item.pattern === 'BRANDED' ? 'USAGE_BASED' : item.pattern,
      defaultUsageThreshold: item.defaultUsageThreshold != null ? String(item.defaultUsageThreshold) : '',
      defaultLifeMonths: item.defaultLifeMonths != null ? String(item.defaultLifeMonths) : '',
      sortOrder: String(item.sortOrder),
    })
  }

  const payload = () => ({
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    appliesPerBajada: form.appliesPerBajada,
    pattern: form.pattern,
    defaultUsageThreshold: form.defaultUsageThreshold ? Number(form.defaultUsageThreshold) : null,
    defaultLifeMonths: form.defaultLifeMonths ? Number(form.defaultLifeMonths) : null,
    sortOrder: Number(form.sortOrder) || 0,
  })

  const save = async () => {
    try {
      setBusy(true)
      setError('')
      if (creating) {
        await api.createAdminPartType(auth.token, payload())
        setStatus('Pieza creada. El código no se puede cambiar.')
      } else if (editing) {
        const data =
          editing.pattern === 'BRANDED'
            ? { name: form.name.trim(), description: form.description.trim() || null }
            : payload()
        await api.updateAdminPartType(auth.token, editing.id, data)
        setStatus('Pieza actualizada.')
      }
      setCreating(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (item: AdminPartType) => {
    const next = !item.active
    const ok = window.confirm(
      next
        ? '¿Reactivar esta pieza para cargas nuevas?'
        : 'Deja de ofrecerse para cargas nuevas. Las piezas ya instaladas se conservan.',
    )
    if (!ok) return
    try {
      setBusy(true)
      setError('')
      await api.updateAdminPartType(auth.token, item.id, { active: next })
      setStatus(next ? 'Pieza reactivada.' : 'Pieza desactivada.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setBusy(false)
    }
  }

  const branded = editing?.pattern === 'BRANDED'

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {status ? (
        <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
          {status}
        </div>
      ) : null}

      <Card
        title="Catálogo de piezas"
        action={
          <Button variant="secondary" onClick={startCreate}>
            Nueva pieza
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState>No hay tipos de pieza.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-ink-muted">
                  <th className="py-2 pr-3 font-semibold">Nombre</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 font-semibold">Bajada</th>
                  <th className="py-2 pr-3 font-semibold">Ordeñes</th>
                  <th className="py-2 pr-3 font-semibold">Meses</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 pr-3 font-semibold">Instaladas</th>
                  <th className="py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-ink">{item.name}</td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {item.pattern === 'BRANDED'
                        ? 'Ficha propia'
                        : item.pattern === 'USAGE_BASED'
                          ? 'Vida útil'
                          : 'Cuando falla'}
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{item.appliesPerBajada ? 'Sí' : 'No'}</td>
                    <td className="py-2 pr-3 text-ink-muted">{item.defaultUsageThreshold ?? '—'}</td>
                    <td className="py-2 pr-3 text-ink-muted">{item.defaultLifeMonths ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={item.active ? 'ok' : 'neutral'}>{item.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{item.installedCount}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={() => startEdit(item)}>
                          Editar
                        </Button>
                        {item.pattern !== 'BRANDED' ? (
                          <Button variant="ghost" disabled={busy} onClick={() => void toggleActive(item)}>
                            {item.active ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating || editing ? (
        <Card title={creating ? 'Nueva pieza' : `Editar · ${editing?.name}`}>
          <div className="space-y-3 max-w-xl">
            <p className="text-sm text-ink-muted">
              El código se genera del nombre y no se puede cambiar después.
              {branded ? ' Esta pieza tiene ficha propia: solo se editan nombre y descripción.' : ''}
            </p>
            <Field
              label="Nombre"
              hint="Ej. Tubos cortos de pulsado"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextareaField
              label="Descripción"
              hint="Aclará si incluye otras piezas o cómo se cambia."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
            {!branded ? (
              <>
                <SelectField
                  label="Patrón"
                  hint="Cuando falla = sin vencimiento. Vida útil = ordeñes y/o meses."
                  value={form.pattern}
                  onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value as 'REACTIVE' | 'USAGE_BASED' }))}
                >
                  <option value="REACTIVE">Cuando falla</option>
                  <option value="USAGE_BASED">Vida útil</option>
                </SelectField>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.appliesPerBajada}
                    onChange={(e) => setForm((f) => ({ ...f, appliesPerBajada: e.target.checked }))}
                  />
                  Se instala por bajada
                </label>
                {form.pattern === 'USAGE_BASED' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Ordeñes por defecto"
                      hint="100 a 100000. Opcional si hay meses."
                      type="number"
                      value={form.defaultUsageThreshold}
                      onChange={(e) => setForm((f) => ({ ...f, defaultUsageThreshold: e.target.value }))}
                    />
                    <Field
                      label="Meses por defecto"
                      hint="1 a 120. Opcional si hay ordeñes."
                      type="number"
                      value={form.defaultLifeMonths}
                      onChange={(e) => setForm((f) => ({ ...f, defaultLifeMonths: e.target.value }))}
                    />
                  </div>
                ) : null}
                <Field
                  label="Orden"
                  hint="Las de bajada van primero (números chicos)."
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void save()}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
