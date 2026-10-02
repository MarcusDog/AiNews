import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, MousePointer2, TrendingUp, Trash2, Undo2 } from 'lucide-react'
import type { ChartBar, ChartIndicators, ChartTimeframe, TradeMarker } from './types'

export type IntradayView = 'line' | 'candle'

interface Props {
  bars: ChartBar[]
  trades: TradeMarker[]
  timeframe: ChartTimeframe
  showIndicators?: boolean
  showMACD?: boolean
  intradayView?: IntradayView
  prevClose?: number | null
  indicators?: ChartIndicators | null
  costPrice?: number | null
  smooth?: boolean
  crosshair?: boolean
  drawingStorageKey?: string
}

type DrawingTool = 'cursor' | 'trend' | 'horizontal'

interface DrawingAnchor {
  period: string
  price: number
}

interface ChartDrawing {
  id: string
  type: Exclude<DrawingTool, 'cursor'>
  start: DrawingAnchor
  end?: DrawingAnchor
}

interface DrawingContext {
  key: string
  items: ChartDrawing[]
}

const WIDTH = 1000
const HEIGHT = 520
const PRICE_TOP = 12
const PRICE_HEIGHT = 288
const PRICE_BOTTOM = PRICE_TOP + PRICE_HEIGHT
const VOLUME_TOP = 312
const VOLUME_HEIGHT = 56
const VOLUME_BOTTOM = VOLUME_TOP + VOLUME_HEIGHT
const MACD_TOP = 384
const MACD_HEIGHT = 104
const MACD_BOTTOM = MACD_TOP + MACD_HEIGHT
const AXIS_X = 948
const PAD_X = 20
const FULL_DAY_SLOTS = 242
const FIVE_DAY_SLOTS = FULL_DAY_SLOTS * 5
/** K 线（日/周/月）默认显示的根数与最小可视根数 */
const DEFAULT_CANDLE_SPAN = 120
const MIN_CANDLE_SPAN = 20
/** 单屏最大绘制根数：超出后按 N 合 1 聚合，保证 SVG 节点数可控 */
const MAX_RENDER_BARS = 900

const UP = '#e6002d'
const DOWN = '#16a34a'
const AXIS_TEXT = '#8a8f99'
const LINE_COLOR = '#334155'
const AVG_COLOR = '#f59e0b'
const DIF_COLOR = '#2563eb'
const DEA_COLOR = '#f59e0b'

const DAY_TICKS: Array<{ slot: number; label: string }> = [
  { slot: 0, label: '09:30' },
  { slot: 60, label: '10:30' },
  { slot: 120, label: '11:30/13:00' },
  { slot: 180, label: '14:00' },
  { slot: 236, label: '15:00' },
]

/** 把 1 分钟 K 聚合为 step 分钟 K */
function aggregateMinutes(bars: ChartBar[], step: number): ChartBar[] {
  const result: ChartBar[] = []
  let current: ChartBar | null = null
  let currentKey = ''
  for (const bar of bars) {
    const minute = Number(bar.period.slice(14, 16))
    const floor = minute - (minute % step)
    const key = `${bar.period.slice(0, 14)}${String(floor).padStart(2, '0')}`
    if (current && key === currentKey) {
      current.high = Math.max(current.high, bar.high)
      current.low = Math.min(current.low, bar.low)
      current.close = bar.close
      current.volume += bar.volume
      current.turnover += bar.turnover
    } else {
      current = { ...bar, period: key }
      currentKey = key
      result.push(current)
    }
  }
  return result
}

function splitByDay(bars: ChartBar[]): ChartBar[][] {
  const days: ChartBar[][] = []
  for (const bar of bars) {
    const day = bar.period.slice(0, 10)
    if (days.length === 0 || days[days.length - 1]![0]!.period.slice(0, 10) !== day) {
      days.push([bar])
    } else {
      days[days.length - 1]!.push(bar)
    }
  }
  return days
}

interface Scale {
  slotWidth: number
  xFor: (slot: number) => number
  yFor: (value: number) => number
  priceForY: (y: number) => number
}

/** 从后端指标数组生成 MA 路径（None 跳过并断开） */
function indicatorPath(values: Array<number | null>, scale: Scale): string {
  let path = ''
  let started = false
  values.forEach((value, index) => {
    if (value === null || value === undefined) {
      started = false
      return
    }
    const cmd = started ? 'L' : 'M'
    path += `${cmd} ${scale.xFor(index)} ${scale.yFor(value)} `
    started = true
  })
  return path.trim()
}

