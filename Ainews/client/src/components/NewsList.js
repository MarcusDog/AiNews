import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  AlertCircle,
  Clock3,
  Heart,
  Loader2,
  Radio,
  RefreshCw,
  Share2,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { API_ENDPOINTS } from '../config/api';
import { useSocket, useSocketMessage } from '../contexts/SocketContext';
import { useUserData } from '../contexts/UserDataContext';
import {
  ITEMS_PER_PAGE,
  getCategoryLabel,
  hasNextPage,
  mergeNewsItems,
  shouldDebounceNewsRequest,
  selectLeadStory,
  selectDistinctSourceStories
} from '../utils/newsFeed';
import { hasUsableNewsImage } from '../utils/newsImage';

const CACHE_KEY = 'ainews_feed_v3';
const CACHE_DURATION = 5 * 60 * 1000;
const FETCH_DEBOUNCE = 600;

const categoryTone = {
  'AI新闻': 'text-[#355947] bg-[#edf3ef] border-[#bdd0c6]',
  'AI框架': 'text-[#49604f] bg-[#eef1eb] border-[#cbd3c8]',
  '新算法': 'text-[#665447] bg-[#f2ece5] border-[#d8c9bd]',
  '新思路': 'text-[#795a24] bg-[#f7f0df] border-[#dfd0aa]',
  '新工具': 'text-[#844536] bg-[#f6ebe7] border-[#dec1b8]'
};

const getTone = (category) => categoryTone[category] || 'text-[#625b52] bg-[#f0ece4] border-[#d4ccc0]';

