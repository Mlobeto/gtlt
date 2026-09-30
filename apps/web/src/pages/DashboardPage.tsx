import { useState, useEffect } from 'react'
import { TicketsTab } from '../components/TicketsTab'
import { PrototypeTab } from '../components/PrototypeTab'
import { AccountsTab } from '../components/AccountsTab'
import { PlansTab } from '../components/PlansTab'
import { TodayTab } from '../components/TodayTab'
import { AnimalsTab } from '../components/AnimalsTab'
import { TeamTab } from '../components/TeamTab'
import { SettingsTab } from '../components/SettingsTab'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'

interface DashboardPageProps {
  auth: AuthToken
  onLogout: () => void
}

type Tab = 'today' | 'tickets' | 'prototype' | 'accounts' | 'plans' | 'animals' | 'team' | 'settings'

export function DashboardPage({ auth, onLogout }: DashboardPageProps) {
  const isOwner = auth.roles.includes('DUENIO')
  const isDeveloper = auth.roles.includes('DESARROLLADORA')
  const tabs: { id: Tab; label: string }[] = isOwner
    ? [
        { id: 'today', label: 'Hoy' },
        { id: 'animals', label: 'Animales' },
        { id: 'team', label: 'Equipo' },
        { id: 'settings', label: 'Configuración' },
      ]
    : [
        { id: 'tickets', label: 'Tickets de Soporte' },
        { id: 'prototype', label: 'Configuración del Prototipo' },
        { id: 'accounts', label: 'Cuentas' },
        { id: 'plans', label: 'Planes' },
      ]

  const [activeTab, setActiveTab] = useState<Tab>(isOwner ? 'today' : 'tickets')
  const [helpOpen, setHelpOpen] = useState(false)
  const [loadingMe, setLoadingMe] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.getMe(auth.token)
        setUser(data.user)
      } catch (err) {
        console.error('Failed to fetch user', err)
      } finally {
        setLoadingMe(false)
      }
    }

    fetchMe()
  }, [auth.token])

  return (
    <div className="min-h-screen bg-gray-50">
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
          <div className="flex items-center gap-3">
            {isOwner && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1"
                title="Soporte"
              >
                ¿Necesitás ayuda?
              </button>
            )}
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <div>
          {activeTab === 'today' && isOwner && <TodayTab auth={auth} />}
          {activeTab === 'tickets' && isDeveloper && !isOwner && (
            <TicketsTab
              auth={auth}
              canManage={isDeveloper}
              canCreate={false}
              adminView={true}
            />
          )}
          {activeTab === 'prototype' && isDeveloper && <PrototypeTab auth={auth} />}
          {activeTab === 'accounts' && isDeveloper && <AccountsTab auth={auth} />}
          {activeTab === 'plans' && isDeveloper && <PlansTab auth={auth} />}
          {activeTab === 'animals' && isOwner && <AnimalsTab auth={auth} />}
          {activeTab === 'team' && isOwner && <TeamTab auth={auth} />}
          {activeTab === 'settings' && isOwner && <SettingsTab auth={auth} />}
        </div>
      </main>

      {helpOpen && isOwner && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar ayuda"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Soporte</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                Cerrar
              </button>
            </div>
            <TicketsTab auth={auth} canManage={isOwner} canCreate={isOwner} adminView={false} />
          </div>
        </div>
      )}
    </div>
  )
}
