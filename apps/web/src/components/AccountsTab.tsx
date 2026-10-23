import { useEffect, useState } from 'react'
import {
  api,
  type AdminInstaller,
  type HardwareBudget,
  type HardwareProductItem,
  type ServiceProviderPeriod,
} from '../lib/api'
import { generateTemporaryPassword, quantityFor } from '../lib/temp-password'
import type { AuthToken } from '../types/auth'
import type { AdminTenant } from '../types/dashboard'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField, inputClass, type BadgeTone } from './ui'

type Partner = { id: string; name: string; active: boolean; tenantId?: string | null }

type TamboForm = {
  name: string
  bajadaCount: string
  powerSupply: '' | 'MONOPHASE' | 'THREEPHASE'
  pumpCount: string
  defaultServiceProviderId: string
  equipmentProductIds: string[]
}

const emptyAccount = {
  tenantName: '',
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  ownerPassword: '',
  planCode: 'STANDARD' as 'STANDARD' | 'LIFETIME',
}

function contactLine(person: { email?: string | null; phone?: string | null; name?: string | null }) {
  return person.email || person.phone || person.name || 'Sin contacto'
}

const emptyTambo = (name = ''): TamboForm => ({
  name,
  bajadaCount: '8',
  powerSupply: '',
  pumpCount: '1',
  defaultServiceProviderId: '',
  equipmentProductIds: [],
})

const STATE_LABEL = { ACTIVE: 'Activo', INSTALLING: 'En instalación', ARCHIVED: 'Archivado' } as const

