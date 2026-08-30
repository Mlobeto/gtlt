import { useState, useEffect } from 'react'
import './App.css'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import type { AuthToken } from './types/auth'

function App() {
  const [auth, setAuth] = useState<AuthToken | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return auth ? (
    <DashboardPage auth={auth} onLogout={() => { localStorage.removeItem('gtlt_auth'); setAuth(null) }} />
  ) : (
    <LoginPage onSuccess={(token) => { setAuth(token); localStorage.setItem('gtlt_auth', JSON.stringify(token)) }} />
  )
}

export default App