/** MACD 副图路径与柱体 */
function macdGeometry(
  dif: Array<number | null>,
  dea: Array<number | null>,
  hist: Array<number | null>,
  scale: Scale,
) {
  const valid = [...dif, ...dea, ...hist].filter((v): v is number => v !== null && v !== undefined)
  if (valid.length === 0) return null
  const max = Math.max(...valid, 0.01)
  const min = Math.min(...valid, -0.01)
  const span = Math.max(0.01, max - min)
  const yFor = (value: number) => MACD_TOP + ((max - value) / span) * (MACD_HEIGHT - 16) + 8
  const zeroY = yFor(0)
  const difPath = indicatorPath(dif, { ...scale, yFor })
  const deaPath = indicatorPath(dea, { ...scale, yFor })
  const bars = hist
    .map((value, index) => {
      if (value === null || value === undefined) return null
      const y = yFor(value)
      const color = value >= 0 ? UP : DOWN
      const w = Math.max(0.8, Math.min(6, scale.slotWidth * 0.5))
      return { index, x: scale.xFor(index), y, height: Math.abs(y - zeroY), color, w, value }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  return { difPath, deaPath, bars, zeroY, yFor, max, min }
}

export function ReplayChart({
  bars,
  trades,
  timeframe,
  showIndicators = true,
  showMACD = true,
  intradayView = 'line',
  prevClose,
  indicators,
  costPrice,
  smooth = true,
  crosshair = true,
  drawingStorageKey = 'default',
}: Props) {
  const mode: 'timeline' | 'five_day_line' | 'one_min' | 'candles' =
    timeframe === 'intraday'
      ? intradayView === 'line'
        ? 'timeline'
        : 'one_min'
      : timeframe === 'five_day'
        ? 'five_day_line'
        : 'candles'

  // K 线（日/周/月）默认展示当天之前的全部 K 线，缩放只是放大局部的手段。
  // 记录的是「尾部隐藏根数 fromEnd」而不是绝对下标，这样每次回放推进新数据时窗口会自动跟随最新行情。
  const zoomable = mode === 'candles'
  const zoomKey = `${timeframe}:${intradayView}`
  const [zoomState, setZoomState] = useState<{ key: string; span: number; fromEnd: number } | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const drawingKey = `trading-gym:chart-drawings:${drawingStorageKey}:${timeframe}:${intradayView}`
  const [drawingContext, setDrawingContext] = useState<DrawingContext>({ key: '', items: [] })
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('cursor')
  const [draftDrawing, setDraftDrawing] = useState<ChartDrawing | null>(null)
  const [drawingHover, setDrawingHover] = useState<DrawingAnchor | null>(null)
  const drawings = drawingContext.key === drawingKey ? drawingContext.items : []

  useEffect(() => {
    let items: ChartDrawing[] = []
    try {
      const saved = window.localStorage.getItem(drawingKey)
      if (saved) items = JSON.parse(saved) as ChartDrawing[]
    } catch {
      // 本地绘图记录损坏时回退为空，不影响行情回放。
    }
    setDrawingContext({ key: drawingKey, items })
    setDraftDrawing(null)
    setDrawingHover(null)
  }, [drawingKey])

  useEffect(() => {
    const cancelDraft = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDraftDrawing(null)
      setDrawingTool('cursor')
    }
    window.addEventListener('keydown', cancelDraft)
    return () => window.removeEventListener('keydown', cancelDraft)
  }, [])

  const updateDrawings = (next: ChartDrawing[]) => {
    setDrawingContext({ key: drawingKey, items: next })
    try {
      window.localStorage.setItem(drawingKey, JSON.stringify(next))
    } catch {
      // 隐私模式或存储配额不足时，仍保留当前页面内的绘图。
    }
  }
  const zoom = zoomState && zoomState.key === zoomKey ? zoomState : null
  const totalBars = bars.length
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
  const span = zoomable
    ? clamp(zoom?.span ?? totalBars, MIN_CANDLE_SPAN, Math.max(1, totalBars))
    : totalBars
  const fromEnd = zoomable ? clamp(zoom?.fromEnd ?? 0, 0, Math.max(0, totalBars - span)) : 0
  const windowEnd = zoomable ? clamp(totalBars - fromEnd, span, totalBars) : totalBars
  const windowStart = zoomable ? windowEnd - span : 0
  const windowed = useMemo(
    () => (windowStart === 0 && windowEnd === bars.length ? bars : bars.slice(windowStart, windowEnd)),
    [bars, windowStart, windowEnd],
  )
  const setWindow = (nextSpan: number, nextFromEnd: number) => {
    const boundedSpan = clamp(Math.round(nextSpan), MIN_CANDLE_SPAN, Math.max(1, totalBars))
    const boundedEnd = clamp(Math.round(nextFromEnd), 0, Math.max(0, totalBars - boundedSpan))
    setZoomState({ key: zoomKey, span: boundedSpan, fromEnd: boundedEnd })
  }
  /** 以 ratio 位置为锚点缩放：ratio=0 锚在最左，1 锚在最右 */
  const zoomBy = (factor: number, ratio = 0.5) => {
    const nextSpan = clamp(Math.round(span * factor), MIN_CANDLE_SPAN, totalBars)
    const anchor = windowStart + ratio * span
    const nextStart = clamp(Math.round(anchor - ratio * nextSpan), 0, Math.max(0, totalBars - nextSpan))
    setWindow(nextSpan, totalBars - (nextStart + nextSpan))
  }

  const shellRef = useRef<HTMLDivElement>(null)
  const metrics = { span, windowStart, windowEnd, totalBars, zoomable }
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics
  const setWindowRef = useRef(setWindow)
  setWindowRef.current = setWindow
  // React 的 onWheel 是被动监听，无法 preventDefault，这里直接挂原生 wheel
  useEffect(() => {
    const node = shellRef.current
    if (!node || !zoomable) return
    const onWheel = (event: WheelEvent) => {
      const current = metricsRef.current
      if (!current.zoomable || current.totalBars <= 0) return
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
      const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2
      const nextSpan = Math.min(
        Math.max(Math.round(current.span * factor), MIN_CANDLE_SPAN),
        current.totalBars,
      )
      const anchor = current.windowStart + ratio * current.span
      const nextStart = Math.min(
        Math.max(Math.round(anchor - ratio * nextSpan), 0),
        Math.max(0, current.totalBars - nextSpan),
      )
      setWindowRef.current(nextSpan, current.totalBars - (nextStart + nextSpan))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomable])

  const dragRef = useRef<{ startX: number; startFromEnd: number } | null>(null)
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!zoomable) return
    dragRef.current = { startX: event.clientX, startFromEnd: fromEnd }
  }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const rect = shellRef.current?.getBoundingClientRect()
    if (!drag || !rect) return
    const plotPx = (rect.width * (AXIS_X - PAD_X * 2)) / WIDTH
    const perBar = plotPx / Math.max(1, span)
    if (perBar <= 0) return
    const moved = Math.round((event.clientX - drag.startX) / perBar)
    setWindow(span, drag.startFromEnd + moved)
  }
  const endDrag = () => { dragRef.current = null }

  const prepared = useMemo(
    () => (mode === 'candles' ? windowed : bars),
    [bars, windowed, mode],
  )

  // K 线太密时按 N 合 1 聚合（真实 OHLCV 归并），同时保留每根在原始数组中的下标，
  // 这样时间跨度完整显示，指标与信号也能对齐到被保留的那一天。
  const candleLayout = useMemo(() => {
    const count = windowEnd - windowStart
    const size = count > MAX_RENDER_BARS ? Math.ceil(count / MAX_RENDER_BARS) : 1
    if (size === 1) {
      return {
        groupSize: 1,
        bars: prepared,
        indexes: Array.from({ length: count }, (_, offset) => windowStart + offset),
      }
    }
    const merged: ChartBar[] = []
    const indexes: number[] = []
    for (let start = 0; start < count; start += size) {
      const stop = Math.min(start + size, count)
      let high = -Infinity
      let low = Infinity
      let volume = 0
      let turnover = 0
      for (let offset = start; offset < stop; offset += 1) {
        const item = prepared[offset]!
        high = Math.max(high, item.high)
        low = Math.min(low, item.low)
        volume += item.volume
        turnover += item.turnover
      }
      const last = prepared[stop - 1]!
      indexes.push(windowStart + stop - 1)
      merged.push({
        period: last.period,
        open: prepared[start]!.open,
        high,
        low,
        close: last.close,
        volume,
        turnover,
      })
    }
    return { groupSize: size, bars: merged, indexes }
  }, [prepared, windowStart, windowEnd])

  // 指标数组与 K 线根数一一对应，切片/聚合时要把指标同步处理，否则 MA/MACD 会错位
  const ind = useMemo(() => {
    if (!indicators) return null
    if (mode !== 'candles') return indicators
    if (candleLayout.groupSize === 1 && windowStart === 0 && windowEnd === bars.length) return indicators
    const { indexes } = candleLayout
    const pick = (values: Array<number | null>) => indexes.map((index) => values[index] ?? null)
    const slotOf = new Map(indexes.map((index, slot) => [index, slot]))
    return {
      ...indicators,
      ma5: pick(indicators.ma5),
      ma10: pick(indicators.ma10),
      ma20: pick(indicators.ma20),
      dif: pick(indicators.dif),
      dea: pick(indicators.dea),
      macd_hist: pick(indicators.macd_hist),
      volume_ma5: pick(indicators.volume_ma5),
      volume_ratio: pick(indicators.volume_ratio),
      signals: indicators.signals.flatMap((signal) => {
        const slot = slotOf.get(signal.index)
        return slot === undefined ? [] : [{ ...signal, index: slot }]
      }),
    }
  }, [indicators, mode, windowStart, windowEnd, bars.length, candleLayout])

  const chart = useMemo((): {
    visible: ChartBar[]
    scale: Scale | null
    avgLine: Array<[number, number]>
    baseline: number | null
    dayStarts: Array<{ slot: number; label: string }>
  } => {
    if (prepared.length === 0) return { visible: [], scale: null, avgLine: [], baseline: null, dayStarts: [] }

    if (mode === 'timeline' || mode === 'one_min') {
      const slotWidth = (AXIS_X - PAD_X * 2) / FULL_DAY_SLOTS
      const base = prevClose ?? prepared[0]!.open
      let peak = base
      let trough = base
      for (const bar of prepared) {
        peak = Math.max(peak, bar.high)
        trough = Math.min(trough, bar.low)
      }
      const span = Math.max(base * 0.002, Math.abs(peak - base), Math.abs(base - trough)) * 1.06
      const mid = PRICE_TOP + PRICE_HEIGHT / 2
      const half = PRICE_HEIGHT / 2 - 12
      const scale: Scale = {
        slotWidth,
        xFor: (slot) => PAD_X + slotWidth * slot + slotWidth / 2,
        yFor: (value) => mid - ((value - base) / span) * half,
        priceForY: (y) => base + ((mid - y) / half) * span,
      }
      let cumTurnover = 0
      let cumVolume = 0
      const avgLine: Array<[number, number]> = []
      prepared.forEach((bar, index) => {
        cumTurnover += bar.turnover
        cumVolume += bar.volume
        if (cumVolume > 0) avgLine.push([index, cumTurnover / cumVolume])
      })
      return { visible: prepared, scale, avgLine, baseline: base, dayStarts: DAY_TICKS }
    }

    if (mode === 'five_day_line') {
      const slotWidth = (AXIS_X - PAD_X * 2) / FIVE_DAY_SLOTS
      let min = Infinity
      let max = -Infinity
      for (const bar of prepared) {
        min = Math.min(min, bar.low)
        max = Math.max(max, bar.high)
      }
      const pad = Math.max(0.01, (max - min) * 0.06)
      min -= pad
      max += pad
      const scale: Scale = {
        slotWidth,
        xFor: (slot) => PAD_X + slotWidth * slot + slotWidth / 2,
        yFor: (value) => PRICE_TOP + 12 + ((max - value) / (max - min)) * (PRICE_HEIGHT - 24),
        priceForY: (y) => max - ((y - PRICE_TOP - 12) / (PRICE_HEIGHT - 24)) * (max - min),
      }
      const days = splitByDay(prepared)
      const dayStarts: Array<{ slot: number; label: string }> = days.map((day, index) => ({
        slot: index * FULL_DAY_SLOTS,
        label: day[0]!.period.slice(5, 10),
      }))
      const offsetOf = (globalIndex: number) => {
        let remaining = globalIndex
        for (const day of days) {
          if (remaining < day.length) return remaining
          remaining -= day.length
        }
        return remaining
      }
      let cumTurnover = 0
      let cumVolume = 0
      const avgLine: Array<[number, number]> = []
      prepared.forEach((bar, index) => {
        const within = offsetOf(index)
        if (within === 0) {
          cumTurnover = 0
          cumVolume = 0
        }
        cumTurnover += bar.turnover
        cumVolume += bar.volume
        if (cumVolume > 0) avgLine.push([index, cumTurnover / cumVolume])
      })
      return { visible: prepared, scale, avgLine, baseline: null, dayStarts }
    }

    // K 线（日/周/月）
    const series = mode === 'candles' ? candleLayout.bars : prepared
    let min = Infinity
    let max = -Infinity
    for (const bar of series) {
      min = Math.min(min, bar.low)
      max = Math.max(max, bar.high)
    }
    min *= 0.995
    max *= 1.005
    const slotWidth = (AXIS_X - PAD_X * 2) / series.length
    const scale: Scale = {
      slotWidth,
      xFor: (slot) => PAD_X + slotWidth * slot + slotWidth / 2,
      yFor: (value) => PRICE_TOP + 12 + ((max - value) / Math.max(0.01, max - min)) * (PRICE_HEIGHT - 24),
      priceForY: (y) => max - ((y - PRICE_TOP - 12) / (PRICE_HEIGHT - 24)) * Math.max(0.01, max - min),
    }
    // 横轴刻度按像素密度自适应：每 ~78 单位一个标签，并保证最后一根一定标出
    const plotWidth = AXIS_X - PAD_X * 2
    const every = Math.max(1, Math.ceil(series.length / Math.max(4, Math.floor(plotWidth / 78))))
    const tickIndexes: number[] = []
    for (let index = 0; index < series.length; index += every) tickIndexes.push(index)
    const lastIndex = series.length - 1
    if (lastIndex % every !== 0) tickIndexes.push(lastIndex)
    const dayStarts = tickIndexes.map((index) => {
      const period = series[index]!.period
      return { slot: index, label: period.length > 7 ? period.slice(5, 10) : period }
    })
    return { visible: series, scale, avgLine: [], baseline: null, dayStarts }
  }, [prepared, mode, prevClose, candleLayout])

  // 指标对齐：后端 indicators 数组长度应与 visible 一致
  // 所有 Hook 必须在任何提前 return 之前调用：首帧通常还没有 bars（提前 return 走少 Hook 分支），
  // 数据到达后会走到更多 Hook 的分支，Hook 数量不一致时 React 会直接抛错并卸载整棵树（表现就是白屏）。
  const { scale: rawScale, visible, avgLine, baseline, dayStarts } = chart
  const hasMA = !!(showIndicators && ind && ind.ma5.length === visible.length)
  const hasMACD = !!(showMACD && ind && ind.dif.length === visible.length)
  const hasVolMA = !!(ind && ind.volume_ma5.length === visible.length)
  const macd = useMemo(() => {
    if (!hasMACD || !ind || !rawScale) return null
    return macdGeometry(ind.dif, ind.dea, ind.macd_hist, rawScale)
  }, [hasMACD, ind, rawScale])

  if (!rawScale || visible.length === 0) {
    return <div className="chart-empty">等待第一根行情数据…</div>
  }

  const scale = rawScale
  const closes = visible.map((bar) => bar.close)
  const lastClose = closes[closes.length - 1]!
  const lastPrev = closes.length > 1 ? closes[closes.length - 2]! : (baseline ?? lastClose)
  const maxVolume = Math.max(...visible.map((bar) => bar.volume), 1)
  const bodyWidth = Math.max(1.5, Math.min(8, scale.slotWidth * 0.64))

  const markerIndex = (trade: TradeMarker) => {
    if (mode === 'timeline' || mode === 'one_min') {
      if (!trade.executed_at) return -1
      return visible.findIndex((bar) => bar.period.slice(0, 16) === trade.executed_at?.slice(0, 16))
    }
    if (mode === 'five_day_line') {
      if (!trade.executed_at) return -1
      const minute = Number(trade.executed_at.slice(14, 16))
      const floor = minute - (minute % 5)
      const key = `${trade.executed_at.slice(0, 14)}${String(floor).padStart(2, '0')}`
      return visible.findIndex((bar) => bar.period === key)
    }
    return visible.findIndex((bar) => bar.period.slice(0, 10) === trade.trade_date)
  }

  const linePoints = closes
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${scale.xFor(index)} ${scale.yFor(value)}`)
    .join(' ')
  const avgPath = avgLine
    .map(([index, value], position) => `${position === 0 ? 'M' : 'L'} ${scale.xFor(index)} ${scale.yFor(value)}`)
    .join(' ')

  // 最新指标数值用于图例
  const lastDif = ind && ind.dif.length ? ind.dif[ind.dif.length - 1] : null
  const lastDea = ind && ind.dea.length ? ind.dea[ind.dea.length - 1] : null
  const lastHist = ind && ind.macd_hist.length ? ind.macd_hist[ind.macd_hist.length - 1] : null
  const lastVolRatio = ind && ind.volume_ratio.length ? ind.volume_ratio[ind.volume_ratio.length - 1] : null

  const crossesYear = visible.length > 1
    && visible[0]!.period.slice(0, 4) !== visible[visible.length - 1]!.period.slice(0, 4)
  const shortPeriod = (period: string) => (
    crossesYear ? period.slice(0, 10) : (period.length > 7 ? period.slice(5) : period)
  )
  const rangeLabel = zoomable && visible.length > 0
    ? `${shortPeriod(visible[0]!.period)} ~ ${shortPeriod(visible[visible.length - 1]!.period)} · 第 ${windowStart + 1}–${windowEnd} 根 / 共 ${totalBars} 根${candleLayout.groupSize > 1 ? ` · ${candleLayout.groupSize} 合 1` : ''}`
    : null
  const hovered = hoverIndex === null ? null : visible[hoverIndex] ?? null
  const hoveredPrevious = hoverIndex !== null && hoverIndex > 0
    ? visible[hoverIndex - 1]?.close ?? hovered?.open ?? 0
    : (baseline ?? hovered?.open ?? 0)
  const hoveredChange = hovered && hoveredPrevious
    ? ((hovered.close / hoveredPrevious) - 1) * 100
    : 0
  const hoverX = hoverIndex === null ? 0 : scale.xFor(hoverIndex)
  const hoverY = hovered ? scale.yFor(hovered.close) : 0
  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>): DrawingAnchor | null => {
    const rect = shellRef.current?.getBoundingClientRect()
    if (!rect) return null
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const svgY = ((event.clientY - rect.top) / rect.height) * HEIGHT
    if (svgX < PAD_X || svgX > AXIS_X || svgY < PRICE_TOP || svgY > PRICE_BOTTOM) return null
    const index = Math.min(
      visible.length - 1,
      Math.max(0, Math.round((svgX - PAD_X - scale.slotWidth / 2) / scale.slotWidth)),
    )
    return {
      period: visible[index]!.period,
      price: Math.max(0.01, scale.priceForY(svgY)),
    }
  }
  const drawingIndex = (period: string) => visible.findIndex((bar) => bar.period === period)
  const drawingGeometry = drawings.flatMap((drawing) => {
    const startIndex = drawingIndex(drawing.start.period)
    if (drawing.type === 'horizontal') {
      const y = scale.yFor(drawing.start.price)
      if (y < PRICE_TOP || y > PRICE_BOTTOM) return []
      return [{ ...drawing, x1: PAD_X, x2: AXIS_X, y1: y, y2: y }]
    }
    const endIndex = drawing.end ? drawingIndex(drawing.end.period) : -1
    if (startIndex < 0 || endIndex < 0 || !drawing.end) return []
    return [{
      ...drawing,
      x1: scale.xFor(startIndex),
      x2: scale.xFor(endIndex),
      y1: scale.yFor(drawing.start.price),
      y2: scale.yFor(drawing.end.price),
    }]
  })
  const draftStartIndex = draftDrawing ? drawingIndex(draftDrawing.start.period) : -1
  const selectDrawingTool = (tool: DrawingTool) => {
    setDrawingTool(tool)
    setDraftDrawing(null)
    setDrawingHover(null)
  }
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (drawingTool === 'cursor') {
      if (zoomable) beginDrag(event)
      return
    }
    const point = pointFromEvent(event)
    if (!point) return
    event.preventDefault()
    if (drawingTool === 'horizontal') {
      updateDrawings([
        ...drawings,
        { id: `horizontal-${Date.now()}`, type: 'horizontal', start: point },
      ])
      setDrawingTool('cursor')
      setDrawingHover(null)
      return
    }
    if (!draftDrawing) {
      setDraftDrawing({ id: `trend-${Date.now()}`, type: 'trend', start: point })
      return
    }
    updateDrawings([...drawings, { ...draftDrawing, end: point }])
    setDraftDrawing(null)
    setDrawingHover(null)
    setDrawingTool('cursor')
  }
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drawingTool !== 'cursor') {
      setDrawingHover(pointFromEvent(event))
      return
    }
    if (zoomable) moveDrag(event)
    if (mode !== 'candles' || !crosshair) return
    const rect = shellRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.round((svgX - PAD_X - scale.slotWidth / 2) / scale.slotWidth)
    if (index < 0 || index >= visible.length || svgX > AXIS_X) {
      setHoverIndex(null)
      return
    }
    setHoverIndex(index)
  }
  const handlePointerLeave = () => {
    if (zoomable) endDrag()
    setHoverIndex(null)
    setDrawingHover(null)
  }

  return (
    <div
      className={`chart-shell ${zoomable ? 'zoomable' : ''} ${drawingTool !== 'cursor' ? 'drawing-active' : ''} ${smooth ? 'chart-smooth' : ''}`}
      aria-label="历史行情实时回放图"
      ref={shellRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={zoomable ? endDrag : undefined}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={zoomable && drawingTool === 'cursor' ? () => setWindow(totalBars, 0) : undefined}
    >
      <div className="chart-drawing-tools" aria-label="K线画图工具" onPointerDown={(event) => event.stopPropagation()}>
        <span>画图</span>
        <button className={drawingTool === 'cursor' ? 'active' : ''} aria-label="光标与平移" aria-pressed={drawingTool === 'cursor'} title="光标 / 拖拽平移" onClick={() => selectDrawingTool('cursor')}><MousePointer2 size={14} /></button>
        <button className={drawingTool === 'trend' ? 'active' : ''} aria-label="趋势线" aria-pressed={drawingTool === 'trend'} title="趋势线：依次点击起点和终点" onClick={() => selectDrawingTool('trend')}><TrendingUp size={14} /></button>
        <button className={drawingTool === 'horizontal' ? 'active' : ''} aria-label="水平价格线" aria-pressed={drawingTool === 'horizontal'} title="水平价格线：在目标价位点击" onClick={() => selectDrawingTool('horizontal')}><Minus size={15} /></button>
        <i />
        <button aria-label="撤销上一条画线" title="撤销上一条" disabled={drawings.length === 0} onClick={() => updateDrawings(drawings.slice(0, -1))}><Undo2 size={14} /></button>
        <button aria-label="清空当前周期画线" title="清空当前周期画线" disabled={drawings.length === 0} onClick={() => updateDrawings([])}><Trash2 size={14} /></button>
        {drawingTool !== 'cursor' && <em>{draftDrawing ? '点击终点 · Esc 取消' : drawingTool === 'trend' ? '点击起点' : '点击目标价位'}</em>}
      </div>
      {zoomable && (
        <div className="chart-zoom">
          <button aria-label="放大" onClick={() => zoomBy(1 / 1.6)}>＋</button>
          <button aria-label="缩小" onClick={() => zoomBy(1.6)}>－</button>
          <button onClick={() => setWindow(Math.min(DEFAULT_CANDLE_SPAN, totalBars), 0)}>最近120</button>
          <button className={span >= totalBars ? 'active' : ''} onClick={() => setWindow(totalBars, 0)}>全程</button>
          {rangeLabel && <span className="zoom-range" title="滚轮缩放 / 拖拽平移 / 双击复位">{rangeLabel}</span>}
        </div>
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="行情图">
        <defs>
          <linearGradient id="volumeFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={UP} stopOpacity=".35" />
            <stop offset="1" stopColor={UP} stopOpacity=".06" />
          </linearGradient>
          <clipPath id="mainPricePlot"><rect x={PAD_X} y={PRICE_TOP} width={AXIS_X - PAD_X} height={PRICE_HEIGHT} /></clipPath>
        </defs>

        {/* 时间轴刻度 */}
        {mode === 'timeline' || mode === 'one_min'
          ? DAY_TICKS.map((tick) => (
              <g key={tick.slot}>
                <line x1={scale.xFor(tick.slot)} x2={scale.xFor(tick.slot)} y1={PRICE_TOP} y2={MACD_BOTTOM} className="grid-line" />
                <text x={scale.xFor(tick.slot)} y={HEIGHT - 6} fontSize="10" fill={AXIS_TEXT} textAnchor="middle">{tick.label}</text>
              </g>
            ))
          : dayStarts.map((tick) => (
              <text key={`${tick.slot}-${tick.label}`} x={Math.min(scale.xFor(tick.slot), AXIS_X - 16)} y={HEIGHT - 6} fontSize="10" fill={AXIS_TEXT} textAnchor="middle">{tick.label}</text>
            ))}
        {mode === 'five_day_line' && dayStarts.slice(1).map((tick) => (
          <line key={`sep-${tick.slot}`} x1={scale.xFor(tick.slot)} x2={scale.xFor(tick.slot)} y1={PRICE_TOP} y2={MACD_BOTTOM} className="grid-line" />
        ))}

        {/* 价格网格 + 分时/K线主图 */}
        {(mode === 'timeline' || mode === 'five_day_line') && (() => {
          let min = Infinity
          let max = -Infinity
          for (const bar of visible) {
            min = Math.min(min, bar.low)
            max = Math.max(max, bar.high)
          }
          if (baseline !== null) {
            const span = Math.max(
              Math.abs(max - baseline),
              Math.abs(baseline - min),
              baseline * 0.002,
            ) * 1.06
            min = baseline - span
            max = baseline + span
          } else {
            const pad = Math.max(0.01, (max - min) * 0.06)
            min -= pad
            max += pad
          }
          const range = Math.max(0.01, max - min)
          const gridValues = [0.2, 0.4, 0.6, 0.8].map((part) => max - range * part)
          return (
            <g>
              {gridValues.map((value) => (
                <g key={value}>
                  <line x1={PAD_X} x2={AXIS_X} y1={scale.yFor(value)} y2={scale.yFor(value)} className="grid-line" />
                  <text x={AXIS_X + 5} y={scale.yFor(value) + 3.5} fontSize="10" fill={AXIS_TEXT}>{value.toFixed(2)}</text>
                  <text x={AXIS_X + 5} y={scale.yFor(value) + 14} fontSize="9" fill={AXIS_TEXT}>
                    {(((value / (baseline ?? visible[0]!.open)) - 1) * 100).toFixed(2)}%
                  </text>
                </g>
              ))}
              {baseline !== null && (
                <line x1={PAD_X} x2={AXIS_X} y1={scale.yFor(baseline)} y2={scale.yFor(baseline)} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
              )}
              <path d={linePoints} fill="none" stroke={LINE_COLOR} strokeWidth="1.4" />
              <path d={avgPath} fill="none" stroke={AVG_COLOR} strokeWidth="1.2" />
              {/* 成交量副图 */}
              {visible.map((bar, index) => {
                const prev = index > 0 ? closes[index - 1]! : (baseline ?? bar.open)
                const color = bar.close >= prev ? UP : DOWN
                const height = (bar.volume / maxVolume) * VOLUME_HEIGHT
                return (
                  <rect
                    key={`vol-${bar.period}-${index}`}
                    x={scale.xFor(index) - Math.max(0.6, bodyWidth / 2)}
                    y={VOLUME_BOTTOM - height}
                    width={Math.max(1.2, bodyWidth)}
                    height={height}
                    fill={color}
                    opacity=".55"
                  />
                )
              })}
              <circle cx={scale.xFor(visible.length - 1)} cy={scale.yFor(lastClose)} r="2.6" fill={lastClose >= (baseline ?? lastPrev) ? UP : DOWN} />
            </g>
          )
        })()}

        {(mode === 'one_min' || mode === 'candles') && (() => {
          let min = Infinity
          let max = -Infinity
          for (const bar of visible) {
            min = Math.min(min, bar.low)
            max = Math.max(max, bar.high)
          }
          if (mode === 'one_min' && baseline !== null) {
            let peak = baseline
            let trough = baseline
            for (const bar of visible) {
              peak = Math.max(peak, bar.high)
              trough = Math.min(trough, bar.low)
            }
            const span = Math.max(baseline * 0.002, Math.abs(peak - baseline), Math.abs(baseline - trough)) * 1.06
            min = baseline - span
            max = baseline + span
          } else {
            min *= 0.995
            max *= 1.005
          }
          const range = Math.max(0.01, max - min)
          return (
            <g>
              {[0.2, 0.4, 0.6, 0.8].map((part) => {
                const value = max - range * part
                return (
                  <g key={part}>
                    <line x1={PAD_X} x2={AXIS_X} y1={scale.yFor(value)} y2={scale.yFor(value)} className="grid-line" />
                    <text x={AXIS_X + 5} y={scale.yFor(value) + 3.5} fontSize="10" fill={AXIS_TEXT}>{value.toFixed(2)}</text>
                  </g>
                )
              })}
              {visible.map((bar, index) => {
                const rising = bar.close >= bar.open
                const color = rising ? UP : DOWN
                const openY = scale.yFor(bar.open)
                const closeY = scale.yFor(bar.close)
                const height = (bar.volume / maxVolume) * VOLUME_HEIGHT
                return (
                  <g key={`${bar.period}-${index}`}>
                    <line x1={scale.xFor(index)} x2={scale.xFor(index)} y1={scale.yFor(bar.high)} y2={scale.yFor(bar.low)} stroke={color} />
                    <rect x={scale.xFor(index) - bodyWidth / 2} y={Math.min(openY, closeY)} width={bodyWidth} height={Math.max(1.5, Math.abs(openY - closeY))} fill={rising ? '#fff' : color} stroke={color} strokeWidth="1.2" />
                    <rect x={scale.xFor(index) - bodyWidth / 2} y={VOLUME_BOTTOM - height} width={bodyWidth} height={height} fill={rising ? 'url(#volumeFade)' : '#16a34a44'} />
                  </g>
                )
              })}
              {/* 均量线（K线模式） */}
              {hasVolMA && ind && (
                <path d={indicatorPath(ind.volume_ma5, { ...scale, yFor: (v) => VOLUME_BOTTOM - (v / maxVolume) * VOLUME_HEIGHT })} fill="none" stroke={AVG_COLOR} strokeWidth="1" opacity=".8" />
              )}
              {hasMA && ind && <><path d={indicatorPath(ind.ma5, scale)} className="ma-line ma5" /><path d={indicatorPath(ind.ma10, scale)} className="ma-line ma10" /><path d={indicatorPath(ind.ma20, scale)} className="ma-line ma20" /></>}
            </g>
          )
        })()}

        {/* 用户画线单独叠加，不改变行情节点，分钟回放时不会触发图表重建。 */}
        <g className="user-drawings" clipPath="url(#mainPricePlot)" pointerEvents="none">
          {drawingGeometry.map((drawing) => (
            <g key={drawing.id}>
              <line x1={drawing.x1} y1={drawing.y1} x2={drawing.x2} y2={drawing.y2} className={`user-drawing ${drawing.type}`} />
              {drawing.type === 'trend' && <><circle cx={drawing.x1} cy={drawing.y1} r="3.2" /><circle cx={drawing.x2} cy={drawing.y2} r="3.2" /></>}
              {drawing.type === 'horizontal' && <text x={AXIS_X - 7} y={drawing.y1 - 5} textAnchor="end">标记 {drawing.start.price.toFixed(2)}</text>}
            </g>
          ))}
          {draftDrawing && draftStartIndex >= 0 && drawingHover && (
            <g className="drawing-draft">
              <line x1={scale.xFor(draftStartIndex)} y1={scale.yFor(draftDrawing.start.price)} x2={scale.xFor(Math.max(0, drawingIndex(drawingHover.period)))} y2={scale.yFor(drawingHover.price)} />
              <circle cx={scale.xFor(draftStartIndex)} cy={scale.yFor(draftDrawing.start.price)} r="4" />
            </g>
          )}
        </g>

        {/* MACD 副图 */}
        {macd && (
          <g>
            <line x1={PAD_X} x2={AXIS_X} y1={macd.zeroY} y2={macd.zeroY} stroke="#cbd5e1" strokeWidth="0.8" />
            <text x={PAD_X} y={MACD_TOP + 9} fontSize="9" fill={AXIS_TEXT}>MACD</text>
            {macd.bars.map((bar) => (
              <rect key={`mh-${bar.index}`} x={bar.x - bar.w / 2} y={Math.min(bar.y, macd.zeroY)} width={bar.w} height={bar.height} fill={bar.color} opacity=".7" />
            ))}
            <path d={macd.difPath} fill="none" stroke={DIF_COLOR} strokeWidth="1" />
            <path d={macd.deaPath} fill="none" stroke={DEA_COLOR} strokeWidth="1" />
            {/* 信号标注 */}
            {ind?.signals.map((signal) => {
              if (signal.index < 0 || signal.index >= visible.length) return null
              const x = scale.xFor(signal.index)
              const isGolden = signal.kind === 'golden_cross'
              return (
                <g key={`sig-${signal.index}-${signal.kind}`}>
                  <circle cx={x} cy={MACD_TOP + 8} r="3" fill={isGolden ? UP : DOWN} />
                  <text x={x} y={MACD_TOP + 5} fontSize="8" fill={isGolden ? UP : DOWN} textAnchor="middle">{isGolden ? '金' : '死'}</text>
                </g>
              )
            })}
            <text x={AXIS_X + 5} y={MACD_TOP + 9} fontSize="9" fill={DIF_COLOR}>DIF {lastDif !== null && lastDif !== undefined ? lastDif.toFixed(3) : '--'}</text>
            <text x={AXIS_X + 5} y={MACD_TOP + 21} fontSize="9" fill={DEA_COLOR}>DEA {lastDea !== null && lastDea !== undefined ? lastDea.toFixed(3) : '--'}</text>
            <text x={AXIS_X + 5} y={MACD_TOP + 33} fontSize="9" fill={AXIS_TEXT}>MACD {lastHist !== null && lastHist !== undefined ? lastHist.toFixed(3) : '--'}</text>
          </g>
        )}

        {/* 成本价标签（字号缩小，避免遮挡日K线） */}
        {costPrice && costPrice > 0 && scale.yFor(costPrice) >= PRICE_TOP && scale.yFor(costPrice) <= PRICE_BOTTOM && (
          <g className="cost-line">
            <line x1={PAD_X} x2={AXIS_X} y1={scale.yFor(costPrice)} y2={scale.yFor(costPrice)} stroke="#7c3aed" strokeWidth="1.2" strokeDasharray="7 5" />
            <rect x={AXIS_X - 60} y={scale.yFor(costPrice) - 7} width="58" height="13" rx="3" fill="#7c3aed" />
            <text x={AXIS_X - 31} y={scale.yFor(costPrice) + 3} fontSize="8" fill="#fff" textAnchor="middle">成本 {costPrice.toFixed(2)}</text>
          </g>
        )}
        <rect x={AXIS_X + 2} y={scale.yFor(lastClose) - 8} width="48" height="16" rx="3" fill={lastClose >= (baseline ?? lastPrev) ? UP : DOWN} />
        <text x={AXIS_X + 26} y={scale.yFor(lastClose) + 3.5} fontSize="10" fill="#fff" textAnchor="middle">{lastClose.toFixed(2)}</text>

        {/* 成交标记 */}
        {trades.map((trade, index) => {
          const barIndex = markerIndex(trade)
          if (barIndex < 0) return null
          const y = scale.yFor(trade.price) + (trade.side === 'buy' ? 18 : -14)
          return (
            <g key={`${trade.order_id}-${index}`}>
              <circle cx={scale.xFor(barIndex)} cy={y} r="10" className={`trade-dot ${trade.side}`} />
              <text x={scale.xFor(barIndex)} y={y + 3.5} textAnchor="middle" className="trade-label">{trade.side === 'buy' ? 'B' : 'S'}</text>
            </g>
          )
        })}
        {crosshair && hovered && mode === 'candles' && (
          <g className="chart-crosshair" pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PRICE_TOP} y2={MACD_BOTTOM} stroke="#64748b" strokeWidth="0.9" strokeDasharray="4 4" />
            <line x1={PAD_X} x2={AXIS_X} y1={hoverY} y2={hoverY} stroke="#64748b" strokeWidth="0.9" strokeDasharray="4 4" />
            <circle cx={hoverX} cy={hoverY} r="3.5" fill="#fff" stroke="#334155" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {crosshair && hovered && mode === 'candles' && (
        <div className={`chart-hover-card ${hoverX > WIDTH * 0.68 ? 'align-left' : ''}`} style={{ left: `${(hoverX / WIDTH) * 100}%` }}>
          <strong>{hovered.period}</strong>
          <span>开 <b>{hovered.open.toFixed(2)}</b></span>
          <span>高 <b className="up">{hovered.high.toFixed(2)}</b></span>
          <span>低 <b className="down">{hovered.low.toFixed(2)}</b></span>
          <span>收 <b>{hovered.close.toFixed(2)}</b></span>
          <span>涨跌 <b className={hoveredChange >= 0 ? 'up' : 'down'}>{hoveredChange >= 0 ? '+' : ''}{hoveredChange.toFixed(2)}%</b></span>
          <span>成交量 <b>{new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format(hovered.volume)}</b></span>
        </div>
      )}
      <div className="chart-legend">
        {(mode === 'timeline' || mode === 'five_day_line') ? (
          <><span style={{ color: LINE_COLOR }}>分时</span><span style={{ color: AVG_COLOR }}>均价</span><span>VOL</span></>
        ) : (
          <>{hasMA && <><span className="legend-ma5">MA5</span><span className="legend-ma10">MA10</span><span className="legend-ma20">MA20</span></>}<span>VOL</span>{hasVolMA && <span style={{ color: AVG_COLOR }}>MA5量</span>}</>
        )}
        {hasMACD && <><span style={{ color: DIF_COLOR }}>DIF</span><span style={{ color: DEA_COLOR }}>DEA</span><span>MACD</span></>}
        {lastVolRatio !== null && lastVolRatio !== undefined && <span>量比 {lastVolRatio.toFixed(2)}</span>}
        {mode === 'timeline' && <span className="live-tag">实时</span>}
      </div>
    </div>
  )
}
