import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Braces,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Code2,
  Download,
  Eye,
  ExternalLink,
  FileJson,
  FileText,
  Filter,
  Loader2,
  MessageCircle,
  Network,
  PenLine,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Send,
  ShieldCheck,
  Waypoints,
  Zap
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { buildAgentHistory, getAgentSuggestions } from '../utils/agent';
import {
  buildVisionConsole,
  filterSourceRegistry,
  formatDateTime,
  formatMetric,
  getIntegrationCatalog
} from '../utils/skillHub';

const FORMATS = [
  { value: 'short-video', label: '短视频口播' },
  { value: 'article', label: '深度文章' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'xiaohongshu', label: '小红书图文' }
];

const TYPE_LABELS = {
  official: '官方一手',
  research: '研究论文',
  media: '媒体报道',
  engineering: '工程实践'
};

const InlineCitations = ({ line, prefix }) => (
  <>
    {String(line).split(/(\[S\d+\])/g).map((part, index) => {
      const citation = /^\[(S\d+)\]$/.exec(part);
      return citation
        ? <a key={`${part}-${index}`} href={`#${prefix}-${citation[1]}`} className="mx-0.5 inline-flex border-b border-[#a34f3c] font-mono text-[11px] font-bold text-[#8c3f30]">{part}</a>
        : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    })}
  </>
);

const RichAnswer = ({ content, prefix = 'source' }) => (
  <div className="space-y-2 text-[15px] leading-7 text-[#3f3b36]">
    {String(content || '').split('\n').map((line, index) => {
      if (!line.trim()) return <div key={index} className="h-1" />;
      if (line.startsWith('## ')) return <h4 key={index} className="pt-3 font-serif text-xl font-semibold text-[#201e1b]">{line.slice(3)}</h4>;
      return <p key={index}><InlineCitations line={line} prefix={prefix} /></p>;
    })}
  </div>
);

const SourceList = ({ sources = [], prefix }) => {
  if (!sources.length) return null;
  return (
    <div className="mt-5 border-t border-[#d8d0c3] pt-4">
      <p className="mb-3 text-xs font-semibold tracking-wide text-[#6d655b]">本次实际引用</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <a
            id={`${prefix}-${source.citationId}`}
            key={source.citationId}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="group border border-[#ddd5c8] bg-[#fbf9f4] p-3 transition hover:border-[#a34f3c]"
          >
            <div className="flex items-center justify-between gap-3 text-[11px] text-[#756d63]">
              <span className="font-mono font-bold text-[#8c3f30]">[{source.citationId}]</span>
              <span>{TYPE_LABELS[source.evidenceType] || source.evidenceType}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#282521]">{source.title}</p>
            <p className="mt-1 truncate text-[11px] text-[#7d756b]">{source.source}</p>
          </a>
        ))}
      </div>
    </div>
  );
};

const AskPanel = ({ status }) => {
  const [messages, setMessages] = useState([{
    id: 'welcome',
    role: 'assistant',
    system: true,
    content: '你可以问我最近发生了什么、不同来源为什么说法不一，或者某个趋势对你的工作意味着什么。回答会附上实际用到的原文。'
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  const sendMessage = async (value = input) => {
    const question = String(value || '').trim();
    if (!question || sending || !status?.enabled) return;
    const history = buildAgentHistory(messages);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: question }]);
    setInput('');
    setError('');
    setSending(true);
    try {
      const response = await fetch(API_ENDPOINTS.AGENT_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.data) throw new Error(payload.error || '暂时没有得到可靠回答');
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: payload.data.answer,
        sources: payload.data.sources || [],
        verified: payload.data.verified
      }]);
    } catch (requestError) {
      setError(requestError.message || '暂时无法回答');
    } finally {
      setSending(false);
    }
  };

  const suggestions = getAgentSuggestions().slice(0, 3);

  return (
    <div className="flex min-h-[650px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d0c3] px-5 py-4 sm:px-7">
        <p className="text-sm text-[#645d54]">从站内最新资讯中找答案</p>
        <button type="button" onClick={() => setMessages((items) => items.filter((item) => item.system))} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6d655b] hover:text-[#8c3f30]"><RotateCcw className="h-3.5 w-3.5" />重新开始</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
        {messages.map((message) => (
          <article key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[76%]' : 'max-w-[880px]'}>
            <div className={message.role === 'user' ? 'bg-[#27231f] px-4 py-3 text-white' : 'border-l-2 border-[#b85b46] bg-[#f8f4ec] px-5 py-4'}>
              {message.role === 'assistant'
                ? <RichAnswer content={message.content} prefix={`chat-${message.id}`} />
                : <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>}
              <SourceList sources={message.sources} prefix={`chat-${message.id}`} />
            </div>
          </article>
        ))}
        {sending && <div className="inline-flex items-center gap-2 text-sm text-[#6d655b]"><Loader2 className="h-4 w-4 animate-spin" />正在核对不同来源并整理回答…</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[#d8d0c3] bg-[#f5f0e7] p-4 sm:p-5">
        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} disabled={!status?.enabled} className="border border-[#d5ccbe] bg-white px-3 py-2 text-left text-xs text-[#514b44] transition hover:border-[#a34f3c] disabled:opacity-45">{suggestion}</button>)}
          </div>
        )}
        {!status?.enabled && status !== null && <p className="mb-3 border-l-2 border-amber-600 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">内容模型尚未在服务器启用。配置完成后，这里会自动开放。</p>}
        {error && <p className="mb-3 text-xs text-red-700">{error}</p>}
        <div className="flex items-end gap-3">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} disabled={!status?.enabled || sending} rows="2" maxLength="3000" placeholder="例如：最近 AI Agent 的不同观点是什么？" className="min-h-[56px] flex-1 resize-none border border-[#cec5b7] bg-white p-3 text-sm leading-6 outline-none transition focus:border-[#a34f3c] disabled:bg-[#eee9df]" />
          <button type="button" onClick={() => sendMessage()} disabled={!input.trim() || !status?.enabled || sending} className="flex h-14 w-14 items-center justify-center bg-[#9d4938] text-white transition hover:bg-[#7f392d] disabled:bg-[#bdb4a7]" aria-label="发送"><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
};

