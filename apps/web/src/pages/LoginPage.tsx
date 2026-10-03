import { useState } from 'react'
import { api } from '../lib/api'
import { WEB_ALLOWED_ROLES, type AuthToken } from '../types/auth'
import { Button, Card, ErrorBanner, Field } from '../components/ui'

interface LoginPageProps {
  onSuccess: (token: AuthToken) => void
}

type TenantChoice = { id: string; name: string; roles: string[] }

function isTenantRequiredError(
  err: unknown,
): err is Error & { code: 'TENANT_REQUIRED'; tenants: TenantChoice[] } {
  return (
    err instanceof Error &&
    (err as { code?: string }).code === 'TENANT_REQUIRED' &&
    Array.isArray((err as { tenants?: unknown }).tenants)
  )
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('admin@gtlt.local')
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tenants, setTenants] = useState<TenantChoice[] | null>(null)

  const finishLogin = (result: {
    accessToken: string
    user: { id: string }
    tenant: { id: string }
    roles?: string[]
  }) => {
    const roles: string[] = result.roles ?? []
    if (!roles.some((role) => WEB_ALLOWED_ROLES.includes(role as (typeof WEB_ALLOWED_ROLES)[number]))) {
      setError('Esta cuenta no tiene acceso al panel web (dueño/a, desarrollador/a o técnico).')
      setTenants(null)
      return
    }
    onSuccess({
      token: result.accessToken,
      userId: result.user.id,
      tenantId: result.tenant.id,
      roles,
    })
  }

  const tryLogin = async (tenantId?: string) => {
    setError('')
    setLoading(true)
    try {
      const result = await api.login(email, password, tenantId)
      setTenants(null)
      finishLogin(result)
    } catch (err) {
      if (!tenantId && isTenantRequiredError(err)) {
        setTenants(err.tenants)
        setError('')
        return
      }
      setError(err instanceof Error ? err.message : 'Error de login')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await tryLogin()
  }

  return (
    <div className="min-h-screen bg-subtle md:grid md:grid-cols-2">
      <div className="bg-brand-dark text-white px-6 py-6 md:flex md:flex-col md:justify-center md:px-12 lg:px-20">
        <h1 className="font-brand text-3xl md:text-6xl font-bold leading-none">GTLT</h1>
        <p className="mt-2 md:mt-4 text-base md:text-2xl font-semibold">Gestión Tambera</p>
        <p className="hidden md:block mt-3 text-lg text-white/70">El tambo, ordenado y a la vista</p>
      </div>

      <div className="flex items-start md:items-center justify-center p-4 py-8 md:p-8">
        <Card className="w-full max-w-md p-6 sm:p-8">
          {tenants ? (
            <div className="space-y-4">
              <p className="text-sm text-ink">
                Esta cuenta está en más de un tambo. Elegí con cuál entrar.
              </p>
              <ul className="space-y-2">
                {tenants.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void tryLogin(t.id)}
                      className="w-full text-left px-4 py-3 border border-line rounded-lg hover:border-primary hover:bg-primary-soft disabled:opacity-60"
                    >
                      <span className="font-semibold text-ink">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" onClick={() => setTenants(null)} disabled={loading}>
                Volver
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />

              <Field
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Conectando...' : 'Iniciar Sesión'}
              </Button>
            </form>
          )}

          {tenants && error ? (
            <div className="mt-4">
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          ) : null}

          <p className="text-xs text-ink-muted text-center mt-6">
            Usuario de demo: admin@gtlt.local / demo1234
          </p>
        </Card>
      </div>
    </div>
  )
}
