import { useState } from 'react'
import { api, ApiError, type AcceptedInvite } from '../lib/api'
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

const hasWebRole = (roles: string[]) =>
  roles.some((role) => WEB_ALLOWED_ROLES.includes(role as (typeof WEB_ALLOWED_ROLES)[number]))

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@gtlt.local' : '')
  const [password, setPassword] = useState(import.meta.env.DEV ? 'demo1234' : '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tenants, setTenants] = useState<TenantChoice[] | null>(null)
  const [mode, setMode] = useState<'login' | 'invite'>('login')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [notice, setNotice] = useState('')

  const switchMode = (next: 'login' | 'invite') => {
    setMode(next)
    setError('')
    setNotice('')
  }

  const inviteFailMessage = (err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return 'Código inválido o ya usado.'
    if (err instanceof ApiError && err.status === 410) return 'El código venció. Pedí uno nuevo.'
    return err instanceof Error ? err.message : 'No se pudo activar la invitación.'
  }

  const loginForInvite = async () => {
    try {
      return (await api.login(email, password)).accessToken as string
    } catch (err) {
      if (!isTenantRequiredError(err) || !err.tenants[0]) return null
      try {
        return (await api.login(email, password, err.tenants[0].id)).accessToken as string
      } catch {
        return null
      }
    }
  }

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = inviteCode.replace(/\s+/g, '')
    if (!code) {
      setError('Pegá el código de invitación que te pasaron.')
      return
    }
    setError('')
    setNotice('')
    setLoading(true)
    try {
      let accepted: AcceptedInvite
      try {
        accepted = await api.acceptInviteRegister({
          inviteToken: code,
          password,
          name: inviteName.trim() || undefined,
        })
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'ACCOUNT_EXISTS')) throw err
        const accessToken = await loginForInvite()
        if (!accessToken) {
          setError('Esa cuenta ya existe y la clave no coincide. Usá tu clave de siempre.')
          return
        }
        accepted = await api.acceptInvite(accessToken, code)
      }
      setInviteCode('')
      setInviteName('')
      setMode('login')
      setNotice(
        hasWebRole(accepted.item.roles)
          ? 'Cuenta lista, ingresá'
          : 'Tu cuenta quedó activa. Entrá desde la app del celular.',
      )
    } catch (err) {
      setError(inviteFailMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const finishLogin = (result: {
    accessToken: string
    user: { id: string }
    tenant: { id: string }
    roles?: string[]
  }) => {
    const roles: string[] = result.roles ?? []
    if (!hasWebRole(roles)) {
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
          ) : mode === 'invite' ? (
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <p className="text-sm text-ink">
                Pegá el código de invitación que te pasaron y elegí una clave. Si ya tenés cuenta, usá tu clave de siempre.
              </p>
              <Field
                label="Código de invitación"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.replace(/\s+/g, ''))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={loading}
              />
              <Field
                label="Tu correo"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <Field
                label="Tu nombre (opcional)"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={loading}
              />
              <Field
                label="Clave"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Activando...' : 'Activar invitación'}
              </Button>
              <Button variant="ghost" onClick={() => switchMode('login')} disabled={loading} className="w-full">
                Ya tengo cuenta — Entrar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {notice && (
                <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
                  {notice}
                </div>
              )}
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
              <Button variant="ghost" onClick={() => switchMode('invite')} disabled={loading} className="w-full">
                Tengo un código de invitación
              </Button>
            </form>
          )}

          {tenants && error ? (
            <div className="mt-4">
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          ) : null}

          {import.meta.env.DEV && (
            <p className="text-xs text-ink-muted text-center mt-6">
              Usuario de demo: admin@gtlt.local / demo1234
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
