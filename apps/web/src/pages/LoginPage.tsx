import { useState } from 'react'
import { api } from '../lib/api'
import { WEB_ALLOWED_ROLES, type AuthToken } from '../types/auth'

interface LoginPageProps {
  onSuccess: (token: AuthToken) => void
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('admin@gtlt.local')
  const [password, setPassword] = useState('demo1234')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.login(email, password)
      const roles: string[] = result.roles ?? []
      if (!roles.some((role) => WEB_ALLOWED_ROLES.includes(role as any))) {
        setError('Esta cuenta no tiene acceso al panel web (solo dueño/a o desarrollador/a).')
        return
      }
      onSuccess({
        token: result.accessToken,
        userId: result.user.id,
        tenantId: result.tenant.id,
        roles,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-700">GTLT</h1>
          <p className="text-gray-600 mt-2">Dashboard de Desarrolladora</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Conectando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          Usuario de demo: admin@gtlt.local / demo1234
        </p>
      </div>
    </div>
  )
}
