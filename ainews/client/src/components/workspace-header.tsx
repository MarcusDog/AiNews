import type { ReactNode } from 'react'

export interface WorkspaceTab {
  id: string
  label: string
  href?: string
  onClick?: () => void
  active?: boolean
}

export function WorkspaceHeader({
  current,
  tabs,
  right,
}: {
  current: string
  tabs?: WorkspaceTab[]
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#031a26]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-4 sm:px-8">
        <a href="/" className="font-display text-xl text-white">
          Aya Signals
        </a>
        <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="工作区导航">
          {(tabs || [
            { id: 'topics', label: '选题', href: '/' },
            { id: 'creators', label: '博主雷达', href: '#creators' },
            { id: 'research', label: '研究工作台', href: '/docs/SYSTEM_USAGE_GUIDE.md' },
            { id: 'sources', label: '来源与观察名单', href: '/docs/CREATOR_SOURCES.md' },
            { id: 'alerts', label: '热点推送', href: '/docs/CREATOR_ALERTS.md' }
          ]).map((tab) => {
            const active = tab.active || tab.id === current
            const className = `rounded-full px-3 py-1.5 transition ${active ? 'bg-white text-[#031a26]' : 'text-white/55 hover:text-white'}`
            if (tab.onClick) {
              return (
                <button key={tab.id} type="button" onClick={tab.onClick} className={className} aria-pressed={active}>
                  {tab.label}
                </button>
              )
            }
            return (
              <a key={tab.id} href={tab.href || '#'} className={className} aria-current={active ? 'page' : undefined}>
                {tab.label}
              </a>
            )
          })}
        </nav>
        {right && <div className="ml-auto text-xs text-white/55">{right}</div>}
      </div>
    </header>
  )
}