function money(n: number, currency: string) {
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${currency}`
}

export function AccountsTab({ auth }: { auth: AuthToken }) {
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [products, setProducts] = useState<HardwareProductItem[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [plans, setPlans] = useState<{ code: string; name: string; priceArs: number; priceUsd: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyAccount)
  const [tamboForm, setTamboForm] = useState<TamboForm>(emptyTambo())
  const [submitting, setSubmitting] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [addTamboForm, setAddTamboForm] = useState<TamboForm>(emptyTambo())
  const [revealedPassword, setRevealedPassword] = useState<{ userId: string; password: string } | null>(null)
  const [periodsFor, setPeriodsFor] = useState<{ tamboId: string; name: string; items: ServiceProviderPeriod[] } | null>(
    null,
  )

  const load = async () => {
    try {
      setLoading(true)
      const [tenantsRes, productsRes, providersRes, plansRes] = await Promise.all([
        api.getAdminTenants(auth.token),
        api.getAdminHardwareProducts(auth.token),
        api.getAdminServiceProviders(auth.token),
        api.getAdminPlans(auth.token),
      ])
      setTenants(tenantsRes.items || [])
      setProducts((productsRes.items || []).filter((p) => p.active))
      const items = (providersRes.items || []) as Partner[]
      setPartners(items.filter((p) => p.active && !p.tenantId))
      setPlans(plansRes.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cuentas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.ownerEmail.trim() && !formData.ownerPhone.trim()) {
      setError('Poné al menos un correo o un teléfono')
      return
    }
    try {
      setSubmitting(true)
      setError('')
      const result = await api.createAdminTenant(auth.token, {
        ...formData,
        tambo: {
          name: tamboForm.name.trim() || formData.tenantName,
          bajadaCount: Number(tamboForm.bajadaCount),
          powerSupply: tamboForm.powerSupply || null,
          pumpCount: Number(tamboForm.pumpCount),
          defaultServiceProviderId: tamboForm.defaultServiceProviderId,
          equipmentProductIds: tamboForm.equipmentProductIds,
        },
      })
      setSummary({
        tenantName: result.tenant.name,
        ownerName: result.owner.name,
        ownerEmail: result.owner.email,
        ownerPhone: result.owner.phone ?? (formData.ownerPhone.trim() || null),
        ownerPassword: formData.ownerPassword,
        tambo: result.tambo,
        budget: result.budget,
        monthlySubscription: result.monthlySubscription,
      })
      setFormData(emptyAccount)
      setTamboForm(emptyTambo())
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cuenta')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePlanChange = async (tenantId: string, planCode: 'STANDARD' | 'LIFETIME') => {
    try {
      setSavingId(tenantId)
      await api.updateAdminTenantSubscription(auth.token, tenantId, { planCode })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar el plan')
    } finally {
      setSavingId(null)
    }
  }

  const handleStatusChange = async (tenantId: string, status: 'ACTIVE' | 'CANCELED') => {
    try {
      setSavingId(tenantId)
      await api.updateAdminTenantSubscription(auth.token, tenantId, { status })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el estado')
    } finally {
      setSavingId(null)
    }
  }

  const changeProvider = async (tamboId: string, serviceProviderId: string) => {
    if (
      !window.confirm(
        'A partir de ahora los pedidos van a la nueva empresa. La empresa anterior conserva su historia.',
      )
    ) {
      return
    }
    try {
      setSavingId(tamboId)
      await api.updateAdminTamboServiceProvider(auth.token, tamboId, serviceProviderId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el proveedor')
    } finally {
      setSavingId(null)
    }
  }

  const showPeriods = async (tamboId: string, name: string) => {
    try {
      const result = await api.getAdminTamboServiceProviderPeriods(auth.token, tamboId)
      setPeriodsFor({ tamboId, name, items: result.items || [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los períodos')
    }
  }

  const resetPassword = async (userId: string) => {
    if (!window.confirm('Se va a generar una clave temporaria. El dueño la cambia al entrar.')) return
    try {
      setSavingId(userId)
      const result = await api.resetAdminUserPassword(auth.token, userId)
      setRevealedPassword({ userId, password: result.temporaryPassword })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la clave')
    } finally {
      setSavingId(null)
    }
  }

  const addTambo = async (tenant: AdminTenant) => {
    try {
      setSubmitting(true)
      setError('')
      await api.createAdminTenantTambo(auth.token, tenant.id, {
        name: addTamboForm.name.trim() || tenant.name,
        bajadaCount: Number(addTamboForm.bajadaCount),
        powerSupply: addTamboForm.powerSupply || null,
        pumpCount: Number(addTamboForm.pumpCount),
        defaultServiceProviderId: addTamboForm.defaultServiceProviderId,
        equipmentProductIds: addTamboForm.equipmentProductIds,
      })
      setAddingTo(null)
      setAddTamboForm(emptyTambo())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el tambo')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusTone = (status: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = { ACTIVE: 'ok', PAST_DUE: 'warn', CANCELED: 'danger' }
    return tones[status] || 'neutral'
  }

  if (summary) {
    return <CreatedAccountSummary summary={summary} onClose={() => setSummary(null)} />
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end print-hide">
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancelar' : 'Crear cuenta'}</Button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {showForm && (
        <Card title="Crear cuenta">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-6">
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-ink">Cuenta</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Nombre de la cuenta"
                  value={formData.tenantName}
                  onChange={(e) => {
                    const tenantName = e.target.value
                    setFormData({ ...formData, tenantName })
                    setTamboForm((f) => (f.name === formData.tenantName || !f.name ? { ...f, name: tenantName } : f))
                  }}
                  required
                />
                <SelectField
                  label="Plan"
                  value={formData.planCode}
                  onChange={(e) =>
                    setFormData({ ...formData, planCode: e.target.value as 'STANDARD' | 'LIFETIME' })
                  }
                >
                  <option value="STANDARD">Estándar (pago)</option>
                  <option value="LIFETIME">Lifetime (gratis de por vida)</option>
                </SelectField>
              </div>
            </section>
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-ink">Dueño</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Nombre"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  required
                />
                <Field
                  label="Correo"
                  type="email"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                />
                <Field
                  label="Teléfono"
                  value={formData.ownerPhone}
                  onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                  hint="Código de área y número, sin 0 ni 15."
                />
                <div className="md:col-span-2 flex flex-wrap items-end gap-2">
                  <Field
                    className="flex-1 min-w-48"
                    label="Clave inicial"
                    type="text"
                    value={formData.ownerPassword}
                    onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                    hint="El dueño la cambia al entrar."
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setFormData({ ...formData, ownerPassword: generateTemporaryPassword() })}
                  >
                    Generar
                  </Button>
                </div>
              </div>
            </section>
            <TamboFields
              form={tamboForm}
              onChange={setTamboForm}
              partners={partners}
              products={products}
              plans={plans}
              planCode={formData.planCode}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creando...' : 'Crear cuenta'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState>No hay cuentas todavía</EmptyState>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <Card key={tenant.id}>
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{tenant.name}</h3>
                  <p className="text-sm text-ink-muted break-all">
                    {tenant.owner
                      ? `${tenant.owner.name} · ${contactLine(tenant.owner)}`
                      : 'Sin dueño asignado'}
                    {typeof tenant.activeTambos === 'number'
                      ? ` · ${tenant.activeTambos} tambo${tenant.activeTambos === 1 ? '' : 's'} activo${tenant.activeTambos === 1 ? '' : 's'}`
                      : ''}
                    {typeof tenant.installingTambos === 'number' && tenant.installingTambos > 0
                      ? ` · ${tenant.installingTambos} en instalación`
                      : ''}
                  </p>
                </div>
                {tenant.subscription && (
                  <Badge tone={getStatusTone(tenant.subscription.status)}>{tenant.subscription.status}</Badge>
                )}
              </div>

              {tenant.owner ? (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Button
                    variant="secondary"
                    disabled={savingId === tenant.owner.id}
                    onClick={() => void resetPassword(tenant.owner!.id)}
                  >
                    Restablecer clave
                  </Button>
                  {revealedPassword?.userId === tenant.owner.id ? (
                    <span className="text-sm text-ink">
                      Clave temporaria:{' '}
                      <strong>{revealedPassword.password}</strong>{' '}
                      <Button
                        variant="ghost"
                        onClick={() => void navigator.clipboard.writeText(revealedPassword.password)}
                      >
                        Copiar
                      </Button>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {tenant.subscription && (
                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
                  <span className="text-ink-muted">
                    Plan: <strong className="text-ink">{tenant.subscription.plan.name}</strong>
                    {tenant.subscription.plan.priceUsd
                      ? ` · USD ${tenant.subscription.plan.priceUsd} (≈ $${tenant.subscription.plan.priceArs} ARS)`
                      : ' · sin costo'}
                  </span>
                  <select
                    value={tenant.subscription.plan.code}
                    onChange={(e) => handlePlanChange(tenant.id, e.target.value as 'STANDARD' | 'LIFETIME')}
                    disabled={savingId === tenant.id}
                    className={`${inputClass} w-auto py-1.5 text-sm`}
                  >
                    <option value="STANDARD">Estándar</option>
                    <option value="LIFETIME">Lifetime</option>
                  </select>
                  {tenant.subscription.status === 'CANCELED' ? (
                    <Button onClick={() => handleStatusChange(tenant.id, 'ACTIVE')} disabled={savingId === tenant.id}>
                      Reactivar
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => handleStatusChange(tenant.id, 'CANCELED')}
                      disabled={savingId === tenant.id}
                    >
                      Dar de baja
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-ink">Tambos</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAddingTo(addingTo === tenant.id ? null : tenant.id)
                      setAddTamboForm(emptyTambo(tenant.name))
                    }}
                  >
                    Agregar tambo
                  </Button>
                </div>
                {(tenant.tambos ?? []).length === 0 ? (
                  <p className="text-sm text-ink-muted">Esta cuenta todavía no tiene tambos.</p>
                ) : (
                  <ul className="space-y-2">
                    {(tenant.tambos ?? []).map((tambo) => (
                      <li key={tambo.id} className="border border-line rounded-lg p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-ink">{tambo.name}</p>
                          <Badge tone={tambo.state === 'INSTALLING' ? 'warn' : tambo.state === 'ACTIVE' ? 'ok' : 'neutral'}>
                            {STATE_LABEL[tambo.state]}
                          </Badge>
                        </div>
                        <p className="text-sm text-ink-muted">
                          Proveedor predeterminado: {tambo.defaultServiceProvider?.name ?? '—'}
                          {tambo.providerSince
                            ? ` · desde ${new Date(tambo.providerSince).toLocaleDateString('es-AR')}`
                            : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={`${inputClass} w-auto py-1.5 text-sm`}
                            defaultValue=""
                            disabled={savingId === tambo.id}
                            onChange={(e) => {
                              if (e.target.value) void changeProvider(tambo.id, e.target.value)
                              e.target.value = ''
                            }}
                          >
                            <option value="">Cambiar</option>
                            {partners.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <Button variant="ghost" onClick={() => void showPeriods(tambo.id, tambo.name)}>
                            Ver períodos
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {addingTo === tenant.id ? (
                  <div className="border border-line rounded-lg p-4">
                    <TamboFields
                      form={addTamboForm}
                      onChange={setAddTamboForm}
                      partners={partners}
                      products={products}
                      plans={plans}
                      planCode={tenant.subscription?.plan.code ?? 'STANDARD'}
                    />
                    <div className="flex gap-2 mt-3">
                      <Button disabled={submitting} onClick={() => void addTambo(tenant)}>
                        Guardar tambo
                      </Button>
                      <Button variant="ghost" onClick={() => setAddingTo(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {periodsFor && tenant.tambos?.some((t) => t.id === periodsFor.tamboId) ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-sm font-semibold text-ink">Períodos · {periodsFor.name}</p>
                  <ul className="text-sm text-ink-muted space-y-1 mt-2">
                    {periodsFor.items.map((p) => (
                      <li key={p.id}>
                        {p.serviceProvider.name}: {new Date(p.startedAt).toLocaleDateString('es-AR')}
                        {p.endedAt ? ` → ${new Date(p.endedAt).toLocaleDateString('es-AR')}` : ' → abierto'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <TenantInstallers token={auth.token} tenantId={tenant.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

type AccountSummary = {
  tenantName: string
  ownerName: string
  ownerEmail: string | null
  ownerPhone?: string | null
  ownerPassword: string
  tambo: { name: string; bajadaCount: number; pumpCount?: number; state?: string }
  budget: HardwareBudget
  monthlySubscription: { planName: string; priceArs: number; priceUsd: unknown }
}

function CreatedAccountSummary({
  summary,
  onClose,
}: {
  summary: AccountSummary
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-4">
      <Card title="Cuenta creada" className="print-summary">
        <div className="space-y-2 text-sm text-ink">
          <p>
            <strong>Cuenta:</strong> {summary.tenantName}
          </p>
          <p>
            <strong>Dueño:</strong> {summary.ownerName} ·{' '}
            {contactLine({
              email: summary.ownerEmail,
              phone: summary.ownerPhone,
              name: summary.ownerName,
            })}
          </p>
          <p>
            <strong>Tambo:</strong> {summary.tambo.name} · {summary.tambo.bajadaCount} bajadas
            {summary.tambo.state === 'INSTALLING' ? ' · nace en instalación' : ' · nace activo'}
          </p>
          <div className="print-hide rounded-lg border border-line bg-subtle p-3 space-y-2">
            <p className="font-semibold">Clave inicial (se muestra una sola vez)</p>
            <p className="break-all">{summary.ownerPassword}</p>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(summary.ownerPassword)
                setCopied(true)
              }}
            >
              {copied ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <ul>
            {summary.budget.lines.map((line) => (
              <li key={line.productId}>
                {line.name}: {line.quantity} u.
                {line.unitPrice == null ? ' · Sin precio' : ` · ${money(line.subtotal ?? 0, line.currency)}`}
              </li>
            ))}
          </ul>
          {Object.keys(summary.budget.totalsByCurrency).length > 0 ? (
            <p>
              Presupuesto:{' '}
              {Object.entries(summary.budget.totalsByCurrency)
                .map(([c, n]) => money(n, c))
                .join(' · ')}
            </p>
          ) : null}
          {summary.budget.missingPrices ? <p>Falta cargar el precio de al menos un equipo.</p> : null}
          <p>
            Suscripción mensual: {summary.monthlySubscription.priceArs} ARS ({summary.monthlySubscription.planName})
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 print-hide">
          <Button onClick={() => window.print()}>Imprimir resumen</Button>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  )
}

function TamboFields({
  form,
  onChange,
  partners,
  products,
  plans,
  planCode,
}: {
  form: TamboForm
  onChange: (next: TamboForm) => void
  partners: Partner[]
  products: HardwareProductItem[]
  plans: { code: string; name: string; priceArs: number; priceUsd: string | null }[]
  planCode: string
}) {
  const bajadas = Number(form.bajadaCount) || 0
  const pumps = Number(form.pumpCount) || 0
  const selected = products.filter((p) => form.equipmentProductIds.includes(p.id))
  const lines = selected.map((p) => {
    const quantity = quantityFor(p.quantityRule, p.fixedQuantity, bajadas, pumps)
    const subtotal = p.unitPrice == null ? null : Math.round(p.unitPrice * quantity * 100) / 100
    return { ...p, quantity, subtotal }
  })
  const totals = new Map<string, number>()
  let missing = false
  for (const line of lines) {
    if (line.subtotal == null) missing = true
    else totals.set(line.currency, Math.round(((totals.get(line.currency) ?? 0) + line.subtotal) * 100) / 100)
  }
  const installing = form.equipmentProductIds.length > 0
  const plan = plans.find((p) => p.code === planCode)

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Tambo</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
        <Field
          label="Bajadas"
          type="number"
          min={1}
          max={60}
          value={form.bajadaCount}
          onChange={(e) => onChange({ ...form, bajadaCount: e.target.value })}
        />
        <SelectField
          label="Corriente"
          hint="Obligatoria si hay equipos."
          value={form.powerSupply}
          onChange={(e) => onChange({ ...form, powerSupply: e.target.value as TamboForm['powerSupply'] })}
        >
          <option value="">Sin definir</option>
          <option value="MONOPHASE">Monofásica</option>
          <option value="THREEPHASE">Trifásica</option>
        </SelectField>
        <Field
          label="Bombas de vacío"
          type="number"
          min={1}
          max={10}
          value={form.pumpCount}
          onChange={(e) => onChange({ ...form, pumpCount: e.target.value })}
        />
        <SelectField
          label="Proveedor predeterminado"
          hint="Quién instala y atiende el service."
          value={form.defaultServiceProviderId}
          onChange={(e) => onChange({ ...form, defaultServiceProviderId: e.target.value })}
        >
          <option value="">Elegí una socia</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">Equipos</p>
        {products.map((p) => {
          const quantity = quantityFor(p.quantityRule, p.fixedQuantity, bajadas, pumps)
          const subtotal = p.unitPrice == null ? null : Math.round(p.unitPrice * quantity * 100) / 100
          return (
            <label key={p.id} className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.equipmentProductIds.includes(p.id)}
                onChange={(e) =>
                  onChange({
                    ...form,
                    equipmentProductIds: e.target.checked
                      ? [...form.equipmentProductIds, p.id]
                      : form.equipmentProductIds.filter((id) => id !== p.id),
                  })
                }
              />
              <span>
                {p.name} · {quantity} u. · {subtotal == null ? 'Sin precio' : money(subtotal, p.currency)}
              </span>
            </label>
          )
        })}
      </div>
      <div className="rounded-lg border border-line bg-subtle p-3 space-y-1 text-sm text-ink">
        <p className="font-semibold">Presupuesto estimado</p>
        {lines.length === 0 ? <p className="text-ink-muted">Sin equipos.</p> : null}
        {lines.map((line) => (
          <p key={line.id}>
            {line.name}: {line.quantity} u. · {line.subtotal == null ? 'Sin precio' : money(line.subtotal, line.currency)}
          </p>
        ))}
        {totals.size > 0 ? (
          <p>Total: {Array.from(totals.entries()).map(([c, n]) => money(n, c)).join(' · ')}</p>
        ) : null}
        {missing ? <p className="text-ink-muted">Sin precio en al menos un equipo.</p> : null}
        <p>
          Suscripción mensual:{' '}
          {plan ? (plan.priceUsd ? `${plan.priceArs} ARS` : 'sin costo') : '—'} · aparte del presupuesto de equipos.
        </p>
        <p className="font-semibold">
          {installing ? 'Nace en instalación: no se cobra hasta activarlo' : 'Nace activo'}
        </p>
      </div>
    </section>
  )
}

function TenantInstallers({ token, tenantId }: { token: string; tenantId: string }) {
  const [items, setItems] = useState<AdminInstaller[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const result = await api.getAdminInstallers(token, tenantId)
        if (!cancelled) setItems(result.items || [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los técnicos')
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token, tenantId])

  const toggle = async (membershipId: string, enabled: boolean) => {
    try {
      setBusyId(membershipId)
      setError('')
      const result = await api.updateAdminInstaller(token, membershipId, enabled)
      setItems((prev) => prev.map((item) => (item.id === membershipId ? result.item : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el permiso')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-line space-y-2">
      <p className="text-sm font-semibold text-ink">Técnicos</p>
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {loading ? (
        <p className="text-sm text-ink-muted">Cargando técnicos...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">Esta cuenta no tiene técnicos.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const independent = !item.serviceProvider
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{item.user.name}</p>
                  <p className="text-ink-muted">
                    {contactLine(item.user)}
                    {item.serviceProvider ? ` · ${item.serviceProvider.name}` : ' · independiente'}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-ink">
                  <input
                    type="checkbox"
                    checked={item.canInstallDevices}
                    disabled={independent || busyId === item.id}
                    onChange={(e) => void toggle(item.id, e.target.checked)}
                  />
                  <span>Autorizado a instalar hardware</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
