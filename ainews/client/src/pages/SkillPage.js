import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Compass,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  PenLine,
  RotateCcw,
  Send
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { buildAgentHistory, getAgentSuggestions } from '../utils/agent';

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

const DailyReview = () => {
  const [review, setReview] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(API_ENDPOINTS.ANALYTICS_DIVERSITY_REVIEW)
      .then((response) => response.json())
      .then((payload) => { if (active) setReview(payload.data || null); })
      .catch(() => { if (active) setReview(null); });
    return () => { active = false; };
  }, []);

  const statusText = {
    verified: '今日已完成',
    needs_key: '等待模型复核',
    audit_failed: '等待下次复核',
    scheduled: '今日待生成'
  }[review?.status] || '正在读取';

  return (
    <section className="mt-7 grid overflow-hidden border border-[#d5ccbe] bg-[#fbf8f2] lg:grid-cols-[0.36fr_0.64fr]">
      <div className="border-b border-[#d5ccbe] p-6 sm:p-8 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]"><Compass className="h-4 w-4" />今日视野检查</div>
        <div className="mt-6 flex items-end gap-3">
          <strong className="font-serif text-5xl font-semibold text-[#25221f]">{Number.isFinite(review?.score) ? review.score : '—'}</strong>
          <span className="pb-1 text-sm text-[#716960]">{Number.isFinite(review?.score) ? '/ 100' : statusText}</span>
        </div>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-[#6d655b]"><CalendarClock className="h-4 w-4" />每天 8:30 复核一次来源分布</p>
        {review?.auditDate && <p className="mt-2 text-[11px] text-[#8a8177]">最近复核：{review.auditDate} · {statusText}</p>}
      </div>
      <div className="p-6 sm:p-8">
        <h2 className="font-serif text-2xl font-semibold text-[#292622]">今天的信息来源够不够开阔</h2>
        <div className="mt-3 max-h-56 overflow-y-auto pr-2">
          {review?.summary
            ? <RichAnswer content={review.summary} prefix="daily-review" />
            : <p className="text-sm leading-7 text-[#6d655b]">复核会查看地区、发布者和证据类型是否过度集中，再指出下一批应该补什么。</p>}
        </div>
        <SourceList sources={review?.sources || []} prefix="daily-review" />
      </div>
    </section>
  );
};

const SkillPage = () => {
  const [mode, setMode] = useState('ask');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(API_ENDPOINTS.AGENT_STATUS)
      .then((response) => response.json())
      .then((payload) => { if (active) setStatus(payload.data || { enabled: false }); })
      .catch(() => { if (active) setStatus({ enabled: false }); });
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-[1380px] pb-16 text-[#282521]">
      <section className="editorial-enter grid overflow-hidden border border-[#d5ccbe] bg-[#f8f4ec] lg:grid-cols-[1.3fr_0.7fr]">
        <div className="p-7 sm:p-10 lg:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c3f30]">AyaNewsSkill</p>
          <h1 className="mt-5 max-w-4xl font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-[#201e1b] sm:text-6xl">读得更广，写得更诚实。</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[#655e55]">这是一个给内容创作者和问题解决者使用的新闻研究 Skill。它从站内资讯里补足国内外、官方、研究、媒体与工程视角，再把真正用到的原文放回回答里。</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/downloads/AyaNewsSkill.zip" download className="inline-flex h-11 items-center gap-2 bg-[#27231f] px-5 text-sm font-semibold text-white transition hover:bg-[#8c3f30]"><Download className="h-4 w-4" />下载 Skill</a>
            <a href="https://github.com/MarcusDog/AyaNewsSkill" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 border border-[#70675d] px-5 text-sm font-semibold text-[#302c27] transition hover:border-[#8c3f30] hover:text-[#8c3f30]">查看部署说明 <ExternalLink className="h-4 w-4" /></a>
          </div>
        </div>
        <div className="border-t border-[#d5ccbe] bg-[#ede5d8] p-7 sm:p-10 lg:border-l lg:border-t-0">
          <p className="font-serif text-2xl font-semibold">它适合做什么</p>
          <div className="mt-7 space-y-6">
            {[
              ['01', '看清一件事', '比较不同地区和不同角色怎么讲同一个变化。'],
              ['02', '写成可发布内容', '先找证据，再由模型起草，不把单一报道当成全部事实。'],
              ['03', '给读者一个下一步', '把趋势落到低成本、可验证的行动，而不只复述热点。']
            ].map(([number, title, text]) => <div key={number} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-[#cfc4b5] pt-4"><span className="font-mono text-xs text-[#9d4938]">{number}</span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[#6d655b]">{text}</p></div></div>)}
          </div>
        </div>
      </section>

      <DailyReview />

      <section className="mt-7 overflow-hidden border border-[#d5ccbe] bg-white">
        <div className="flex flex-col justify-between gap-5 border-b border-[#d8d0c3] bg-[#fbf8f2] p-5 sm:flex-row sm:items-end sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8c3f30]">研究与创作</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">从一个问题开始</h2>
            <p className="mt-2 text-sm text-[#6d655b]">{status?.enabled ? 'MiniMax 已连接，回答和初稿都会经过来源检查。' : '资料检索可用；内容模型需要在服务器完成配置。'}</p>
          </div>
          <div className="inline-flex self-start border border-[#cfc5b7] bg-white p-1">
            <button type="button" onClick={() => setMode('ask')} className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold transition ${mode === 'ask' ? 'bg-[#27231f] text-white' : 'text-[#5e574f] hover:text-[#8c3f30]'}`}><MessageCircle className="h-4 w-4" />研究问答</button>
            <button type="button" onClick={() => setMode('create')} className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold transition ${mode === 'create' ? 'bg-[#27231f] text-white' : 'text-[#5e574f] hover:text-[#8c3f30]'}`}><BookOpen className="h-4 w-4" />证据成稿</button>
          </div>
        </div>
        {mode === 'ask' ? <AskPanel status={status} /> : <CreatePanel />}
      </section>
    </div>
  );
};

export default SkillPage;
