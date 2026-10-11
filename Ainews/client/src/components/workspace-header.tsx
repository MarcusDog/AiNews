import { BrandMark } from './brand-mark'

export function WorkspaceHeader({ current }: { current: 'topics' | 'research' | 'skills' | 'creators' | 'verticals' | 'sources' | 'alerts' }) {
  const links = [
    { id: 'home', href: '/', label: '看热点' },
    { id: 'topics', href: '/topics', label: '找选题' },
    { id: 'research', href: '/research', label: '做研究' },
    { id: 'creators', href: '/creators', label: '博主雷达' },
    { id: 'sources', href: '/sources', label: '来源' },
    { id: 'alerts', href: '/alerts', label: '推送' },
    { id: 'skills', href: '/skills', label: 'Aya Skill' },
  ]
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" aria-label="Aya Signals 首页"><BrandMark /></a>
        <nav aria-label="工作台导航" className="flex max-w-[72vw] items-center gap-4 overflow-x-auto py-1 sm:gap-7">
          {links.map((link) => <a key={link.id} href={link.href} aria-current={link.id === current ? 'page' : undefined} className={`text-xs transition sm:text-sm ${link.id === current ? 'text-white' : 'text-white/45 hover:text-white'}`}>{link.label}</a>)}
        </nav>
      </div>
    </header>
  )
}
