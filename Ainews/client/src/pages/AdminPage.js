import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Database,
  FileClock,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { buildAdminHeaders } from '../utils/admin';

const TABS = [
  { id: 'overview', label: '概览', icon: Activity },
  { id: 'sources', label: '数据源', icon: Database },
  { id: 'logs', label: '请求日志', icon: FileClock },
  { id: 'contacts', label: '联系表单', icon: Inbox }
];

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
};

const AdminPage = () => {
  const [apiKey, setApiKey] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState({ overview: null, sources: [], logs: [], contacts: [] });
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (endpoint, options = {}) => {
    const response = await fetch(endpoint, {
      ...options,
      headers: { ...buildAdminHeaders(apiKey), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setAuthorized(false);
      setApiKey('');
      throw new Error('管理密钥已失效，请重新输入');
    }
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }, [apiKey]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, sources, logs, contacts] = await Promise.all([
        request(API_ENDPOINTS.ADMIN_OVERVIEW),
        request(API_ENDPOINTS.ADMIN_SOURCES),
        request(API_ENDPOINTS.ADMIN_LOGS),
        request(API_ENDPOINTS.ADMIN_CONTACTS)
      ]);
      setData({
        overview: overview.data,
        sources: sources.data || [],
        logs: logs.data || [],
        contacts: contacts.data || []
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (authorized) loadAll();
  }, [authorized, loadAll]);

  const login = async (event) => {
    event.preventDefault();
    if (!apiKey) return;
    setLoading(true);
    setError('');
    try {
      await request(API_ENDPOINTS.ADMIN_VERIFY, { method: 'POST', body: '{}' });
      setAuthorized(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (name, endpoint) => {
    if (action) return;
    setAction(name);
    setError('');
    setNotice('');
    try {
      const payload = await request(endpoint, { method: 'POST', body: '{}' });
      setNotice(payload.message || `${name}已完成`);
      await loadAll();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAction('');
    }
  };

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 py-12">
        <div className="w-full max-w-md border border-[#d3cabd] bg-[#fbf8f2] p-7 shadow-[0_25px_70px_rgba(62,49,35,0.12)] sm:p-10">
          <a href="#/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#6b6359] hover:text-[#8c3f30]"><ArrowLeft className="h-4 w-4" />返回网站</a>
          <div className="mt-10 flex h-11 w-11 items-center justify-center bg-[#27231f] text-white"><KeyRound className="h-5 w-5" /></div>
          <h1 className="mt-5 font-serif text-4xl font-semibold text-[#24211e]">管理后台</h1>
          <p className="mt-3 text-sm leading-6 text-[#6c645b]">输入只保存在当前页面内存中的管理密钥。关闭或刷新页面后需要重新输入。</p>
          <form onSubmit={login} className="mt-8">
            <label className="block text-xs font-semibold text-[#5d564d]">API Key</label>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck="false" className="mt-2 h-12 w-full border border-[#c9c0b3] bg-white px-4 font-mono text-sm outline-none focus:border-[#9d4938]" placeholder="输入管理密钥" autoFocus />
            <button type="submit" disabled={!apiKey || loading} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 bg-[#9d4938] text-sm font-semibold text-white transition hover:bg-[#7f392d] disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />}进入后台</button>
          </form>
          {error && <p className="mt-4 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}
        </div>
      </div>
    );
  }

  const overview = data.overview || {};
  const statistics = overview.statistics || {};
  const sourceSummary = overview.sources || {};

  return (
    <div className="min-h-screen bg-[#f3efe7] text-[#292621]">
      <header className="border-b border-[#d2c9bb] bg-[#fbfaf6] text-[#292621]">
        <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-[#80776c]">AI News operations</p><h1 className="mt-1 font-serif text-2xl font-semibold">管理后台</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadAll} disabled={loading} className="inline-flex h-10 items-center gap-2 border border-[#cfc7bc] px-3 text-xs font-semibold text-[#615b53] hover:border-[#7d4436] hover:text-[#7d4436]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新数据</button>
            <button type="button" onClick={() => { setAuthorized(false); setApiKey(''); }} className="inline-flex h-10 items-center gap-2 px-3 text-xs font-semibold text-[#746d63] hover:text-[#7d4436]"><LogOut className="h-4 w-4" />退出</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1540px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-[#d2c9bb] bg-[#ebe4d8] p-4 lg:min-h-[calc(100vh-81px)] lg:border-b-0 lg:border-r lg:p-6">
          <nav className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex h-11 flex-none items-center gap-3 px-3 text-sm font-semibold transition lg:w-full ${activeTab === id ? 'bg-[#7d4436] text-white' : 'text-[#61594f] hover:bg-white/60 hover:text-[#292621]'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </nav>
          <a href="#/" className="mt-8 hidden items-center gap-2 px-3 text-xs font-semibold text-[#746b61] hover:text-[#8c3f30] lg:flex"><ArrowLeft className="h-4 w-4" />返回前台</a>
        </aside>

        <main className="min-w-0 p-5 sm:p-8 lg:p-10">
          {(error || notice) && <div className={`mb-5 border-l-2 px-4 py-3 text-sm ${error ? 'border-red-600 bg-red-50 text-red-800' : 'border-emerald-700 bg-emerald-50 text-emerald-900'}`}>{error || notice}</div>}
          {loading && !data.overview && <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#9d4938]" /></div>}

          {activeTab === 'overview' && data.overview && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#bcb2a4] pb-5"><div><p className="text-xs uppercase tracking-[0.16em] text-[#8c3f30]">运行概览</p><h2 className="mt-2 font-serif text-4xl font-semibold">采集与服务状态</h2></div><p className="text-xs text-[#766e64]">检查于 {formatDate(overview.checkedAt)}</p></div>
              <div className="mt-7 grid border-y border-[#cfc5b7] sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['资讯总量', statistics.total || 0, `今日 +${statistics.today || 0}`],
                  ['数据源', sourceSummary.total || 0, `${sourceSummary.healthy || 0} 个健康`],
                  ['异常来源', sourceSummary.failing || 0, `${sourceSummary.inactive || 0} 个停用`],
                  ['内容模型', overview.agent?.enabled ? '已连接' : '未配置', overview.agent?.model || 'MiniMax-M2.5']
                ].map(([label, value, note]) => <div key={label} className="border-b border-[#cfc5b7] p-5 last:border-b-0 sm:nth-[2n]:border-l xl:border-b-0 xl:border-l first:border-l-0"><p className="text-xs font-semibold text-[#756d63]">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums text-[#26231f]">{value}</p><p className="mt-2 text-xs text-[#847b70]">{note}</p></div>)}
              </div>
              <div className="mt-8 grid gap-5 lg:grid-cols-3">
                <button type="button" onClick={() => runAction('刷新资讯', API_ENDPOINTS.ADMIN_REFRESH)} disabled={Boolean(action)} className="border border-[#c9c0b3] bg-white p-5 text-left transition hover:border-[#9d4938]"><RefreshCw className={`h-5 w-5 text-[#9d4938] ${action === '刷新资讯' ? 'animate-spin' : ''}`} /><h3 className="mt-4 font-semibold">立即刷新资讯</h3><p className="mt-2 text-xs leading-5 text-[#756d63]">运行一次完整新闻采集。</p></button>
                <button type="button" onClick={() => runAction('重置失败计数', API_ENDPOINTS.ADMIN_RESET_SOURCES)} disabled={Boolean(action)} className="border border-[#c9c0b3] bg-white p-5 text-left transition hover:border-[#9d4938]"><RotateCcw className="h-5 w-5 text-[#9d4938]" /><h3 className="mt-4 font-semibold">重置失败计数</h3><p className="mt-2 text-xs leading-5 text-[#756d63]">重新启用因连续失败而停用的来源。</p></button>
                <button type="button" onClick={() => runAction('恢复采集', API_ENDPOINTS.ADMIN_RECOVERY)} disabled={Boolean(action)} className="border border-[#c9c0b3] bg-white p-5 text-left transition hover:border-[#9d4938]"><Activity className="h-5 w-5 text-[#9d4938]" /><h3 className="mt-4 font-semibold">恢复采集</h3><p className="mt-2 text-xs leading-5 text-[#756d63]">清理运行期限制并重新采集。</p></button>
              </div>
            </div>
          )}

          {activeTab === 'sources' && (
            <div><div className="border-b border-[#bcb2a4] pb-5"><p className="text-xs uppercase tracking-[0.16em] text-[#8c3f30]">数据源</p><h2 className="mt-2 font-serif text-4xl font-semibold">采集来源</h2></div><div className="mt-6 overflow-x-auto border border-[#cfc5b7] bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#ece5da] text-xs text-[#625a51]"><tr><th className="px-4 py-3">来源</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">失败</th><th className="px-4 py-3">文章</th><th className="px-4 py-3">最后成功</th></tr></thead><tbody className="divide-y divide-[#e2dbd0]">{data.sources.map((source) => <tr key={source.name}><td className="px-4 py-3"><p className="font-semibold">{source.name}</p><p className="mt-1 max-w-sm truncate text-[11px] text-[#8a8176]">{source.url}</p></td><td className="px-4 py-3 text-[#6e665d]">{source.source_group_label}</td><td className="px-4 py-3"><span className={source.is_healthy ? 'text-emerald-700' : 'text-red-700'}>{source.is_healthy ? '健康' : source.is_active ? '异常' : '停用'}</span></td><td className="px-4 py-3 tabular-nums">{source.fail_count}</td><td className="px-4 py-3 tabular-nums">{source.article_count}</td><td className="px-4 py-3 text-xs text-[#756d63]">{formatDate(source.last_success)}</td></tr>)}</tbody></table></div></div>
          )}

          {activeTab === 'logs' && (
            <div><div className="border-b border-[#bcb2a4] pb-5"><p className="text-xs uppercase tracking-[0.16em] text-[#8c3f30]">最近 60 分钟</p><h2 className="mt-2 font-serif text-4xl font-semibold">请求日志</h2></div><div className="mt-6 overflow-x-auto border border-[#cfc5b7] bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#ece5da] text-xs text-[#625a51]"><tr><th className="px-4 py-3">来源</th><th className="px-4 py-3">请求</th><th className="px-4 py-3">成功</th><th className="px-4 py-3">平均响应</th></tr></thead><tbody className="divide-y divide-[#e2dbd0]">{data.logs.map((row) => <tr key={row.source_name}><td className="px-4 py-3 font-semibold">{row.source_name}</td><td className="px-4 py-3">{row.total_requests}</td><td className="px-4 py-3">{row.successful}</td><td className="px-4 py-3">{Math.round(Number(row.avg_response_time || 0))} ms</td></tr>)}</tbody></table>{!data.logs.length && <p className="p-8 text-center text-sm text-[#756d63]">最近一小时没有请求记录。</p>}</div></div>
          )}

          {activeTab === 'contacts' && (
            <div><div className="border-b border-[#bcb2a4] pb-5"><p className="text-xs uppercase tracking-[0.16em] text-[#8c3f30]">站点来信</p><h2 className="mt-2 font-serif text-4xl font-semibold">联系表单</h2></div><div className="mt-6 space-y-3">{data.contacts.map((contact) => <article key={contact.id} className="border border-[#cfc5b7] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-xs font-semibold text-[#8c3f30]">{contact.role}</span><span className="ml-3 text-xs text-[#7a7167]">{contact.delivery} · {contact.timeline}</span></div><time className="text-xs text-[#7a7167]">{formatDate(contact.created_at)}</time></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6">{contact.problem}</p><p className="mt-4 border-t border-[#e2dbd0] pt-3 text-xs text-[#665e55]">联系方式：{contact.contact_info}</p></article>)}{!data.contacts.length && <p className="border border-[#cfc5b7] bg-white p-8 text-center text-sm text-[#756d63]">目前没有联系表单。</p>}</div></div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;
