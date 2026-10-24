import { useState, useEffect } from 'react'
import './App.css'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TechnicianDashboardPage } from './pages/TechnicianDashboardPage'
import { ChangePasswordScreen } from './components/ChangePasswordScreen'
import { isTechnicianWebSession, type AuthToken } from './types/auth'
import { api, ApiError, resetSessionRevokedLatch, setSessionRevokedHandler } from './lib/api'

function App() {
  const [auth, setAuth] = useState<AuthToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [loginNotice, setLoginNotice] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('gtlt_auth')
    if (stored) {
      try {
        setAuth(JSON.parse(stored))
      } catch {
        localStorage.removeItem('gtlt_auth')
      }
    }
    setLoading(false)
  }, [])

  const persist = (next: AuthToken) => {
    resetSessionRevokedLatch()
    setLoginNotice('')
    setAuth(next)
    localStorage.setItem('gtlt_auth', JSON.stringify(next))
  }

  useEffect(() => {
    setSessionRevokedHandler(() => {
      localStorage.removeItem('gtlt_auth')
      setAuth(null)
      setLoginNotice('Tu acceso fue modificado. Volvé a ingresar.')
    })
    return () => setSessionRevokedHandler(null)
  }, [])

  useEffect(() => {
    if (!auth || auth.mustChangePassword) return
    const check = async () => {
      try {
        const me = await api.getMe(auth.token)
        if (me.mustChangePassword) persist({ ...auth, mustChangePassword: true })
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SESSION_REVOKED') {
          return
        }
        if (err instanceof ApiError && err.code === 'PASSWORD_CHANGE_REQUIRED') {
          persist({ ...auth, mustChangePassword: true })
        }
      }
    }
    void check()
  }, [auth?.token])

  const logout = () => {
    localStorage.removeItem('gtlt_auth')
    setAuth(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-subtle">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-ink-muted">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!auth) {
    return (
      <LoginPage onSuccess={persist} initialNotice={loginNotice} />
    )
  }

  if (auth.mustChangePassword) {
    return <ChangePasswordScreen auth={auth} required onChanged={persist} />
  }

  if (isTechnicianWebSession(auth.roles)) {
    return (
      <TechnicianDashboardPage
        auth={auth}
        onLogout={logout}
        onSessionChange={persist}
      />
    )
  }

  return <DashboardPage auth={auth} onLogout={logout} onSessionChange={persist} />
}

export default App
