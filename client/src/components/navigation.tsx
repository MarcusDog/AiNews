import { Dices } from 'lucide-react'
import { BrandMark } from './brand-mark'
import { Button } from './ui/button'

interface NavigationProps {
  onGenerate: () => void
}

export function Navigation({ onGenerate }: NavigationProps) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-row items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
      <a href="/" aria-label="Aya Signals 首页" className="shrink-0">
        <BrandMark />
      </a>

      <nav className="hidden items-center gap-7 md:flex" aria-label="主导航">
        <a href="#radar" className="text-sm text-foreground transition-colors hover:text-foreground" aria-current="page">看热点</a>
        <a href="/topics" className="text-sm text-muted-foreground transition-colors hover:text-foreground">找选题</a>
        <a href="/research" className="text-sm text-muted-foreground transition-colors hover:text-foreground">做研究</a>
        <a href="/skills" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Aya Skill</a>
      </nav>

      <Button variant="glass" className="gap-2 px-4 sm:px-6" onClick={onGenerate} aria-label="随机一个选题">
        <Dices className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">随机一个选题</span>
        <span className="sm:hidden">选题</span>
      </Button>
    </header>
  )
}
