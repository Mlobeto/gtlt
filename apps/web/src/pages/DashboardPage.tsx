import { useState, useEffect } from 'react'
import { TicketsTab } from '../components/TicketsTab'
import { PrototypeTab } from '../components/PrototypeTab'
import { AccountsTab } from '../components/AccountsTab'
import { TamboRequestsAdminTab } from '../components/TamboRequestsAdminTab'
import { PartTypesAdminTab } from '../components/PartTypesAdminTab'
import { PlansTab } from '../components/PlansTab'
import { HardwareProductsAdminTab } from '../components/HardwareProductsAdminTab'
import { ServiceProvidersAdminTab } from '../components/ServiceProvidersAdminTab'
import { TodayTab } from '../components/TodayTab'
import { AnimalsTab } from '../components/AnimalsTab'
import { TeamTab } from '../components/TeamTab'
import { SettingsTab } from '../components/SettingsTab'
import { WorkReportsTab } from '../components/WorkReportsTab'
import { DeliveriesTab } from '../components/DeliveriesTab'
import { ReaderLabTab } from '../components/ReaderLabTab'
import { AppShell } from '../components/AppShell'
import { NotificationsBell } from '../components/NotificationsBell'
import { Button } from '../components/ui'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'

interface DashboardPageProps {
  auth: AuthToken
  onLogout: () => void
  onSessionChange?: (next: AuthToken) => void
}

type Tab = 'today' | 'works' | 'deliveries' | 'tickets' | 'prototype' | 'accounts' | 'tambo-requests' | 'part-types' | 'hardware' | 'plans' | 'providers' | 'animals' | 'team' | 'settings' | 'lab'

export function DashboardPage({ auth, onLogout, onSessionChange }: DashboardPageProps) {
  const isOwner = auth.roles.includes('DUENIO') || auth.roles.includes('ADMIN')
  const isDeveloper = auth.roles.includes('DESARROLLADORA')
  const canUseReaderLab = isDeveloper && auth.roles.length === 1
  const tabs: { id: Tab; label: string }[] = isOwner
    ? [
        { id: 'today', label: 'Hoy' },
        { id: 'works', label: 'Trabajos' },
        { id: 'deliveries', label: 'Entregas' },
        { id: 'animals', label: 'Animales' },
        { id: 'team', label: 'Equipo' },
        { id: 'settings', label: 'Configuración' },
      ]
    : [
        { id: 'tickets', label: 'Tickets' },
        { id: 'prototype', label: 'Prototipo' },
        { id: 'accounts', label: 'Cuentas' },
        { id: 'tambo-requests', label: 'Pedidos' },
        { id: 'part-types', label: 'Catálogo' },
        { id: 'hardware', label: 'Equipos' },
        { id: 'providers', label: 'Proveedores' },
        { id: 'plans', label: 'Planes' },
      ]

  if (canUseReaderLab) tabs.push({ id: 'lab', label: 'Laboratorio' })

  const [activeTab, setActiveTab] = useState<Tab>(isOwner ? 'today' : 'tickets')
  const [focusAnimalId, setFocusAnimalId] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [loadingMe, setLoadingMe] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [tenantName, setTenantName] = useState('')

  const goHome = () => {
    setActiveTab(isOwner ? 'today' : 'tickets')
    setRefreshKey((k) => k + 1)
    window.scrollTo(0, 0)
  }

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

  const roleLabel = auth.roles.includes('ADMIN') && !auth.roles.includes('DUENIO')
    ? 'Administrador/a'
    : isOwner
      ? 'Dueño/a del tambo'
      : 'Desarrollador/a'

  return (
    <>
      <AppShell
        title={tabs.find((t) => t.id === activeTab)?.label ?? ''}
        subtitle={isDeveloper || !tenantName ? undefined : `Cuenta: ${tenantName}`}
        nav={tabs.map((t) => ({ key: t.id, label: t.label }))}
        active={activeTab}
        onSelect={setActiveTab}
        user={{ name: !loadingMe && user ? user.name : 'Cargando...', role: roleLabel }}
        onLogout={onLogout}
        onHome={goHome}
        bell={
          <NotificationsBell
            auth={auth}
            activeTab={activeTab}
            onNavigate={({ tab, animalId }) => {
              if (!tabs.some((t) => t.id === tab)) return
              setActiveTab(tab)
              setFocusAnimalId(animalId)
            }}
          />
        }
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
        <div key={refreshKey}>
          {activeTab === 'today' && isOwner && <TodayTab auth={auth} />}
          {activeTab === 'works' && isOwner && <WorkReportsTab auth={auth} />}
          {activeTab === 'deliveries' && isOwner && <DeliveriesTab auth={auth} />}
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
          {activeTab === 'hardware' && isDeveloper && <HardwareProductsAdminTab auth={auth} />}
          {activeTab === 'providers' && isDeveloper && <ServiceProvidersAdminTab auth={auth} />}
          {activeTab === 'plans' && isDeveloper && <PlansTab auth={auth} />}
          {activeTab === 'lab' && canUseReaderLab && <ReaderLabTab />}
          {activeTab === 'animals' && isOwner && (
            <AnimalsTab auth={auth} focusAnimalId={focusAnimalId} />
          )}
          {activeTab === 'team' && isOwner && <TeamTab auth={auth} />}
          {activeTab === 'settings' && isOwner && (
            <SettingsTab auth={auth} onSessionChange={onSessionChange} />
          )}
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
