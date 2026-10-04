import { useState, useEffect } from 'react'
import { TicketsTab } from '../components/TicketsTab'
import { PrototypeTab } from '../components/PrototypeTab'
import { AccountsTab } from '../components/AccountsTab'
import { TamboRequestsAdminTab } from '../components/TamboRequestsAdminTab'
import { PartTypesAdminTab } from '../components/PartTypesAdminTab'
import { PlansTab } from '../components/PlansTab'
import { TodayTab } from '../components/TodayTab'
import { AnimalsTab } from '../components/AnimalsTab'
import { TeamTab } from '../components/TeamTab'
import { SettingsTab } from '../components/SettingsTab'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'

interface DashboardPageProps {
  auth: AuthToken
  onLogout: () => void
}

type Tab = 'today' | 'tickets' | 'prototype' | 'accounts' | 'tambo-requests' | 'part-types' | 'plans' | 'animals' | 'team' | 'settings'

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
        { id: 'tambo-requests', label: 'Pedidos de tambo' },
        { id: 'part-types', label: 'Catálogo de piezas' },
        { id: 'plans', label: 'Planes' },
      ]

  const [activeTab, setActiveTab] = useState<Tab>(isOwner ? 'today' : 'tickets')
  const [helpOpen, setHelpOpen] = useState(false)
  const [loadingMe, setLoadingMe] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantName, setTenantName] = useState('')

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.getMe(auth.token)
        setUser(data.user)
        setTenantName(data.tenant?.name ?? '')
      } catch (err) {
        console.error('Failed to fetch user', err)
      } finally {
        setLoadingMe(false)
      }
    }

    fetchMe()
  }, [auth.token])

  const roleLabel = isOwner ? 'Dueño/a del tambo' : 'Desarrollador/a'

  return (
    <>
      <AppShell
        title={tabs.find((t) => t.id === activeTab)?.label ?? ''}
        subtitle={tenantName || undefined}
        nav={tabs.map((t) => ({ key: t.id, label: t.label }))}
        active={activeTab}
        onSelect={setActiveTab}
        user={{ name: !loadingMe && user ? user.name : 'Cargando...', role: roleLabel }}
        onLogout={onLogout}
        headerRight={
          isOwner ? (
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="text-sm text-ink-muted hover:text-ink px-2 py-1"
              title="Soporte"
            >
              ¿Necesitás ayuda?
            </button>
          ) : undefined
        }
      >
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
          {activeTab === 'tambo-requests' && isDeveloper && <TamboRequestsAdminTab auth={auth} />}
          {activeTab === 'part-types' && isDeveloper && <PartTypesAdminTab auth={auth} />}
          {activeTab === 'plans' && isDeveloper && <PlansTab auth={auth} />}
          {activeTab === 'animals' && isOwner && <AnimalsTab auth={auth} />}
          {activeTab === 'team' && isOwner && <TeamTab auth={auth} />}
          {activeTab === 'settings' && isOwner && <SettingsTab auth={auth} />}
        </div>
      </AppShell>

      {helpOpen && isOwner && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8">
          <button
            type="button"
            className="absolute inset-0 bg-brand-dark/50"
            aria-label="Cerrar ayuda"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface border border-line rounded-xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-ink">Soporte</h2>
              <Button variant="ghost" onClick={() => setHelpOpen(false)}>
                Cerrar
              </Button>
            </div>
            <TicketsTab auth={auth} canManage={isOwner} canCreate={isOwner} adminView={false} />
          </div>
        </div>
      )}
    </>
  )
}
