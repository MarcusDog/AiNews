import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe2,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { useSocket } from '../contexts/SocketContext';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';
import { getBlindSpotKey, getBubbleRiskLabel, normalizeDailySeries, trendDirectionLabel } from '../utils/analytics';

const TABS = [
  { id: 'overview', label: '总览', icon: BarChart3 },
  { id: 'diversity', label: '信息茧房', icon: Eye },
  { id: 'trends', label: '趋势', icon: TrendingUp }
];

const EVIDENCE_NAMES = {
  official: '官方一手', research: '研究论文', media: '媒体报道', engineering: '工程社区',
  cn: '国内', global: '国际'
};

async function fetchData(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.data;
}

const Metric = ({ label, value, note, accent = false }) => (
  <div className={`border-l px-4 py-4 first:border-l-0 ${accent ? 'border-[#cbb9a8] bg-[#eee6db] text-[#292621]' : 'border-[#d8d1c7]'}`}>
    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#756d63]">{label}</div>
    <div className="mt-2 text-3xl font-black tracking-tight">{value ?? '—'}</div>
    <div className="mt-1 text-xs text-[#756d63]">{note}</div>
  </div>
);

const Progress = ({ value, tone = '#466b59' }) => (
  <div className="h-1.5 bg-slate-200" aria-label={`${value}%`}>
    <div className="h-full transition-all duration-500" style={{ width: `${Math.min(Math.max(value || 0, 0), 100)}%`, backgroundColor: tone }} />
  </div>
);

const SourceLinks = ({ sources = [], compact = false }) => {
  const valid = sources.filter((source) => source?.url);
  if (!valid.length) return <span className="text-xs text-amber-700">暂无可核验来源</span>;
  return (
    <div className={`flex flex-wrap ${compact ? 'gap-x-3 gap-y-1' : 'gap-2'}`}>
      {valid.map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          title={source.title}
          className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-[#7d4436] underline decoration-[#c8a99b] underline-offset-4 hover:text-[#292621]"
        >
          <span className="truncate">{source.source || source.title || `来源 ${index + 1}`}</span>
          <ExternalLink className="h-3 w-3 flex-none" />
        </a>
      ))}
    </div>
  );
};

const DailyChart = ({ rows }) => {
  const max = Math.max(...rows.map((row) => row.count), 1);
  if (!rows.length) return <div className="flex h-52 items-center justify-center text-sm text-slate-400">暂无近 7 天数据</div>;
  return (
    <div className="mt-7 grid h-56 grid-cols-7 items-end gap-2 sm:gap-4" role="img" aria-label="近7天资讯数量柱状图">
      {rows.map((row) => (
        <div key={row.date} className="flex h-full min-w-0 flex-col justify-end">
          <div className="mb-2 text-center font-mono text-sm font-bold text-slate-800">{row.count}</div>
          <div className="group relative flex h-36 items-end bg-slate-100">
            <div
              className="w-full bg-[#466b59] transition-colors group-hover:bg-[#355343]"
              style={{ height: `${Math.max((row.count / max) * 100, row.count ? 5 : 1)}%` }}
              title={`${row.date}：${row.count} 条`}
            />
          </div>
          <div className="mt-2 truncate text-center font-mono text-[10px] text-slate-500">{row.date.slice(5)}</div>
        </div>
      ))}
    </div>
  );
};

