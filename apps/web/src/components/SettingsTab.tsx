import { useEffect, useState } from 'react'
import {
  api,
  type VisibleServiceProvider,
} from '../lib/api'
import type { AuthToken } from '../types/auth'
import { PartLifeSettings } from './PartLifeSettings'
import { TambosSection } from './TambosSection'
import { ChangePasswordScreen } from './ChangePasswordScreen'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, inputClass } from './ui'

interface SettingsTabProps {
  auth: AuthToken
  onSessionChange?: (next: AuthToken) => void
}

const PRIVATE_COMPANY_WARNING =
  'Esta empresa no usa CAL. Solo las empresas socias (Lobeto Tambos, Omega) pueden gestionar el pedido y enviarte informes desde la aplicación.'

function transparency(p: { name: string; hasPanel: boolean } | null) {
  if (!p) return ''
  if (p.hasPanel) return 'Lo ve en su panel.'
  return `${p.name} todavía no ve los pedidos en CAL: avisale por WhatsApp después de pedir.`
}

type CompanyForm = {
  name: string
  contactName: string
  contactPhone: string
  active: boolean
}

const emptyForm: CompanyForm = {
  name: '',
  contactName: '',
  contactPhone: '',
  active: true,
}

export function SettingsTab({ auth, onSessionChange }: SettingsTabProps) {
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])
  const [tamboId, setTamboId] = useState('')
  const [companies, setCompanies] = useState<VisibleServiceProvider[]>([])
  const [selected, setSelected] = useState<VisibleServiceProvider | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState<VisibleServiceProvider | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CompanyForm>(emptyForm)
  const [changeOpen, setChangeOpen] = useState(false)
  const [pendingDefaultId, setPendingDefaultId] = useState('')

  const loadCompanies = async (forTamboId?: string) => {
    const result = await api.getServiceProviders(auth.token, forTamboId || tamboId || undefined)
    const items = result.items || []
    setCompanies(items)
    setSelected(items.find((p) => p.isDefaultForTambo) ?? null)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getTambos(auth.token)
        const items = result.items || []
        setTambos(items)
        if (items[0]) setTamboId(items[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar tambos')
      }
    }
    void load()
  }, [auth])

  useEffect(() => {
    if (!tamboId) return
    const loadProvider = async () => {
      try {
        setError('')
        await loadCompanies(tamboId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar empresas')
      }
    }
    void loadProvider()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, tamboId])

  const saveDefault = async (serviceProviderId: string) => {
    const next = companies.find((p) => p.id === serviceProviderId)
    if (
      !window.confirm(
        `¿Dejar a ${next?.name ?? 'esta empresa'} como proveedor predeterminado de este tambo?`,
      )
    ) {
      return
    }
    try {
      setSaving(true)
      setError('')
      await api.updateTamboServiceProvider(auth.token, tamboId, serviceProviderId)
      await loadCompanies(tamboId)
      setChangeOpen(false)
      setStatus('Proveedor predeterminado actualizado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setForm(emptyForm)
    setStatus('')
  }

  const startEdit = (item: VisibleServiceProvider) => {
    setCreating(false)
    setEditing(item)
    setForm({
      name: item.name,
      contactName: item.contactName ?? '',
      contactPhone: item.contactPhone ?? '',
      active: item.active,
    })
    setStatus('')
  }

  const saveCompany = async () => {
    try {
      setSaving(true)
      setError('')
      if (creating) {
        await api.createServiceProvider(auth.token, {
          name: form.name.trim(),
          contactName: form.contactName.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
        })
        setStatus('Empresa creada.')
      } else if (editing) {
        await api.updateServiceProvider(auth.token, editing.id, {
          name: form.name.trim(),
          contactName: form.contactName.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          active: form.active,
        })
        setStatus('Empresa actualizada.')
      }
      setCreating(false)
      setEditing(null)
      await loadCompanies(tamboId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la empresa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {onSessionChange ? (
        <ChangePasswordScreen auth={auth} title="Cambiar mi clave" onChanged={onSessionChange} />
      ) : null}
      <TambosSection token={auth.token} />
      <PartLifeSettings token={auth.token} />

      <Card title="Proveedor predeterminado">
        <div className="space-y-4">
          {tambos.length > 1 && (
            <select
              value={tamboId}
              onChange={(e) => {
                setTamboId(e.target.value)
                setChangeOpen(false)
              }}
              className={`${inputClass} max-w-md`}
            >
              {tambos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {status && (
            <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
              {status}
            </div>
          )}
          {selected ? (
            <>
              <p className="text-sm text-ink">
                Se pide a <span className="font-semibold">{selected.name}</span>
                {selected.isPrivate ? ' · privada' : ''}
              </p>
              <p className="text-sm text-ink-muted">{transparency(selected)}</p>
            </>
          ) : (
            <EmptyState>Este tambo no tiene proveedor predeterminado.</EmptyState>
          )}
          <Button variant="ghost" onClick={() => setChangeOpen((v) => !v)}>
            Cambiar proveedor predeterminado
          </Button>
          {changeOpen ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-muted">
                En la web el cambio queda como predeterminado de este tambo. “Solo esta vez” existe
                únicamente al pedir un service desde el celular.
              </p>
              <select
                value={pendingDefaultId || selected?.id || ''}
                onChange={(e) => setPendingDefaultId(e.target.value)}
                className={`${inputClass} max-w-md`}
              >
                {companies
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isPrivate ? ' (privada)' : ''}
                    </option>
                  ))}
              </select>
              <Button
                disabled={saving || !(pendingDefaultId || selected?.id)}
                onClick={() => void saveDefault(pendingDefaultId || selected?.id || '')}
              >
                Confirmar cambio
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Empresas de service"
        action={
          <Button variant="secondary" onClick={startCreate}>
            Nueva empresa
          </Button>
        }
      >
        <div className="space-y-4">
          {companies.length === 0 ? (
            <EmptyState>No hay empresas visibles.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {companies.map((p) => (
                <li
                  key={p.id}
                  className="border border-line rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-ink">{p.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge tone={p.isPrivate ? 'info' : 'ok'}>
                        {p.isPrivate ? 'Privada' : 'Socia'}
                      </Badge>
                      {!p.active ? <Badge tone="neutral">Inactiva</Badge> : null}
                      {p.isDefaultForTambo ? <Badge tone="warn">Predeterminada</Badge> : null}
                    </div>
                  </div>
                  {p.isPrivate ? (
                    <Button variant="secondary" onClick={() => startEdit(p)}>
                      Editar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {creating || editing ? (
            <div className="border border-line rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">
                {creating ? 'Nueva empresa privada' : `Editar ${editing?.name}`}
              </p>
              <p className="text-sm text-ink-muted">{PRIVATE_COMPANY_WARNING}</p>
              <Field
                label="Nombre"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Field
                label="Contacto"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
              <Field
                label="Teléfono"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                hint="Celular con código de área. Se usa para avisar por WhatsApp."
              />
              {editing ? (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Activa
                </label>
              ) : null}
              <div className="flex gap-2">
                <Button disabled={saving} onClick={() => void saveCompany()}>
                  Guardar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreating(false)
                    setEditing(null)
                  }}
                >
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