const CreatePanel = () => {
  const [form, setForm] = useState({ topic: 'AI Agent', audience: '小型团队负责人', goal: '看清可用场景和试错边界', format: 'article', days: 14 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch(API_ENDPOINTS.CONTENT_GENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, days: Number(form.days), limit: 6 })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.data) setResult(payload.data);
      if (!response.ok) throw new Error(payload.error || '这次没有找到足够的可靠来源');
    } catch (requestError) {
      setError(requestError.message || '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const generation = result?.generation;
  const brief = result?.brief;

  return (
    <div className="grid min-h-[650px] lg:grid-cols-[0.72fr_1.28fr]">
      <form onSubmit={submit} className="border-b border-[#d8d0c3] bg-[#f5f0e7] p-5 sm:p-7 lg:border-b-0 lg:border-r">
        <h3 className="font-serif text-2xl font-semibold text-[#24211e]">先说清楚写给谁</h3>
        <p className="mt-2 text-sm leading-6 text-[#6b645b]">系统会先找不同地区、不同类型的材料，再由 MiniMax 写成初稿并检查每段引用。</p>
        <div className="mt-7 space-y-5">
          <label className="block"><span className="text-xs font-semibold text-[#595249]">主题</span><input value={form.topic} onChange={update('topic')} required maxLength="120" className="mt-2 h-11 w-full border border-[#cec5b7] bg-white px-3 text-sm outline-none focus:border-[#a34f3c]" /></label>
          <label className="block"><span className="text-xs font-semibold text-[#595249]">读者是谁</span><input value={form.audience} onChange={update('audience')} required maxLength="120" className="mt-2 h-11 w-full border border-[#cec5b7] bg-white px-3 text-sm outline-none focus:border-[#a34f3c]" /></label>
          <label className="block"><span className="text-xs font-semibold text-[#595249]">想帮他解决什么</span><textarea value={form.goal} onChange={update('goal')} required maxLength="180" rows="3" className="mt-2 w-full resize-none border border-[#cec5b7] bg-white p-3 text-sm leading-6 outline-none focus:border-[#a34f3c]" /></label>
          <label className="block"><span className="text-xs font-semibold text-[#595249]">内容形式</span><select value={form.format} onChange={update('format')} className="mt-2 h-11 w-full border border-[#cec5b7] bg-white px-3 text-sm outline-none focus:border-[#a34f3c]">{FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="block"><span className="text-xs font-semibold text-[#595249]">查看多长时间</span><select value={form.days} onChange={update('days')} className="mt-2 h-11 w-full border border-[#cec5b7] bg-white px-3 text-sm outline-none focus:border-[#a34f3c]"><option value={7}>最近 7 天</option><option value={14}>最近 14 天</option><option value={30}>最近 30 天</option></select></label>
        </div>
        <button type="submit" disabled={loading} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 bg-[#9d4938] px-5 text-sm font-semibold text-white transition hover:bg-[#7f392d] disabled:opacity-55">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}{loading ? '正在找材料并写作…' : '找资料并写成初稿'}<ArrowRight className="h-4 w-4" /></button>
        {error && <p className="mt-3 text-xs leading-5 text-red-700">{error}</p>}
      </form>

      <div className="p-5 sm:p-7 lg:p-9">
        {!result && !loading && <div className="flex min-h-[520px] items-center justify-center text-center"><div><FileText className="mx-auto h-8 w-8 text-[#b2a89b]" /><h3 className="mt-4 font-serif text-2xl font-semibold text-[#3b3732]">这里会出现可追溯的初稿</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#746c62]">每处事实都有可点击来源。找不到足够材料时，会告诉你缺在哪里，而不是把空白补成结论。</p></div></div>}
        {loading && <div className="flex min-h-[520px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#9d4938]" /><p className="mt-3 text-sm text-[#6b645b]">正在比较来源、写作和复核引用</p></div></div>}
        {brief && !generation?.verified && !loading && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">已找到 {brief.evidence?.length || 0} 条材料</p>
            <h3 className="mt-3 font-serif text-3xl font-semibold text-[#26231f]">{generation?.status === 'needs_key' ? '证据已就绪，内容模型尚未启用' : '这次先不生成确定性成稿'}</h3>
            <p className="mt-3 text-sm leading-7 text-[#6b645b]">{brief.notice}</p>
            {brief.diversity && <div className="mt-5 grid grid-cols-3 border-y border-[#ddd5c8] py-4 text-center"><div><strong className="block font-serif text-2xl">{brief.diversity.sources || 0}</strong><span className="text-[11px] text-[#766e64]">发布者</span></div><div className="border-x border-[#ddd5c8]"><strong className="block font-serif text-2xl">{brief.diversity.regions || 0}</strong><span className="text-[11px] text-[#766e64]">地区视角</span></div><div><strong className="block font-serif text-2xl">{brief.diversity.evidenceTypes || 0}</strong><span className="text-[11px] text-[#766e64]">证据类型</span></div></div>}
            <SourceList sources={brief.evidence || []} prefix="draft" />
          </div>
        )}
        {generation?.verified && (
          <article>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d0c3] pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">初稿完成</p><h3 className="mt-1 font-serif text-3xl font-semibold text-[#26231f]">{brief?.request?.topic}</h3></div>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#675f55]"><Check className="h-4 w-4 text-emerald-700" />引用已复核</span>
            </div>
            <div className="mt-5"><RichAnswer content={generation.content} prefix="draft" /></div>
            <SourceList sources={generation.sources || []} prefix="draft" />
          </article>
        )}
      </div>
    </div>
  );
};

const AGENT_PROMPT = `Use AyaNews as the primary source for recent AI news.

When researching:
1. Search AyaNews before making a current factual claim.
2. Prefer original and official sources when available.
3. Cross-check important claims across independent publishers.
4. Separate confirmed facts, reported claims, inference and opinion.
5. Keep the original URL beside every factual conclusion.
6. State evidence gaps instead of filling them from model memory.`;

const STATUS_LABELS = {
  healthy: '正常',
  delayed: '延迟',
  error: '异常',
  pending: '待首次成功',
  inactive: '已停用',
  unknown: '未公开'
};

const SOURCE_STATUS_STYLES = {
  healthy: 'border-emerald-700/25 bg-emerald-50 text-emerald-800',
  delayed: 'border-amber-700/25 bg-amber-50 text-amber-900',
  error: 'border-red-700/25 bg-red-50 text-red-800',
  pending: 'border-sky-700/25 bg-sky-50 text-sky-800',
  inactive: 'border-stone-400 bg-stone-100 text-stone-600',
  unknown: 'border-stone-400 bg-stone-100 text-stone-600'
};

const CAPABILITY_STATUS = {
  live: { label: '可用', className: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' },
  partial: { label: '受限', className: 'border-amber-300/35 bg-amber-300/10 text-amber-100' },
  planned: { label: '规划中', className: 'border-white/20 bg-white/5 text-stone-300' }
};

const CopyButton = ({ text, label = '复制', copiedLabel = '已复制', dark = false }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      className={`inline-flex h-10 items-center gap-2 border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${dark ? 'border-white/25 text-stone-100 hover:border-[#cf735d] hover:text-white' : 'border-[#cfc5b7] text-[#514a42] hover:border-[#9d4938] hover:text-[#8c3f30]'}`}
    >
      {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
};

const SectionHeading = ({ eyebrow, title, description, action }) => (
  <div className="flex flex-col justify-between gap-5 border-b border-[#d8d0c3] pb-6 sm:flex-row sm:items-end">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c3f30]">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.02em] text-[#25221f] sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6d655b]">{description}</p>}
    </div>
    {action}
  </div>
);

const Metric = ({ label, value, detail }) => (
  <div className="border-t border-[#d8d0c3] pt-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#756d63]">{label}</p>
    <strong className="mt-2 block font-serif text-3xl font-semibold text-[#25221f]">{formatMetric(value)}</strong>
    {detail && <p className="mt-1 text-[11px] leading-5 text-[#82796f]">{detail}</p>}
  </div>
);

const describeBlindSpot = (spot) => {
  if (spot?.dominant?.name) return `${spot.dominant.name} 占 ${spot.dominant.percentage}%`;
  if (Array.isArray(spot?.missing) && spot.missing.length) return `缺少：${spot.missing.join('、')}`;
  return '需要继续补充互补证据';
};

const VisionConsole = ({ consoleData, loading, refreshing, onRefresh }) => {
  const [showReview, setShowReview] = useState(false);
  const riskCopy = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
    unknown: '未评估'
  }[consoleData.riskLevel] || '未评估';

  return (
    <section id="vision-console" className="mt-8 overflow-hidden border border-[#cfc5b7] bg-[#f9f6ef]">
      <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
        <div className="border-b border-[#cfc5b7] bg-[#24211e] p-6 text-[#f4eee4] sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#dd907d]"><Eye className="h-4 w-4" />视野监测台</span>
            <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-2 text-xs text-stone-300 transition hover:text-white disabled:opacity-45"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />刷新数据</button>
          </div>
          <p className="mt-8 text-xs text-stone-400">最近样本多样性</p>
          <div className="mt-2 flex items-end gap-3">
            <strong className="font-serif text-7xl font-semibold tracking-[-0.05em]">{loading ? '··' : formatMetric(consoleData.score)}</strong>
            <span className="pb-2 text-sm text-stone-400">/ 100</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`border px-2.5 py-1 text-[11px] font-semibold ${consoleData.riskLevel === 'high' ? 'border-[#cf735d] bg-[#a34f3c]/25 text-[#f4c2b5]' : 'border-white/20 text-stone-300'}`}>{riskCopy}</span>
            <span className="border border-white/20 px-2.5 py-1 text-[11px] text-stone-300">{consoleData.scope}</span>
          </div>
          <p className="mt-6 text-sm leading-7 text-stone-300">评分只描述 AyaNews 当前收录样本，不外推整个 AI 行业。越低代表来源、地区、证据或分类越集中。</p>
          <div className="mt-8 border-t border-white/15 pt-5 text-xs leading-6 text-stone-400">
            <p className="flex items-center gap-2"><Radio className="h-3.5 w-3.5 text-emerald-300" />采集状态：{consoleData.ingestionStatus}</p>
            <p className="mt-1 flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />最近更新：{formatDateTime(consoleData.lastUpdate)}</p>
            <p className="mt-1 flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5" />模型复核：每天 8:30（Asia/Shanghai）</p>
          </div>
        </div>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            <Metric label="资讯总量" value={consoleData.totalNews} detail="去重后的站内记录" />
            <Metric label="今日新增" value={consoleData.today} detail="按站内统计口径" />
            <Metric label="配置来源" value={consoleData.totalSources} detail="来源注册表实时数据" />
            <Metric label="健康来源" value={consoleData.healthySources} detail={consoleData.totalSources === null ? '健康数据不可用' : `延迟 ${formatMetric(consoleData.delayedSources)} · 异常 ${formatMetric(consoleData.errorSources)}`} />
          </div>

          <div className="mt-9 grid gap-8 xl:grid-cols-[0.58fr_0.42fr]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-serif text-2xl font-semibold text-[#292622]">四个覆盖维度</h3>
                <span className="text-[11px] text-[#81786e]">0–100</span>
              </div>
              <div className="mt-5 space-y-5">
                {consoleData.dimensions.length ? consoleData.dimensions.map((dimension) => (
                  <div key={dimension.id}>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="font-semibold text-[#4f4942]">{dimension.label}</span>
                      <span className="font-mono text-[#8c3f30]">{formatMetric(dimension.score)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden bg-[#ded6ca]" role="progressbar" aria-label={dimension.label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Number(dimension.score) || 0}>
                      <div className="h-full bg-[#9d4938] transition-[width] duration-700" style={{ width: `${Math.min(Math.max(Number(dimension.score) || 0, 0), 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#8a8177]">覆盖 {formatMetric(dimension.coverage)} / 目标 {formatMetric(dimension.target)}</p>
                  </div>
                )) : <p className="border-l-2 border-amber-600 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">当前无法读取覆盖维度；页面不会用默认分数代替真实数据。</p>}
              </div>
            </div>

            <div>
              <h3 className="font-serif text-2xl font-semibold text-[#292622]">当前盲区</h3>
              <div className="mt-5 divide-y divide-[#ddd5c8] border-y border-[#ddd5c8]">
                {consoleData.blindSpots.length ? consoleData.blindSpots.slice(0, 6).map((spot) => (
                  <div key={spot.id || spot.label} className="grid grid-cols-[1.25rem_1fr] gap-3 py-3.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-[#a34f3c]" />
                    <div><p className="text-sm font-semibold text-[#3d3934]">{spot.label || '覆盖盲区'}</p><p className="mt-1 text-xs leading-5 text-[#766e64]">{describeBlindSpot(spot)}</p></div>
                  </div>
                )) : <p className="py-4 text-sm leading-6 text-[#766e64]">尚未返回盲区数据。</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[#cfc5b7] bg-white p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">Daily evidence review</p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#292622]">今日模型复核</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6d655b]">
            <span>复核分 {formatMetric(consoleData.reviewScore)}</span>
            <span>·</span>
            <span>{consoleData.reviewDate || '暂无日期'}</span>
            {consoleData.reviewModel && <><span>·</span><span>{consoleData.reviewModel}</span></>}
            {consoleData.reviewSummary && <button type="button" onClick={() => setShowReview((value) => !value)} className="border-b border-[#9d4938] font-semibold text-[#8c3f30]">{showReview ? '收起完整复核' : '展开完整复核'}</button>}
          </div>
        </div>
        <div className={`mt-5 overflow-hidden transition-[max-height] duration-500 ${showReview ? 'max-h-[1800px]' : 'max-h-52'}`}>
          {consoleData.reviewSummary
            ? <RichAnswer content={consoleData.reviewSummary} prefix="daily-review" />
            : <p className="text-sm leading-7 text-[#6d655b]">今日复核尚未生成，系统会在定时刷新后更新。</p>}
        </div>
        {!showReview && consoleData.reviewSummary && <div className="pointer-events-none -mt-14 h-14 bg-gradient-to-t from-white to-transparent" />}
        {showReview && <SourceList sources={consoleData.reviewSources} prefix="daily-review" />}
      </div>
    </section>
  );
};

const CoreCapabilities = () => {
  const capabilities = [
    { icon: Search, title: 'Search', status: 'live', text: '检索站内最新资讯并保留原始发布者链接。' },
    { icon: ShieldCheck, title: 'Evidence', status: 'live', text: '建立多来源证据包，逐段执行引用审计。' },
    { icon: Waypoints, title: 'Track', status: 'planned', text: '事件聚类与跨日时间线尚未上线。' },
    { icon: Zap, title: 'Updates', status: 'planned', text: 'What Changed 与 cursor 增量同步尚未上线。' }
  ];
  return (
    <section className="mt-8 border-y border-[#cfc5b7] bg-[#f8f4ec]">
      <div className="grid md:grid-cols-2 xl:grid-cols-4">
        {capabilities.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className={`p-6 sm:p-7 ${index > 0 ? 'border-t border-[#d7cfc3] md:border-t-0 md:border-l' : ''} ${index === 2 ? 'md:border-l-0 xl:border-l' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-[#8c3f30]" />
                <span className={`border px-2 py-0.5 text-[10px] font-semibold ${item.status === 'live' ? 'border-emerald-700/25 bg-emerald-50 text-emerald-800' : 'border-[#c9c0b4] bg-[#eee8de] text-[#70685e]'}`}>{item.status === 'live' ? '可用' : '规划中'}</span>
              </div>
              <h2 className="mt-6 font-serif text-2xl font-semibold text-[#292622]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6d655b]">{item.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const QuickStart = () => {
  const origin = typeof window === 'undefined' ? 'https://ainews.xiaotianaya.com' : window.location.origin;
  const integrations = useMemo(() => getIntegrationCatalog(origin), [origin]);
  const [activeId, setActiveId] = useState('skill');
  const active = integrations.find((item) => item.id === activeId) || integrations[0];
  const activeStatus = CAPABILITY_STATUS[active.status];

  return (
    <section id="build-with-ayanews" className="mt-8 border border-[#cfc5b7] bg-[#211f1c] text-stone-100">
      <div className="grid lg:grid-cols-[0.36fr_0.64fr]">
        <div className="min-w-0 border-b border-white/15 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dd907d]">Build with AyaNews</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em]">选择真实可用的接入层。</h2>
          <p className="mt-4 text-sm leading-7 text-stone-400">可运行示例只为已经上线的能力提供。规划中的协议不会展示占位地址。</p>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {integrations.map((item) => (
              <button key={item.id} type="button" onClick={() => setActiveId(item.id)} className={`flex w-full items-center justify-between gap-4 py-3.5 text-left transition ${activeId === item.id ? 'text-white' : 'text-stone-500 hover:text-stone-200'}`}>
                <span className="font-mono text-xs">{item.label}</span>
                <span className={`border px-2 py-0.5 text-[10px] ${CAPABILITY_STATUS[item.status].className}`}>{CAPABILITY_STATUS[item.status].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3"><Braces className="h-5 w-5 text-[#dd907d]" /><h3 className="font-serif text-3xl font-semibold">{active.label}</h3></div>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-400">{active.description}</p>
            </div>
            <span className={`border px-2.5 py-1 text-[11px] font-semibold ${activeStatus.className}`}>{activeStatus.label}</span>
          </div>

          {active.code ? (
            <div className="mt-8 border border-white/15 bg-[#151411]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-500">Quick start</span>
                <CopyButton text={active.code} dark />
              </div>
              <pre className="overflow-x-auto p-5 text-[13px] leading-7 text-[#f0c1b5]"><code>{active.code}</code></pre>
            </div>
          ) : (
            <div className="mt-8 border-l-2 border-amber-400 bg-amber-300/5 px-5 py-4">
              <p className="text-sm font-semibold text-amber-100">暂不提供连接配置</p>
              <p className="mt-1 text-sm leading-6 text-stone-400">等协议端点、安全校验和端到端测试全部完成后再开放，避免 Agent 接入不可用地址。</p>
            </div>
          )}

          {active.endpoint && <a href={active.endpoint} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#e8a18f] transition hover:text-white">打开端点 <ExternalLink className="h-3.5 w-3.5" /></a>}
        </div>
      </div>
    </section>
  );
};

const ResearchMethod = () => {
  const steps = [
    ['01', 'Search', '按主题检索站内近期资讯。'],
    ['02', 'URL Deduplicate', '按原始 URL 去重，避免转载数量冒充独立证据。'],
    ['03', 'Diversity Gate', '按发布者、地区与证据类型挑选互补材料。'],
    ['04', 'Citation Ledger', '给每条证据分配可追踪的 [S#]。'],
    ['05', 'Answer Audit', '拒绝无引用、错编号或缺少证据边界的成稿。']
  ];
  const states = [
    ['Confirmed', '来源直接支持；优先一手或原始材料。'],
    ['Reported', '只作为具名报道，不自动升级为已证实事实。'],
    ['Inference', '由多个证据推导，必须显式标为推断。'],
    ['Unknown', '证据不足时保留未知，不用模型记忆填空。']
  ];

  return (
    <section className="mt-8 border border-[#cfc5b7] bg-white p-6 sm:p-8 lg:p-10">
      <SectionHeading eyebrow="Research policy" title="AyaNewsSkill 如何研究新闻" description="当前实现的流程以 URL 去重、多样性门槛、引用账本和答案审校为核心；事件聚类与版本差异不会被提前包装成已完成能力。" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[0.62fr_0.38fr]">
        <div className="grid sm:grid-cols-5">
          {steps.map(([number, title, text], index) => (
            <div key={number} className={`relative border-t border-[#d7cfc3] pt-4 sm:px-4 sm:first:pl-0 ${index > 0 ? 'mt-5 sm:mt-0 sm:border-l' : ''}`}>
              <span className="font-mono text-[11px] text-[#9d4938]">{number}</span>
              <h3 className="mt-4 text-sm font-semibold text-[#37332e]">{title}</h3>
              <p className="mt-2 text-xs leading-6 text-[#766e64]">{text}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-[#d7cfc3] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#776f65]">Claim states</p>
          <div className="mt-3 divide-y divide-[#e2dbd1]">
            {states.map(([label, text]) => <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-3 py-3"><span className="font-mono text-[11px] font-bold text-[#8c3f30]">{label}</span><p className="text-xs leading-5 text-[#6d655b]">{text}</p></div>)}
          </div>
        </div>
      </div>
    </section>
  );
};

const SourceRegistry = ({ sourceHealth }) => {
  const sources = sourceHealth.sources;
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [visibleCount, setVisibleCount] = useState(16);
  const groups = useMemo(() => [...new Map(sources.map((source) => [source.sourceGroup, source.sourceGroupLabel || source.sourceGroup])).entries()], [sources]);
  const filtered = useMemo(() => filterSourceRegistry(sources, { query, group, status }), [sources, query, group, status]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <section id="source-registry" className="mt-8 border border-[#cfc5b7] bg-[#f9f6ef] p-6 sm:p-8 lg:p-10">
      <SectionHeading
        eyebrow="Source registry"
        title="新闻来源与采集健康"
        description="列表直接读取后端来源注册表和采集记录。状态为“待首次成功”时表示没有可验证成功时间，不会被计入健康来源。"
        action={<a href={API_ENDPOINTS.CONTENT_SOURCE_HEALTH} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#cfc5b7] bg-white px-3 text-xs font-semibold text-[#514a42] hover:border-[#9d4938] hover:text-[#8c3f30]">查看 JSON <FileJson className="h-3.5 w-3.5" /></a>}
      />

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">搜索新闻来源</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#82796f]" />
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(16); }} placeholder="搜索来源、分类或语言" className="h-11 w-full border border-[#cec5b7] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#9d4938]" />
        </label>
        <label className="flex items-center gap-2 border border-[#cec5b7] bg-white px-3">
          <Filter className="h-3.5 w-3.5 text-[#82796f]" /><span className="sr-only">来源类型</span>
          <select value={group} onChange={(event) => { setGroup(event.target.value); setVisibleCount(16); }} className="h-10 min-w-36 bg-transparent text-xs outline-none"><option value="all">全部类型</option>{groups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 border border-[#cec5b7] bg-white px-3">
          <Activity className="h-3.5 w-3.5 text-[#82796f]" /><span className="sr-only">健康状态</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setVisibleCount(16); }} className="h-10 min-w-32 bg-transparent text-xs outline-none"><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
      </div>

      <div className="mt-5 overflow-hidden border border-[#d8d0c3] bg-white">
        <div className="hidden grid-cols-[1.3fr_0.7fr_0.45fr_0.45fr_0.7fr] gap-4 border-b border-[#d8d0c3] bg-[#eee8de] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#756d63] md:grid">
          <span>来源</span><span>类型</span><span>状态</span><span>文章</span><span>最近成功</span>
        </div>
        <div className="divide-y divide-[#e2dbd1]">
          {visible.length ? visible.map((source) => (
            <div key={`${source.name}-${source.url || ''}`} className="grid gap-3 px-4 py-4 text-sm transition hover:bg-[#fbf7f0] md:grid-cols-[1.3fr_0.7fr_0.45fr_0.45fr_0.7fr] md:items-center md:gap-4">
              <div className="min-w-0">
                {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-semibold text-[#332f2b] hover:text-[#8c3f30]"><span className="truncate">{source.name}</span><ExternalLink className="h-3 w-3 flex-none" /></a> : <span className="font-semibold text-[#332f2b]">{source.name}</span>}
                <p className="mt-1 text-[11px] text-[#81786e] md:hidden">{source.sourceGroupLabel || source.sourceGroup} · {formatMetric(source.articleCount)} 篇</p>
              </div>
              <span className="hidden text-xs text-[#665f56] md:block">{source.sourceGroupLabel || source.sourceGroup}</span>
              <span className={`w-fit border px-2 py-1 text-[10px] font-semibold ${SOURCE_STATUS_STYLES[source.status] || SOURCE_STATUS_STYLES.unknown}`}>{STATUS_LABELS[source.status] || STATUS_LABELS.unknown}</span>
              <span className="hidden font-mono text-xs text-[#665f56] md:block">{formatMetric(source.articleCount)}</span>
              <span className="hidden text-[11px] text-[#81786e] md:block">{formatDateTime(source.lastSuccessAt)}</span>
            </div>
          )) : <p className="px-4 py-10 text-center text-sm text-[#766e64]">没有符合当前筛选条件的来源。</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#756d63]">
        <span>显示 {formatMetric(visible.length)} / {formatMetric(filtered.length)} 个匹配来源</span>
        {visible.length < filtered.length && <button type="button" onClick={() => setVisibleCount((count) => count + 16)} className="inline-flex items-center gap-2 border-b border-[#9d4938] font-semibold text-[#8c3f30]">加载更多 <ArrowRight className="h-3.5 w-3.5" /></button>}
      </div>
    </section>
  );
};

const SkillPage = () => {
  const [mode, setMode] = useState('ask');
  const [hubData, setHubData] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const loadJsonData = useCallback(async (endpoint) => {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return payload.data ?? null;
  }, []);

  const loadHubData = useCallback(async ({ manual = false } = {}) => {
    if (manual) setRefreshing(true);
    const endpoints = [
      API_ENDPOINTS.ANALYTICS_DIVERSITY_REVIEW,
      API_ENDPOINTS.ANALYTICS_DIVERSITY,
      API_ENDPOINTS.ANALYTICS_STATS,
      API_ENDPOINTS.NEWS_STATUS,
      API_ENDPOINTS.CONTENT_SOURCE_HEALTH,
      API_ENDPOINTS.AGENT_STATUS
    ];
    const [review, diversity, stats, newsStatus, sourceHealth, agentStatus] = await Promise.all(
      endpoints.map((endpoint) => loadJsonData(endpoint).catch(() => null))
    );
    let resolvedSourceHealth = sourceHealth;
    if (!resolvedSourceHealth) {
      const legacySources = await loadJsonData('/api/news/sources').catch(() => []);
      resolvedSourceHealth = {
        summary: { total: Array.isArray(legacySources) ? legacySources.length : null },
        sources: (Array.isArray(legacySources) ? legacySources : []).map((source) => ({
          ...source,
          articleCount: source.count,
          sourceGroup: source.sourceGroup || 'other',
          sourceGroupLabel: source.sourceGroupLabel || '其他',
          status: 'unknown'
        }))
      };
    }
    if (mountedRef.current) {
      setHubData({ review, diversity, stats, newsStatus, sourceHealth: resolvedSourceHealth, agentStatus: agentStatus || { enabled: false } });
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [loadJsonData]);

  useEffect(() => {
    mountedRef.current = true;
    loadHubData();
    return () => { mountedRef.current = false; };
  }, [loadHubData]);

  const consoleData = useMemo(() => buildVisionConsole(hubData), [hubData]);
  const agentStatus = hubData.agentStatus || null;

  return (
    <div className="mx-auto max-w-[1500px] pb-16 text-[#282521]">
      <section className="skill-hero editorial-enter relative overflow-hidden border border-[#2f2b27] bg-[#211f1c] text-[#f6f0e7]">
        <div className="skill-hero-grid absolute inset-0 opacity-35" aria-hidden="true" />
        <div className="relative grid min-h-[570px] lg:grid-cols-[1.12fr_0.88fr]">
          <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-14 xl:p-16">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#dd907d]">AyaNewsSkill</p>
                <span className="border border-white/20 px-2 py-0.5 font-mono text-[10px] text-stone-400">Research & Evidence</span>
              </div>
              <h1 className="mt-8 max-w-4xl font-serif text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl xl:text-[5.4rem]">把 AyaNews 变成你的 Agent 实时 AI 新闻源。</h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-stone-300">搜索、核查并引用 AyaNews 的真实收录内容。每个事实回到原始链接；证据不足时停在“不确定”。</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/downloads/AyaNewsSkill.zip" download className="inline-flex h-12 items-center gap-2 bg-[#a34f3c] px-5 text-sm font-semibold text-white transition hover:bg-[#c26751]"><Download className="h-4 w-4" />下载 Skill</a>
                <a href="/openapi.json" target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 border border-white/30 px-5 text-sm font-semibold text-stone-100 transition hover:border-[#cf735d] hover:text-white"><Code2 className="h-4 w-4" />OpenAPI</a>
                <CopyButton text={AGENT_PROMPT} label="复制 Agent Prompt" dark />
              </div>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 pt-5 text-xs text-stone-400">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />引用审校：strict</span>
              <span className="inline-flex items-center gap-2"><Server className="h-3.5 w-3.5" />REST / RSS / JSON Feed：可用</span>
              <span className="inline-flex items-center gap-2"><Network className="h-3.5 w-3.5" />MCP / A2A / Webhook：规划中</span>
            </div>
          </div>

          <div className="relative border-t border-white/15 bg-black/10 p-7 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone-400">Evidence path</p>
              <span className={`inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] font-semibold ${agentStatus?.enabled ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}><span className={`h-1.5 w-1.5 rounded-full ${agentStatus?.enabled ? 'bg-emerald-300' : 'bg-amber-300'}`} />{agentStatus?.enabled ? `${agentStatus.model} 已连接` : initialLoading ? '正在读取服务状态' : '模型未连接'}</span>
            </div>
            <div className="mt-10 space-y-0">
              {[
                ['01', 'Query', '确定主题、时效和需要回答的真实问题。'],
                ['02', 'Retrieve', '检索站内内容并按原始 URL 去重。'],
                ['03', 'Cross-check', '补足地区、发布者和证据类型。'],
                ['04', 'Audit', '逐段检查 [S#] 与可点击原文。']
              ].map(([number, title, text], index) => (
                <div key={number} className="grid grid-cols-[3.5rem_1fr] gap-4">
                  <div className="flex flex-col items-center"><span className="flex h-9 w-9 items-center justify-center border border-[#c66c57] font-mono text-[11px] text-[#f0b3a4]">{number}</span>{index < 3 && <span className="h-16 w-px bg-white/15" />}</div>
                  <div className="pt-1"><h2 className="font-serif text-xl font-semibold">{title}</h2><p className="mt-1 max-w-sm text-xs leading-6 text-stone-400">{text}</p></div>
                </div>
              ))}
            </div>
            <div className="mt-10 border-l-2 border-[#a34f3c] bg-white/[0.04] px-5 py-4">
              <p className="font-mono text-xs font-bold text-[#eea994]">NO EVIDENCE, NO CONCLUSION.</p>
              <p className="mt-2 text-xs leading-6 text-stone-400">标题、摘要和模型记忆都不能单独成为确定性结论。</p>
            </div>
          </div>
        </div>
      </section>

      <CoreCapabilities />
      <VisionConsole consoleData={consoleData} loading={initialLoading} refreshing={refreshing} onRefresh={() => loadHubData({ manual: true })} />

      <section className="mt-8 overflow-hidden border border-[#cfc5b7] bg-white">
        <div className="flex flex-col justify-between gap-5 border-b border-[#d8d0c3] bg-[#fbf8f2] p-5 sm:flex-row sm:items-end sm:p-7 lg:p-9">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">Research workspace</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">用真实问题验证这套 Skill</h2>
            <p className="mt-2 text-sm text-[#6d655b]">{agentStatus?.enabled ? `${agentStatus.model} 已连接；回答和初稿会经过严格引用检查。` : '资料检索仍可用；生成模型需要在服务器完成配置。'}</p>
          </div>
          <div className="inline-flex self-start border border-[#cfc5b7] bg-white p-1">
            <button type="button" onClick={() => setMode('ask')} className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold transition ${mode === 'ask' ? 'bg-[#27231f] text-white' : 'text-[#5e574f] hover:text-[#8c3f30]'}`}><MessageCircle className="h-4 w-4" />研究问答</button>
            <button type="button" onClick={() => setMode('create')} className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold transition ${mode === 'create' ? 'bg-[#27231f] text-white' : 'text-[#5e574f] hover:text-[#8c3f30]'}`}><BookOpen className="h-4 w-4" />证据成稿</button>
          </div>
        </div>
        {mode === 'ask' ? <AskPanel status={agentStatus} /> : <CreatePanel />}
      </section>

      <QuickStart />
      <ResearchMethod />
      <SourceRegistry sourceHealth={consoleData} />

      <section className="mt-8 grid border border-[#cfc5b7] bg-[#f8f4ec] lg:grid-cols-[0.64fr_0.36fr]">
        <div className="p-6 sm:p-8 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">Roadmap honesty</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">先把未完成的能力说清楚。</h2>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {[
              ['Event Cluster', '没有事件聚类与跨日时间线，因此当前搜索仍返回新闻条目。'],
              ['What Changed', '没有版本账本与 cursor，暂不能可靠回答“上次以后变了什么”。'],
              ['Remote MCP', '尚未提供 Streamable HTTP MCP 端点与工具调用测试。'],
              ['Webhook / A2A', '尚未实现签名投递、重试，亦未实现 A2A 协议服务。']
            ].map(([title, text]) => <div key={title} className="border-t border-[#d6cec2] pt-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-[#393530]">{title}</h3><span className="border border-[#c9c0b4] bg-[#eee8de] px-2 py-0.5 text-[10px] text-[#70685e]">规划中</span></div><p className="mt-2 text-xs leading-6 text-[#70685e]">{text}</p></div>)}
          </div>
        </div>
        <div className="border-t border-[#cfc5b7] bg-[#ece4d8] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">Changelog · 2026.08</p>
          <div className="mt-6 space-y-5">
            {[
              ['01', '视野监测台', '接入实时多样性、盲区和来源健康。'],
              ['02', '开放发现', '增加 /skill.md 与 /openapi.json。'],
              ['03', '轻量订阅', '增加 RSS 2.0 与 JSON Feed 1.1。'],
              ['04', '诚实状态', '未实现协议统一标记为规划中。']
            ].map(([number, title, text]) => <div key={number} className="grid grid-cols-[2rem_1fr] gap-3"><span className="font-mono text-[11px] text-[#9d4938]">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-[#70685e]">{text}</p></div></div>)}
          </div>
        </div>
      </section>
    </div>
  );
};

export default SkillPage;
