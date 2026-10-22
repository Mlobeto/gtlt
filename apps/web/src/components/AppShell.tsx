import type { ReactNode } from 'react'

export type NavItem<K extends string = string> = { key: K; label: string; badge?: number }

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-accent'

function initialOf(name: string) {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : '?'
}

export function AppShell<K extends string>({
  title,
  subtitle,
  nav,
  active,
  onSelect,
  user,
  onLogout,
  headerRight,
  onHome,
  bell,
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
  onHome?: () => void
  bell?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-subtle">
      <header className="print-hide bg-accent rounded-b-[44px] px-4 sm:px-6 lg:px-9 pt-5 pb-7">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {onHome ? (
            <button
              type="button"
              onClick={onHome}
              aria-label="CAL, ir al inicio"
              className={`h-10 shrink-0 rounded-lg ${focusRing}`}
            >
              <img src="/cal-logo-negro.png" alt="" className="h-10 w-auto" />
            </button>
          ) : (
            <img src="/cal-logo-negro.png" alt="CAL" className="h-10 w-auto" />
          )}
          <nav
            aria-label="Secciones"
            className="order-last w-full flex gap-2 overflow-x-auto lg:order-none lg:w-auto lg:flex-1 lg:flex-wrap lg:justify-center lg:overflow-visible"
          >
            {nav.map((item) => {
              const isActive = item.key === active
              const showBadge = typeof item.badge === 'number' && item.badge > 0
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`shrink-0 h-11 px-4 rounded-full text-[15px] inline-flex items-center gap-2 transition ${focusRing} ${
                    isActive
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-white/60 text-ink font-medium hover:bg-white/80'
                  }`}
                >
                  {item.label}
                  {showBadge ? (
                    <span
                      className={`min-w-[22px] h-[22px] rounded-full text-[12.5px] font-bold inline-flex items-center justify-center ${
                        isActive ? 'bg-on-primary text-primary' : 'bg-primary text-on-primary'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            {bell}
            {headerRight}
            {subtitle ? (
              <span className="hidden sm:inline-flex h-11 items-center px-4 rounded-full border-[1.5px] border-ink text-[15px] font-bold">
                {subtitle}
              </span>
            ) : null}
            {user ? (
              <span
                className="h-11 w-11 shrink-0 rounded-full bg-primary text-on-primary font-bold inline-flex items-center justify-center"
                title={`${user.name} · ${user.role}`}
                aria-label={`${user.name} · ${user.role}`}
              >
                {initialOf(user.name)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onLogout}
              className={`h-11 px-4 rounded-full border-[1.5px] border-ink text-[15px] font-bold hover:bg-white/50 ${focusRing}`}
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <div className="px-4 sm:px-6 lg:px-9 pt-6 pb-4">
        <h1 className="text-3xl sm:text-4xl font-medium text-ink">{title}</h1>
      </div>
      <main className="px-4 sm:px-6 lg:px-9 pb-10">{children}</main>
    </div>
  )
}
