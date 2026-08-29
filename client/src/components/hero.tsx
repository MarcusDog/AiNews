import { ArrowUpRight } from 'lucide-react'
import { Button } from './ui/button'

interface HeroProps {
  onGenerate: () => void
}

export function Hero({ onGenerate }: HeroProps) {
  return (
    <section className="relative z-10 flex min-h-[calc(100svh-88px)] flex-col items-center justify-center px-6 pb-24 pt-20 text-center sm:pb-32 sm:pt-24">
      <div className="flex w-full max-w-7xl flex-col items-center">
        <p className="animate-fade-rise mb-7 text-[11px] font-medium uppercase tracking-[0.26em] text-foreground/80 sm:text-xs">
          AI creator intelligence radar
        </p>

        <h1
          data-testid="hero-headline"
          className="hero-copy-shadow animate-fade-rise w-full max-w-7xl font-display text-[clamp(2rem,8.7vw,2.5rem)] font-normal leading-[0.95] tracking-[-2.46px] text-foreground sm:text-7xl md:text-8xl"
        >
          在噪声里，<em className="not-italic text-muted-foreground">先看见</em>
          <br />
          下一个值得做的 <em className="not-italic text-muted-foreground">AI 选题。</em>
        </h1>

        <p className="hero-copy-shadow animate-fade-rise-delay mt-8 w-full max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Aya 把分散的 AI 信号，变成值得关注的话题、可执行的角度和可追溯的来源。
        </p>

        <Button
          variant="glass"
          size="lg"
          onClick={onGenerate}
          aria-label="生成今日选题"
          className="animate-fade-rise-delay-2 mt-12 gap-3 cursor-pointer"
        >
          生成今日选题
          <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