const Distribution = ({ title, rows = [], tone = '#466b59', linkable = false }) => (
  <section className="border border-slate-300 bg-white p-5 sm:p-6">
    <h3 className="text-sm font-black tracking-wide text-slate-900">{title}</h3>
    <div className="mt-5 space-y-4">
      {rows.length ? rows.map((row) => (
        <div key={row.name}>
          <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
            {linkable && row.sampleUrl ? (
              <a href={row.sampleUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate font-semibold text-slate-800 hover:text-[#7d4436]">{row.name}</a>
            ) : <span className="min-w-0 truncate font-semibold text-slate-800">{row.name}</span>}
            <span className="flex-none font-mono text-slate-500">{row.percentage}% · {row.count}</span>
          </div>
          <Progress value={row.percentage} tone={tone} />
        </div>
      )) : <p className="text-sm text-slate-400">暂无数据</p>}
    </div>
  </section>
);

const Overview = ({ stats, quality, diversity, daily, smartTrends }) => {
  const series = normalizeDailySeries(daily);
  const categories = Object.entries(stats?.categories || {}).sort((a, b) => b[1] - a[1]);
  const categoryMax = Math.max(...categories.map(([, count]) => count), 1);
  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden border border-[#d2cbc0] bg-white text-[#292621] sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="全部资讯" value={stats?.total?.toLocaleString()} note="已去除重复 URL" />
        <Metric label="今日新增" value={stats?.today ?? 0} note="Asia/Shanghai" />
        <Metric label="近 7 天" value={daily?.total ?? 0} note={`日均 ${daily?.average ?? 0} 条`} />
        <Metric label="视野多样性" value={`${diversity?.diversityScore ?? 0}`} note={`/100 · ${getBubbleRiskLabel(diversity?.riskLevel)}`} accent />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <section className="border border-slate-300 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7d4436]">7 day signal</div>
              <h2 className="mt-2 text-xl font-black text-slate-950">近 7 天资讯趋势</h2>
              <p className="mt-1 text-xs text-slate-500">按上海自然日统计，缺失日期补 0，不使用模拟数据。</p>
            </div>
            <div className="border-l border-slate-200 pl-4 text-right">
              <div className="font-mono text-2xl font-black text-slate-950">{daily?.changeRate > 0 ? '+' : ''}{daily?.changeRate ?? 0}%</div>
              <div className="text-[11px] text-slate-500">首日 vs 今日</div>
            </div>
          </div>
          <DailyChart rows={series} />
        </section>

        <section className="border border-[#d2cbc0] bg-[#eee9df] p-5 sm:p-7">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7d4436]">What deserves attention</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">正在变化的话题</h2>
          <div className="mt-5 divide-y divide-[#cfc5b8]">
            {(smartTrends?.topKeywords || []).slice(0, 5).map((item) => (
              <div key={item.keyword} className="py-3 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold text-slate-900">{item.keyword}</span>
                  <span className="font-mono text-xs text-slate-600">{item.recentCount} / {item.previousCount}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">{trendDirectionLabel(item.trend)}</span>
                  <SourceLinks sources={item.sources?.slice(0, 1)} compact />
                </div>
              </div>
            ))}
            {!smartTrends?.topKeywords?.length && <p className="py-8 text-sm text-slate-500">暂无足够的趋势样本</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border border-slate-300 bg-white p-5 sm:p-6">
          <h3 className="text-sm font-black tracking-wide text-slate-900">分类覆盖</h3>
          <div className="mt-5 space-y-4">
            {categories.map(([name, count]) => (
              <div key={name} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-xs">
                <span className="font-semibold text-slate-700">{name}</span>
                <Progress value={(count / categoryMax) * 100} tone="#59675f" />
                <span className="text-right font-mono text-slate-500">{count}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-slate-300 bg-white p-5 sm:p-6">
          <h3 className="text-sm font-black tracking-wide text-slate-900">可用性检查</h3>
          <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200">
            <div className="pr-4"><div className="font-mono text-2xl font-black">{quality?.totalArticles ?? 0}</div><p className="mt-1 text-xs text-slate-500">分析样本</p></div>
            <div className="px-4"><div className="font-mono text-2xl font-black">{quality?.withDescriptions ?? 0}</div><p className="mt-1 text-xs text-slate-500">有完整摘要</p></div>
            <div className="pl-4"><div className="font-mono text-2xl font-black">{quality?.withImages ?? 0}</div><p className="mt-1 text-xs text-slate-500">有有效配图</p></div>
          </div>
          <p className="mt-6 border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500">完整度不等于真实性；所有事实仍应回到原文核对。</p>
        </section>
      </div>
    </div>
  );
};

const DiversityView = ({ diversity }) => {
  if (!diversity || diversity.status === 'insufficient_data') {
    return <div className="border border-slate-300 bg-white p-12 text-center text-slate-500">资讯样本不足，暂时无法评估信息茧房。</div>;
  }
  const riskTone = diversity.riskLevel === 'high' ? '#9f3f35' : diversity.riskLevel === 'medium' ? '#9a6a22' : '#466b59';
  return (
    <div className="space-y-5">
      <section className="grid border border-slate-300 bg-white lg:grid-cols-[0.7fr_1.3fr]">
        <div className="flex flex-col justify-between border-b border-slate-300 bg-[#e8e1d6] p-7 text-[#292621] lg:border-b-0 lg:border-r">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#7d4436]">Filter bubble audit</div>
            <h2 className="mt-3 text-2xl font-black">信息茧房风险</h2>
            <p className="mt-2 text-sm leading-6 text-[#675f56]">{diversity.riskMessage}</p>
          </div>
          <div className="mt-10 flex items-end gap-3">
            <span className="font-mono text-7xl font-black leading-none">{diversity.diversityScore}</span>
            <span className="mb-1 text-sm text-[#756d63]">/ 100<br />{getBubbleRiskLabel(diversity.riskLevel)}</span>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-black text-slate-950">四维覆盖评分</h3><p className="mt-1 text-xs text-slate-500">不是只数分类，而是同时检查来源、地区和证据类型。</p></div>
            <span className="font-mono text-[10px] text-slate-400">N={diversity.sampleSize}</span>
          </div>
          <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {(diversity.dimensions || []).map((item) => (
              <div key={item.id}>
                <div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold text-slate-700">{item.label}</span><span className="font-mono">{item.score}</span></div>
                <Progress value={item.score} tone={riskTone} />
                <div className="mt-1.5 text-[10px] text-slate-400">覆盖 {item.coverage} / 目标 {item.target}</div>
              </div>
            ))}
          </div>
          <p className="mt-7 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-500">{diversity.methodology}</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Distribution title="地区覆盖" rows={diversity.regionDistribution} tone="#466b59" />
        <Distribution title="证据类型" rows={diversity.evidenceDistribution} tone="#8b6654" />
        <Distribution title="内容分类" rows={diversity.categoryDistribution} tone="#59675f" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="border border-amber-300 bg-amber-50 p-6">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" /><h3 className="font-black text-amber-950">当前盲区</h3></div>
          <div className="mt-5 space-y-4">
            {(diversity.blindSpots || []).map((spot, index) => (
              <div key={getBlindSpotKey(spot, index)} className="border-t border-amber-300 pt-3 first:border-t-0 first:pt-0">
                <div className="text-xs font-bold text-amber-900">{spot.label}</div>
                <div className="mt-1 text-sm text-amber-950">{spot.dominant ? `${spot.dominant.name} 占 ${spot.dominant.percentage}%` : (spot.missing || []).map((key) => EVIDENCE_NAMES[key] || key).join('、')}</div>
              </div>
            ))}
            {!diversity.blindSpots?.length && <div className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />未发现明显结构性盲区</div>}
          </div>
        </section>
        <Distribution title="来源集中度 · 点击可核验样本" rows={(diversity.sourceDistribution || []).slice(0, 10)} tone="#466b59" linkable />
      </div>

      <section className="border border-slate-300 bg-white p-6">
        <h3 className="font-black text-slate-950">打破茧房的下一步</h3>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {(diversity.recommendations || []).slice(0, 3).map((item, index) => (
            <li key={item} className="border-l-2 border-[#7d4436] pl-4 text-sm leading-6 text-slate-700"><span className="mb-1 block font-mono text-[10px] text-[#7d4436]">0{index + 1}</span>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
};

const TrendDelta = ({ item }) => {
  if (item.trend === 'insufficient' || item.growth === null) return <span className="font-mono text-xs font-bold text-amber-700">等待基线</span>;
  const rising = item.growth > 0;
  const Icon = rising ? ArrowUpRight : item.growth < 0 ? ArrowDownRight : TrendingUp;
  return <span className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${rising ? 'text-[#9f3f35]' : item.growth < 0 ? 'text-[#466b59]' : 'text-slate-500'}`}><Icon className="h-3.5 w-3.5" />{item.previousCount === 0 && item.recentCount > 0 ? '新出现' : `${item.growth > 0 ? '+' : ''}${item.growth}%`}</span>;
};

const TrendsView = ({ trends }) => {
  if (!trends?.topKeywords?.length) return <div className="border border-slate-300 bg-white p-12 text-center text-slate-500">最近两个 7 天周期暂无足够的可比较话题。</div>;
  return (
    <div className="space-y-5">
      {trends.comparison?.status === 'insufficient_history' && <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><AlertTriangle className="mt-1 h-4 w-4 flex-none" />历史库尚未覆盖完整的两个 7 天周期。当前只展示话题数量，不把“此前为 0”误判成突然升温；数据积累满 14 天后自动开始比较。</div>}
      <section className="grid border border-[#d2cbc0] bg-white text-[#292621] sm:grid-cols-3">
        <Metric label="最近 24 小时" value={trends.timeDistribution?.last24h ?? 0} note="累计窗口" />
        <Metric label="最近 7 天" value={trends.timeDistribution?.last7d ?? 0} note="用于当前周期" accent />
        <Metric label="最近 30 天" value={trends.timeDistribution?.last30d ?? 0} note="累计窗口" />
      </section>

      <section className="border border-slate-300 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 p-5 sm:p-6">
          <div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7d4436]">Equal-window comparison</div><h2 className="mt-2 text-xl font-black text-slate-950">话题升降榜</h2></div>
          <p className="max-w-sm text-xs leading-5 text-slate-500">{trends.comparison?.method}。每项最多展示 3 条直接支撑该趋势的资讯。</p>
        </div>
        <div className="divide-y divide-slate-200">
          {trends.topKeywords.map((item, index) => (
            <article key={item.keyword} className="grid gap-4 p-5 transition hover:bg-slate-50 sm:grid-cols-[2rem_1fr_auto] sm:p-6">
              <div className="font-mono text-xs text-slate-400">{String(index + 1).padStart(2, '0')}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="font-black text-slate-950">{item.keyword}</h3><span className="text-xs text-slate-500">{trendDirectionLabel(item.trend)}</span><TrendDelta item={item} /></div>
                <div className="mt-2 text-xs text-slate-500">最近 7 天 {item.recentCount} 篇 · 此前 7 天 {item.previousCount} 篇</div>
                <div className="mt-3"><SourceLinks sources={item.sources} /></div>
              </div>
              <div className="self-start border-l border-slate-200 pl-4 text-right"><div className="font-mono text-2xl font-black">{item.recentCount}</div><div className="text-[10px] text-slate-400">CURRENT</div></div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border border-red-200 bg-red-50 p-6">
          <h3 className="font-black text-red-950">升温信号</h3>
          <div className="mt-4 space-y-4">{(trends.emergingTrends || []).map((item) => <div key={item.keyword}><p className="text-sm font-bold text-red-950">{item.description}</p><div className="mt-2"><SourceLinks sources={item.sources} compact /></div></div>)}{!trends.emergingTrends?.length && <p className="text-sm text-red-800/60">暂无达到快速升温阈值的话题</p>}</div>
        </section>
        <section className="border border-[#bdd0c6] bg-[#edf3ef] p-6">
          <h3 className="font-black text-[#2f5544]">降温信号</h3>
          <div className="mt-4 space-y-4">{(trends.decliningTrends || []).map((item) => <div key={item.keyword}><p className="text-sm font-bold text-[#2f5544]">{item.description}</p><div className="mt-2"><SourceLinks sources={item.sources} compact /></div></div>)}{!trends.decliningTrends?.length && <p className="text-sm text-[#587466]">暂无明显降温话题</p>}</div>
        </section>
      </div>
    </div>
  );
};

const Analytics = () => {
  const [data, setData] = useState({ stats: null, quality: null, diversity: null, daily: null, trends: null });
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const { connectionStatus, socket } = useSocket();

  const fetchAnalytics = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    const requests = [
      ['stats', API_ENDPOINTS.ANALYTICS_STATS],
      ['quality', API_ENDPOINTS.ANALYTICS_QUALITY],
      ['diversity', API_ENDPOINTS.ANALYTICS_DIVERSITY],
      ['daily', `${API_ENDPOINTS.ANALYTICS_DAILY_TRENDS}?days=7`],
      ['trends', API_ENDPOINTS.ANALYTICS_SMART_TRENDS]
    ];
    const results = await Promise.allSettled(requests.map(([, url]) => fetchData(url)));
    const next = {};
    const failures = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') next[requests[index][0]] = result.value;
      else failures.push(requests[index][0]);
    });
    setData((current) => ({ ...current, ...next }));
    setError(failures.length ? `部分分析暂不可用：${failures.join('、')}` : '');
    setLastUpdate(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useRefreshOnVisible(fetchAnalytics);
  useEffect(() => {
    if (!socket) return undefined;
    const onUpdate = (event) => {
      if (event?.type === 'update-complete' && event?.data?.totalSaved > 0) fetchAnalytics(true);
    };
    socket.on('news-update', onUpdate);
    return () => socket.off('news-update', onUpdate);
  }, [socket, fetchAnalytics]);

  const subtitle = useMemo(() => ({
    overview: '先看信息量，再看视野是否均衡。',
    diversity: '识别单一来源、单一地区与单一证据类型造成的偏差。',
    trends: '比较等长周期，并用原文链接解释每一个升降判断。'
  }[activeTab]), [activeTab]);

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-[#7d4436]" /><span className="ml-3 text-sm text-slate-600">正在建立视野地图…</span></div>;

  return (
    <div className="mx-auto max-w-[1500px] editorial-enter pb-16">
      <header className="border border-slate-300 bg-[#f7f5ef] p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#7d4436]"><ShieldCheck className="h-4 w-4" />Perspective monitor</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">视野监测台</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right text-[11px] leading-5 text-slate-400 sm:block">{lastUpdate ? `更新于 ${lastUpdate.toLocaleTimeString('zh-CN')}` : '等待更新'}<br />{connectionStatus === 'connected' ? '实时通道已连接' : '当前为轮询数据'}</div>
            <button type="button" onClick={() => fetchAnalytics(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 border border-[#7d4436] bg-[#7d4436] px-4 text-xs font-bold text-white transition hover:bg-[#65372d] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />刷新</button>
          </div>
        </div>
        <nav className="mt-7 flex overflow-x-auto border-b border-slate-300" role="tablist" aria-label="分析模块">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-none items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${activeTab === tab.id ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-400 hover:text-slate-700'}`}><Icon className="h-4 w-4" />{tab.label}</button>;
          })}
        </nav>
      </header>

      {error && <div className="mt-4 flex items-center gap-2 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 flex-none" />{error}</div>}

      <main className="mt-5">
        {activeTab === 'overview' && <Overview stats={data.stats} quality={data.quality} diversity={data.diversity} daily={data.daily} smartTrends={data.trends} />}
        {activeTab === 'diversity' && <DiversityView diversity={data.diversity} />}
        {activeTab === 'trends' && <TrendsView trends={data.trends} />}
      </main>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 py-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-2"><Globe2 className="h-3.5 w-3.5" />趋势不等于事实；点击来源核验原文。</span>
        <span className="inline-flex items-center gap-2"><Newspaper className="h-3.5 w-3.5" />统计范围会随资讯库更新。</span>
      </footer>
    </div>
  );
};

export default Analytics;