const StoryImage = ({ item, className = '', priority = false }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [item?.imageUrl]);
  if (!hasUsableNewsImage(item) || failed) return null;

  return (
    <div className={`overflow-hidden bg-[#e9e4db] ${className}`}>
      <img
        src={item.imageUrl}
        alt=""
        className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
        loading={priority ? 'eager' : 'lazy'}
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const MetaLine = ({ item, formatTime, inverse = false }) => (
  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${inverse ? 'text-white/55' : 'text-slate-500'}`}>
    <span className="font-medium">{item.source}</span>
    {item.region === 'cn' && (
      <span className={inverse ? 'text-[#d7e4dc]' : 'text-[#466b59]'}>国内</span>
    )}
    {item.sourceGroupLabel && <span>{item.sourceGroupLabel}</span>}
    <span className="inline-flex items-center gap-1">
      <Clock3 className="h-3.5 w-3.5" />
      {formatTime(item.publishedAt)}
    </span>
  </div>
);

const StoryActions = ({ item, favorite, onFavorite, onShare, inverse = false }) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={(event) => onFavorite(item, event)}
      className={`rounded-full p-2 transition ${inverse ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-rose-600'}`}
      aria-label={favorite ? '取消收藏' : '收藏'}
      title={favorite ? '取消收藏' : '收藏'}
    >
      <Heart className={`h-4 w-4 ${favorite ? 'fill-current text-rose-500' : ''}`} />
    </button>
    <button
      type="button"
      onClick={(event) => onShare(item, event)}
      className={`rounded-full p-2 transition ${inverse ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-900'}`}
      aria-label="分享"
      title="分享"
    >
      <Share2 className="h-4 w-4" />
    </button>
  </div>
);

const LoadingState = () => (
  <div className="mx-auto max-w-[1480px] animate-pulse">
    <div className="mb-8 h-24 border-b border-slate-300/70" />
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,.7fr)]">
      <div className="aspect-[16/8.5] bg-slate-300/70" />
      <div className="space-y-7">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-3 border-b border-slate-300/70 pb-7">
            <div className="h-3 w-24 bg-slate-300" />
            <div className="h-6 w-full bg-slate-300/80" />
            <div className="h-6 w-3/4 bg-slate-300/80" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const NewsList = ({ category, refreshTrigger }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');

  const { isConnected } = useSocket();
  const { toggleFavorite, isFavorite, markAsRead, getReadIds } = useUserData();
  const readIds = useMemo(() => getReadIds(), [getReadIds]);

  const fetchingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(0);

  const getCachedNews = useCallback((cacheKey) => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}_${cacheKey}`);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return Date.now() - parsed.timestamp < CACHE_DURATION ? parsed.data : null;
    } catch {
      return null;
    }
  }, []);

  const setCachedNews = useCallback((cacheKey, data) => {
    try {
      localStorage.setItem(`${CACHE_KEY}_${cacheKey}`, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {
      // 本地缓存不可用时继续使用网络结果。
    }
  }, []);

  const applyPayload = useCallback((payload, pageNumber, replace = false) => {
    const items = Array.isArray(payload.data) ? payload.data : [];
    const itemTotal = Number(payload.total) || 0;
    setNews((current) => replace || pageNumber === 1
      ? mergeNewsItems([], items)
      : mergeNewsItems(current, items));
    setTotal(itemTotal);
    setHasMore(hasNextPage({ page: pageNumber, pageSize: ITEMS_PER_PAGE, total: itemTotal }));
    setSyncing(Boolean(payload.syncing));
    setLastUpdate(new Date());
  }, []);

  const fetchNews = useCallback(async (pageNumber = 1, force = false) => {
    const now = Date.now();
    if (shouldDebounceNewsRequest({
      page: pageNumber,
      force,
      elapsed: now - lastFetchRef.current,
      threshold: FETCH_DEBOUNCE
    })) return;
    if (fetchingRef.current && !force) return;

    if (force && abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    abortControllerRef.current = controller;
    fetchingRef.current = true;
    lastFetchRef.current = now;

    const cacheKey = `${category}_${pageNumber}`;
    let hasCachedPayload = false;
    if (!force && pageNumber === 1) {
      const cached = getCachedNews(cacheKey);
      if (cached) {
        applyPayload(cached, pageNumber, true);
        setLoading(false);
        hasCachedPayload = true;
      }
    }

    if (pageNumber === 1 && !hasCachedPayload) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(pageNumber),
        limit: String(ITEMS_PER_PAGE)
      });
      if (category && category !== '全部') params.set('category', category);

      const response = await fetch(`${API_ENDPOINTS.NEWS_LATEST}?${params}`, {
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? '刷新过于频繁，请稍后再试' : `内容服务暂时不可用（${response.status}）`);
      }

      const result = await response.json();
      if (!result.success || !result.data) throw new Error(result.error || '返回的数据格式不正确');
      if (!mountedRef.current || requestId !== activeRequestRef.current) return;

      setCachedNews(cacheKey, result.data);
      applyPayload(result.data, pageNumber, force || pageNumber === 1);
      setPage(pageNumber);
    } catch (fetchError) {
      if (fetchError.name === 'AbortError' || !mountedRef.current || requestId !== activeRequestRef.current) return;
      const cached = getCachedNews(`${category}_1`);
      if (cached && pageNumber === 1) {
        applyPayload(cached, 1, true);
        setNotice('网络波动，当前显示最近一次缓存内容');
      } else {
        setError(fetchError.message);
      }
    } finally {
      if (mountedRef.current && requestId === activeRequestRef.current) {
        setLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
      }
    }
  }, [applyPayload, category, getCachedNews, setCachedNews]);

  useEffect(() => {
    mountedRef.current = true;
    setNews([]);
    setPage(1);
    setNotice('');
    fetchNews(1, false);

    return () => {
      mountedRef.current = false;
      activeRequestRef.current += 1;
      abortControllerRef.current?.abort();
      fetchingRef.current = false;
    };
  }, [category, fetchNews]);

  useEffect(() => {
    if (refreshTrigger > 0) fetchNews(1, true);
  }, [refreshTrigger, fetchNews]);

  useSocketMessage('news-update', useCallback((message) => {
    if (message?.type === 'update-complete') fetchNews(1, true);
  }, [fetchNews]));

  const formatTime = useCallback((dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '时间待确认';
    return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
  }, []);

  const handleRefresh = useCallback(() => {
    fetchNews(1, true);
  }, [fetchNews]);

  const handleFavorite = useCallback((item, event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(item);
  }, [toggleFavorite]);

  const handleShare = useCallback(async (item, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, text: item.description, url: item.url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(item.url);
        setNotice('链接已复制');
      }
    } catch {
      // 用户取消系统分享面板时不显示错误。
    }
  }, []);

  const openStory = useCallback((item) => markAsRead(item.id), [markAsRead]);

  const leadStory = useMemo(() => selectLeadStory(news), [news]);
  const supportingStories = useMemo(
    () => selectDistinctSourceStories(news, { excludeId: leadStory?.id, limit: 3 }),
    [leadStory, news]
  );
  const streamStories = useMemo(() => {
    const supportingIds = new Set(supportingStories.map((item) => item.id));
    return news.filter((item) => item.id !== leadStory?.id && !supportingIds.has(item.id));
  }, [leadStory, news, supportingStories]);
  const leadHasImage = hasUsableNewsImage(leadStory);

  if (loading && news.length === 0) return <LoadingState />;

  if (error && news.length === 0) {
    return (
      <div className="mx-auto flex min-h-[62vh] max-w-xl flex-col items-center justify-center text-center">
        <AlertCircle className="mb-5 h-10 w-10 text-rose-600" />
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Feed interrupted</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950">资讯流暂时中断</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-7 inline-flex items-center gap-2 bg-[#7d4436] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#65372d]"
        >
          <RefreshCw className="h-4 w-4" />
          重新连接
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px] pb-16">
      <section className="editorial-enter border-b border-slate-300/80 pb-7 pt-2">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <span>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span>
              <span className="h-px w-8 bg-slate-400" />
              <span className={isConnected ? 'text-emerald-700' : 'text-amber-700'}>
                {isConnected ? 'Live signal' : 'Polling mode'}
              </span>
            </div>
            <h1 className="text-[clamp(2.4rem,6vw,5.8rem)] font-black leading-[0.87] tracking-[-0.065em] text-slate-950">
              {category === '全部' ? '今日 AI 信号' : getCategoryLabel(category)}
            </h1>
          </div>
          <div className="flex items-center gap-5 md:pb-1">
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Indexed stories</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{total.toLocaleString('zh-CN')}</p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#a69d91] text-[#615b53] transition hover:border-[#7d4436] hover:bg-[#7d4436] hover:text-white disabled:opacity-50"
              aria-label="刷新资讯"
              title="刷新资讯"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {(notice || syncing) && (
        <div className="mt-5 flex items-center justify-between gap-4 border-l-2 border-[#7d4436] bg-[#f4ece6] px-4 py-3 text-sm text-[#5f3d35]">
          <span>{notice || '真实新闻源正在进行首次同步，稍后会自动出现内容。'}</span>
          {syncing && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
        </div>
      )}

      {leadStory && (
        <section className="mt-8 grid border-b border-slate-300/80 pb-9 lg:grid-cols-[minmax(0,1.62fr)_minmax(320px,.72fr)] lg:gap-10">
          <article className="group overflow-hidden border-y border-[#bdb5aa] bg-[#fbfaf6]">
            {leadHasImage && <StoryImage item={leadStory} className="aspect-[16/8.5] border-b border-[#d2cbc0]" priority />}
            <div className="p-6 sm:p-9 lg:p-12">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${getTone(leadStory.category)}`}>
                  {getCategoryLabel(leadStory.category)}
                </span>
                {readIds.has(leadStory.id) && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Check className="h-3.5 w-3.5" />已读</span>
                )}
              </div>
              <h2 className="max-w-5xl text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-slate-950 sm:text-5xl lg:text-6xl">
                <a href={leadStory.url} target="_blank" rel="noopener noreferrer" onClick={() => openStory(leadStory)}>
                  {leadStory.title}
                </a>
              </h2>
              {leadStory.description && (
                <p className="mt-4 max-w-3xl line-clamp-2 text-sm leading-6 text-slate-600 sm:text-base">{leadStory.description}</p>
              )}
              <div className="mt-6 flex items-end justify-between gap-4">
                <MetaLine item={leadStory} formatTime={formatTime} />
                <StoryActions
                  item={leadStory}
                  favorite={isFavorite(leadStory.id)}
                  onFavorite={handleFavorite}
                  onShare={handleShare}
                />
              </div>
            </div>
          </article>

          <div className="mt-7 lg:mt-0">
            <div className="mb-2 flex items-center justify-between border-b border-slate-950 pb-3">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-950">此刻要闻</h2>
              <Radio className="h-4 w-4 text-rose-600" />
            </div>
            {supportingStories.map((item, index) => (
              <article key={item.id} className="group border-b border-slate-300/80 py-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    0{index + 1} / {getCategoryLabel(item.category)}
                  </span>
                  <StoryActions
                    item={item}
                    favorite={isFavorite(item.id)}
                    onFavorite={handleFavorite}
                    onShare={handleShare}
                  />
                </div>
                <h3 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950 transition group-hover:text-[#7d4436]">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => openStory(item)}>
                    {item.title}
                  </a>
                </h3>
                <div className="mt-4"><MetaLine item={item} formatTime={formatTime} /></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {streamStories.length > 0 && (
        <section className="mt-10">
          <div className="mb-1 flex items-end justify-between border-b border-slate-950 pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Continuing coverage</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">持续追踪</h2>
            </div>
            {lastUpdate && <span className="hidden text-xs text-slate-500 sm:block">页面更新于 {formatTime(lastUpdate)}</span>}
          </div>

          <div className="grid lg:grid-cols-2 lg:gap-x-10">
            {streamStories.map((item) => (
              <article key={item.id} className={`group grid gap-5 border-b border-slate-300/80 py-7 ${hasUsableNewsImage(item) ? 'grid-cols-[minmax(0,1fr)_112px] sm:grid-cols-[minmax(0,1fr)_170px]' : 'grid-cols-1'} ${readIds.has(item.id) ? 'opacity-65' : ''}`}>
                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {getCategoryLabel(item.category)} {item.region === 'cn' ? '/ 国内' : ''}
                    </span>
                    <StoryActions
                      item={item}
                      favorite={isFavorite(item.id)}
                      onFavorite={handleFavorite}
                      onShare={handleShare}
                    />
                  </div>
                  <h3 className="text-lg font-semibold leading-snug tracking-[-0.02em] text-slate-950 transition group-hover:text-[#7d4436] sm:text-xl">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => openStory(item)}>
                      {item.title}
                    </a>
                  </h3>
                  {item.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.description}</p>}
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <MetaLine item={item} formatTime={formatTime} />
                    <ArrowUpRight className="h-4 w-4 flex-none text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#7d4436]" />
                  </div>
                </div>
                {hasUsableNewsImage(item) && <StoryImage item={item} className="aspect-[4/3] self-center" />}
              </article>
            ))}
          </div>
        </section>
      )}

      {news.length === 0 && !loading && !error && (
        <div className="flex min-h-[46vh] flex-col items-center justify-center text-center">
          <Sparkles className="h-8 w-8 text-[#7d4436]" />
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {syncing ? '正在建立今日资讯索引' : '这个分类暂时没有内容'}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
            {syncing ? '系统只展示真实来源内容，首次同步完成后会自动更新。' : '切换分类或稍后刷新，新的报道会出现在这里。'}
          </p>
        </div>
      )}

      {news.length > 0 && (
        <div className="mt-12 flex flex-col items-center border-t border-slate-300/80 pt-8">
          {hasMore ? (
            <button
              type="button"
              onClick={() => fetchNews(page + 1, false)}
              disabled={loadingMore}
              className="inline-flex min-w-44 items-center justify-center gap-2 border border-[#7d4436] px-6 py-3 text-sm font-semibold text-[#7d4436] transition hover:bg-[#7d4436] hover:text-white disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {loadingMore ? '读取中' : '加载更多报道'}
            </button>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">End of current signal · {total} stories</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
            {isConnected ? <Wifi className="h-3.5 w-3.5 text-emerald-700" /> : <WifiOff className="h-3.5 w-3.5 text-amber-700" />}
            {isConnected ? '实时更新已连接' : '使用定时轮询更新'}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsList;
