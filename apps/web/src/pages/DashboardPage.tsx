import { useState, useEffect } from 'react'
import { TicketsTab } from '../components/TicketsTab'
import { PrototypeTab } from '../components/PrototypeTab'
import { AccountsTab } from '../components/AccountsTab'
import { PlansTab } from '../components/PlansTab'
import { AnimalsTab } from '../components/AnimalsTab'
import type { AuthToken } from '../types/auth'

interface DashboardPageProps {
  auth: AuthToken
  onLogout: () => void
}

type Tab = 'tickets' | 'prototype' | 'accounts' | 'plans' | 'animals'

export function DashboardPage({ auth, onLogout }: DashboardPageProps) {
  const isOwner = auth.roles.includes('DUENIO')
  const isDeveloper = auth.roles.includes('DESARROLLADORA')
  const tabs: { id: Tab; label: string }[] = isOwner
    ? [
        { id: 'tickets', label: 'Tickets de Soporte' },
        { id: 'animals', label: 'Animales' },
      ]
    : [
        { id: 'tickets', label: 'Tickets de Soporte' },
        { id: 'prototype', label: 'Configuración del Prototipo' },
        { id: 'accounts', label: 'Cuentas' },
        { id: 'plans', label: 'Planes' },
      ]

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
              {!loadingMe && user
                ? `Hola, ${user.name} · ${isOwner ? 'Dueño/a del tambo' : 'Desarrollador/a'}`
                : 'Cargando...'}
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? 'text-green-600 border-green-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'tickets' && <TicketsTab auth={auth} canManage={isOwner} />}
          {activeTab === 'prototype' && isDeveloper && <PrototypeTab auth={auth} />}
          {activeTab === 'accounts' && isDeveloper && <AccountsTab auth={auth} />}
          {activeTab === 'plans' && isDeveloper && <PlansTab auth={auth} />}
          {activeTab === 'animals' && isOwner && <AnimalsTab auth={auth} />}
        </div>
      </main>
    </div>
  )
}
