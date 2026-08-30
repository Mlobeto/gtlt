import { useState, useEffect } from 'react'
import { TicketsTab } from '../components/TicketsTab'
import { PrototypeTab } from '../components/PrototypeTab'
import type { AuthToken } from '../types/auth'

interface DashboardPageProps {
  auth: AuthToken
  onLogout: () => void
}

type Tab = 'tickets' | 'prototype'

export function DashboardPage({ auth, onLogout }: DashboardPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('tickets')
  const [loadingMe, setLoadingMe] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('http://localhost:3001/auth/me', {
          headers: { Authorization: `Bearer ${auth.token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setUser(data.user)
        }
      } catch (err) {
        console.error('Failed to fetch user', err)
      } finally {
        setLoadingMe(false)
      }
    }

    fetchMe()
  }, [auth])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-green-700">GTLT Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              {!loadingMe && user ? `Hola, ${user.name}` : 'Cargando...'}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'tickets'
                ? 'text-green-600 border-green-600'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            Tickets de Soporte
          </button>
          <button
            onClick={() => setActiveTab('prototype')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'prototype'
                ? 'text-green-600 border-green-600'
                : 'text-gray-600 border-transparent hover:text-gray-900'
            }`}
          >
            Configuración del Prototipo
          </button>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'tickets' && <TicketsTab auth={auth} />}
          {activeTab === 'prototype' && <PrototypeTab auth={auth} />}
        </div>
      </main>
    </div>
  )
}
