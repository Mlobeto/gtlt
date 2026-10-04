import { useCallback, useEffect, useState } from 'react'
import { api, type AdminPartType, type PartFieldKind, type PartTypeField } from '../lib/api'
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

const emptyFieldForm = {
  label: '',
  kind: 'TEXT' as PartFieldKind,
  unit: '',
  options: '',
  required: false,
  min: '',
  max: '',
  helpText: '',
  sortOrder: '0',
}

const KIND_LABEL: Record<PartFieldKind, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  SELECT: 'Selector',
  BOOLEAN: 'Sí / No',
}

export function PartTypesAdminTab({ auth }: { auth: AuthToken }) {
  const [items, setItems] = useState<AdminPartType[]>([])
  const [editing, setEditing] = useState<AdminPartType | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [fieldForm, setFieldForm] = useState(emptyFieldForm)
  const [editingField, setEditingField] = useState<PartTypeField | null>(null)

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
      pattern: item.pattern === 'BRANDED' ? 'REACTIVE' : item.pattern,
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
            ? { ...payload(), pattern: undefined }
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

  const startFieldCreate = () => {
    setEditingField(null)
    setFieldForm(emptyFieldForm)
  }

  const startFieldEdit = (field: PartTypeField) => {
    setEditingField(field)
    setFieldForm({
      label: field.label,
      kind: field.kind,
      unit: field.unit ?? '',
      options: field.options.join(', '),
      required: field.required,
      min: field.min != null ? String(field.min) : '',
      max: field.max != null ? String(field.max) : '',
      helpText: field.helpText ?? '',
      sortOrder: String(field.sortOrder),
    })
  }

  const saveField = async () => {
    if (!editing) return
    const options = fieldForm.options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    const data = {
      label: fieldForm.label.trim(),
      kind: fieldForm.kind,
      unit: fieldForm.unit.trim() || null,
      options: fieldForm.kind === 'SELECT' ? options : [],
      required: fieldForm.required,
      min: fieldForm.kind === 'NUMBER' && fieldForm.min ? Number(fieldForm.min) : null,
      max: fieldForm.kind === 'NUMBER' && fieldForm.max ? Number(fieldForm.max) : null,
      helpText: fieldForm.helpText.trim() || null,
      sortOrder: Number(fieldForm.sortOrder) || 0,
    }
    try {
      setBusy(true)
      setError('')
      if (editingField) {
        const { kind: _kind, ...patch } = data
        await api.updateAdminPartTypeField(auth.token, editing.id, editingField.id, {
          ...patch,
          ...(editingField.kind === fieldForm.kind ? {} : { kind: fieldForm.kind }),
        })
        setStatus('Campo actualizado.')
      } else {
        await api.createAdminPartTypeField(auth.token, editing.id, data)
        setStatus('Campo creado.')
      }
      setEditingField(null)
      setFieldForm(emptyFieldForm)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el campo')
    } finally {
      setBusy(false)
    }
  }

  const toggleField = async (field: PartTypeField) => {
    if (!editing) return
    try {
      setBusy(true)
      setError('')
      await api.updateAdminPartTypeField(auth.token, editing.id, field.id, { active: !field.active })
      setStatus(field.active ? 'Campo desactivado.' : 'Campo reactivado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el campo')
    } finally {
      setBusy(false)
    }
  }

  const fields = editing ? items.find((i) => i.id === editing.id)?.fields ?? editing.fields ?? [] : []
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
                        <Button variant="ghost" disabled={busy} onClick={() => void toggleActive(item)}>
                          {item.active ? 'Desactivar' : 'Reactivar'}
                        </Button>
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
              {branded
                ? ' Este tipo histórico sigue como BRANDED; la ficha se arma con campos, igual que el resto.'
                : ''}
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
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void save()}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                  setEditingField(null)
                  setFieldForm(emptyFieldForm)
                }}
              >
                Cancelar
              </Button>
            </div>

            {editing ? (
              <div className="space-y-3 border-t border-line pt-4">
                <h3 className="text-sm font-semibold text-ink">Campos de la ficha</h3>
                <p className="text-sm text-ink-muted">
                  La clave se genera de la etiqueta y no se edita. El tipo no se puede cambiar si ya hay
                  valores cargados. No se borran: se desactivan.
                </p>
                {fields.length === 0 ? (
                  <p className="text-sm text-ink-muted">Todavía no hay campos.</p>
                ) : (
                  <ul className="space-y-2">
                    {fields.map((field) => (
                      <li key={field.id} className="border border-line rounded-lg p-3 space-y-1">
                        <p className="text-sm text-ink">
                          {field.label} · {KIND_LABEL[field.kind]}
                          {field.unit ? ` · ${field.unit}` : ''}
                          {field.required ? ' · obligatorio' : ''}
                          {field.active ? '' : ' · inactivo'}
                        </p>
                        <p className="text-sm text-ink-muted">clave: {field.key}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" onClick={() => startFieldEdit(field)}>
                            Editar
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => void toggleField(field)}>
                            {field.active ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-ink">
                    {editingField ? `Editar campo · ${editingField.label}` : 'Agregar campo'}
                  </p>
                  {editingField ? (
                    <p className="text-sm text-ink-muted">
                      Si ya hay piezas con valor, el tipo de campo no se puede cambiar.
                    </p>
                  ) : null}
                  <Field
                    label="Etiqueta"
                    value={fieldForm.label}
                    onChange={(e) => setFieldForm((f) => ({ ...f, label: e.target.value }))}
                  />
                  <SelectField
                    label="Tipo"
                    value={fieldForm.kind}
                    onChange={(e) => setFieldForm((f) => ({ ...f, kind: e.target.value as PartFieldKind }))}
                  >
                    <option value="TEXT">Texto</option>
                    <option value="NUMBER">Número</option>
                    <option value="SELECT">Selector</option>
                    <option value="BOOLEAN">Sí / No</option>
                  </SelectField>
                  {fieldForm.kind === 'NUMBER' ? (
                    <>
                      <Field
                        label="Unidad"
                        hint="Ej. L/min, HP, L"
                        value={fieldForm.unit}
                        onChange={(e) => setFieldForm((f) => ({ ...f, unit: e.target.value }))}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Mínimo"
                          type="number"
                          value={fieldForm.min}
                          onChange={(e) => setFieldForm((f) => ({ ...f, min: e.target.value }))}
                        />
                        <Field
                          label="Máximo"
                          type="number"
                          value={fieldForm.max}
                          onChange={(e) => setFieldForm((f) => ({ ...f, max: e.target.value }))}
                        />
                      </div>
                    </>
                  ) : null}
                  {fieldForm.kind === 'SELECT' ? (
                    <Field
                      label="Opciones"
                      hint="Separadas por coma"
                      value={fieldForm.options}
                      onChange={(e) => setFieldForm((f) => ({ ...f, options: e.target.value }))}
                    />
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={fieldForm.required}
                      onChange={(e) => setFieldForm((f) => ({ ...f, required: e.target.checked }))}
                    />
                    Obligatorio
                  </label>
                  <Field
                    label="Ayuda"
                    value={fieldForm.helpText}
                    onChange={(e) => setFieldForm((f) => ({ ...f, helpText: e.target.value }))}
                  />
                  <Field
                    label="Orden"
                    type="number"
                    value={fieldForm.sortOrder}
                    onChange={(e) => setFieldForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy} onClick={() => void saveField()}>
                      {editingField ? 'Guardar campo' : 'Agregar campo'}
                    </Button>
                    {editingField ? (
                      <Button variant="ghost" onClick={startFieldCreate}>
                        Cancelar campo
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="border border-line rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-ink">Vista previa (celular)</p>
                  {fields.filter((f) => f.active).length === 0 ? (
                    <p className="text-sm text-ink-muted">Sin campos activos.</p>
                  ) : (
                    fields
                      .filter((f) => f.active)
                      .map((field) => (
                        <p key={field.id} className="text-sm text-ink">
                          {field.label}
                          {field.required ? ' *' : ''}
                          {field.kind === 'NUMBER' && field.unit ? ` (${field.unit})` : ''}
                          {field.kind === 'SELECT' ? ` · ${field.options.join(' / ')}` : ''}
                          {field.kind === 'BOOLEAN' ? ' · Sí / No' : ''}
                        </p>
                      ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
