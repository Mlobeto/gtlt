import type { ReactNode } from 'react'

export type NavItem<K extends string = string> = { key: K; label: string }

export function AppShell<K extends string>({
  title,
  subtitle,
  nav,
  active,
  onSelect,
  user,
  onLogout,
  headerRight,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  nav: NavItem<K>[]
  active: K
  onSelect: (key: K) => void
  user?: { name: string; role: string }
  onLogout: () => void
  headerRight?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-subtle md:flex">
      <aside className="print-hide bg-brand-dark text-white md:fixed md:inset-y-0 md:left-0 md:w-[220px] md:flex md:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:block md:py-6">
          <div className="min-w-0">
            <img src="/cal-logo-white.svg" alt="CAL" className="h-7 w-auto" />
            {subtitle && <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--color-brand-blue)_35%,white)] truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="md:hidden text-sm font-semibold text-white/80 hover:text-white"
          >
            Salir
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0 md:flex-1">
          {nav.map((item) => {
            const isActive = item.key === active
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`shrink-0 text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive ? 'bg-surface/15 text-white' : 'text-white/70 hover:text-white hover:bg-surface/10'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="hidden md:block border-t border-white/10 px-5 py-4">
          {user && (
            <div className="mb-3 min-w-0">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs text-white/60 truncate">{user.role}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-10 rounded-lg border border-white/20 text-sm font-semibold text-white/90 hover:bg-surface/10"
          >
            Salir
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 md:ml-[220px] print:ml-0">
        <header className="print-hide px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">{title}</h1>
          {headerRight}
        </header>
        <main className="px-4 sm:px-6 lg:px-8 pb-10">{children}</main>
      </div>
    </div>
  )
}
