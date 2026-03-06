import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Clock, 
  ExternalLink, 
  Loader2, 
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
  Zap,
  Share2,
  Heart,
  Check
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useSocket, useSocketMessage } from '../contexts/SocketContext';
import { useUserData } from '../contexts/UserDataContext';

// 缓存配置
const CACHE_KEY = 'ainews_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟
const FETCH_DEBOUNCE = 1000; // 1秒防抖
const ITEMS_PER_PAGE = 1000; // 显示全部内容（一次性加载1000条）

// 骨架屏组件
const SkeletonCard = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
    <div className="h-40 bg-gray-200" />
    <div className="p-5 space-y-3">
      <div className="h-4 bg-gray-200 rounded w-1/4" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
      <div className="pt-4 border-t border-gray-50 flex justify-between">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-200 rounded w-16" />
      </div>
    </div>
  </div>
);

// 骨架屏网格
const SkeletonGrid = ({ count = 8 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

const NewsList = ({ category, refreshTrigger }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  
  // WebSocket
  const { isConnected, requestRefresh } = useSocket();
  
  // 用户数据
  const { toggleFavorite, isFavorite, markAsRead, getReadIds } = useUserData();
  const readIds = useMemo(() => getReadIds(), [getReadIds]);
  
  // 防止重复请求
  const fetchingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const lastFetchRef = useRef(0);
  const mountedRef = useRef(true);
  
  // 无限滚动相关
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  // 从localStorage读取缓存
  const getCachedNews = useCallback((cacheKey) => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}_${cacheKey}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (e) {
      console.warn('读取缓存失败:', e);
    }
    return null;
  }, []);

  // 保存到localStorage
  const setCachedNews = useCallback((cacheKey, data) => {
    try {
      localStorage.setItem(`${CACHE_KEY}_${cacheKey}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('保存缓存失败:', e);
    }
  }, []);

  // 获取新闻
  const fetchNews = useCallback(async (pageNum = 1, isRefresh = false) => {
    // 防抖检查
    const now = Date.now();
    if (!isRefresh && now - lastFetchRef.current < FETCH_DEBOUNCE) {
      return;
    }
    
    // 防止重复请求
    if (fetchingRef.current && !isRefresh) {
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchingRef.current = true;
    lastFetchRef.current = now;

    try {
      // 非强制刷新时检查缓存
      const cacheKey = `${category}_${pageNum}`;
      if (!isRefresh && pageNum === 1) {
        const cached = getCachedNews(cacheKey);
        if (cached) {
          if (mountedRef.current) {
            setNews(cached.data || []);
            setTotal(cached.total || 0);
            setHasMore((cached.data?.length || 0) >= ITEMS_PER_PAGE);
            setIsDemo(cached.isDemo || false);
            setLoading(false);
          }
          fetchingRef.current = false;
          return;
        }
      }

      if (mountedRef.current) {
        if (pageNum === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
      }

      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: ITEMS_PER_PAGE.toString()
      });

      if (category && category !== '全部') {
        params.append('category', category);
      }

      const response = await fetch(`/api/news/latest?${params}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!mountedRef.current) return;

      if (result.success && result.data) {
        const newsData = result.data.data || [];
        const totalCount = result.data.total || 0;
        const isFromDemo = result.data.isDemo || false;
        
        // 缓存数据
        setCachedNews(cacheKey, {
          data: newsData,
          total: totalCount,
          isDemo: isFromDemo
        });
        
        if (isRefresh || pageNum === 1) {
          setNews(newsData);
        } else {
          setNews(prev => {
            // 去重
            const existingIds = new Set(prev.map(n => n.id));
            const newItems = newsData.filter(n => !existingIds.has(n.id));
            return [...prev, ...newItems];
          });
        }
        
        setTotal(totalCount);
        setHasMore(newsData.length >= ITEMS_PER_PAGE);
        setIsDemo(isFromDemo);
        setLastUpdate(new Date());
      } else {
        throw new Error(result.error || '获取新闻失败');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      
      console.error('获取新闻失败:', err);
      
      if (mountedRef.current) {
        setError(err.message);
        
        // 尝试从缓存恢复
        const cached = getCachedNews(`${category}_1`);
        if (cached && news.length === 0) {
          setNews(cached.data || []);
          setTotal(cached.total || 0);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      fetchingRef.current = false;
    }
  }, [category, getCachedNews, setCachedNews, news.length]);

  // 初始加载
  useEffect(() => {
    mountedRef.current = true;
    setPage(1);
    setNews([]);
    fetchNews(1, false);
    
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // 刷新触发
  useEffect(() => {
    if (refreshTrigger > 0) {
      setPage(1);
      fetchNews(1, true);
    }
  }, [refreshTrigger, fetchNews]);

  // WebSocket新闻更新监听
  useSocketMessage('news-update', useCallback((data) => {
    if (data?.type === 'update-complete' && data?.data?.totalSaved > 0) {
      setTimeout(() => {
        fetchNews(1, true);
      }, 2000);
    }
  }, [fetchNews]));

  // 无限滚动 - Intersection Observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading && !loadingMore && !fetchingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchNews(nextPage, false);
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
      }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadingMore, page, fetchNews]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    if (isConnected) {
      requestRefresh();
    }
    setPage(1);
    setNews([]);
    fetchNews(1, true);
  }, [isConnected, requestRefresh, fetchNews]);

  // 分类颜色
  const getCategoryColor = useMemo(() => (cat) => {
    const colors = {
      'AI新闻': 'bg-blue-100 text-blue-700 border-blue-200',
      'AI框架': 'bg-green-100 text-green-700 border-green-200',
      '新算法': 'bg-purple-100 text-purple-700 border-purple-200',
      '新思路': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      '新工具': 'bg-pink-100 text-pink-700 border-pink-200',
      '全部': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[cat] || 'bg-gray-100 text-gray-700 border-gray-200';
  }, []);

  // 格式化时间
  const formatTime = useCallback((dateStr) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { 
        addSuffix: true, 
        locale: zhCN 
      });
    } catch {
      return '未知时间';
    }
  }, []);

  // 分享功能
  const handleShare = useCallback((item) => {
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: item.description,
        url: item.url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(item.url).then(() => {
        alert('链接已复制到剪贴板');
      }).catch(() => {});
    }
  }, []);

  // 收藏功能
  const handleFavorite = useCallback((item, e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(item);
  }, [toggleFavorite]);

  // 点击阅读
  const handleRead = useCallback((item) => {
    markAsRead(item.id);
  }, [markAsRead]);

  // 初始加载状态 - 显示骨架屏
  if (loading && news.length === 0) {
    return (
      <div className="space-y-6">
        {/* 标题区域骨架 */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-32 animate-pulse" />
          </div>
          <div className="flex items-center space-x-3">
            <div className="h-8 bg-gray-200 rounded w-20 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-24 animate-pulse" />
          </div>
        </div>
        
        {/* 连接状态 */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-full">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 mr-2 text-green-500" />
                <span>实时连接已建立，正在加载资讯...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 mr-2 text-gray-400" />
                <span>正在连接...</span>
              </>
            )}
          </div>
        </div>
        
        {/* 骨架屏网格 */}
        <SkeletonGrid count={8} />
      </div>
    );
  }

  // 错误状态
  if (error && news.length === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-gray-900 mb-2">数据源连接中</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          {error.includes('429') ? (
            '请求过于频繁，系统正在限流保护中。请稍候...'
          ) : error.includes('INTERNET') ? (
            '网络连接异常，请检查网络设置'
          ) : (
            error
          )}
        </p>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          重新连接
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="space-y-4">
        {/* 演示模式提示 */}
        {isDemo && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800">演示模式</h3>
                <p className="text-sm text-yellow-700">正在连接真实RSS源，当前显示示例数据</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center space-x-1.5 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>刷新</span>
              </button>
            </div>
          </div>
        )}

        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {category === '全部' ? '最新AI资讯' : `${category}`}
              </h2>
              {isConnected && (
                <span className="flex items-center px-2 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium">
                  <Zap className="w-3 h-3 mr-1" />
                  实时
                </span>
              )}
            </div>
            {lastUpdate && (
              <p className="text-sm text-gray-500 mt-1">
                更新于 {formatTime(lastUpdate)}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${getCategoryColor(category)}`}>
              {category}
            </span>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              共 {total} 条
            </span>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 新闻网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {news.map((item) => {
          const itemIsRead = readIds.has(item.id);
          const itemIsFavorite = isFavorite(item.id);
          
          return (
          <article
            key={item.id}
            className={`group bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg hover:border-blue-100 transition-all duration-300 flex flex-col ${
              itemIsRead ? 'border-gray-50 opacity-80' : 'border-gray-100'
            }`}
          >
            {/* 图片区域 */}
            {item.imageUrl && (
              <div className="relative h-40 overflow-hidden bg-gray-100">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="absolute top-3 left-3 flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium shadow-sm ${getCategoryColor(item.category)}`}>
                    {item.category}
                  </span>
                  {itemIsRead && (
                    <span className="flex items-center px-1.5 py-1 bg-gray-900/70 text-white rounded-md text-xs">
                      <Check className="w-3 h-3 mr-0.5" />
                      已读
                    </span>
                  )}
                </div>
                {/* 快捷操作按钮 */}
                <div className="absolute top-3 right-3 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleShare(item)}
                    className="p-1.5 bg-white/90 rounded-lg hover:bg-white shadow-sm"
                    title="分享"
                  >
                    <Share2 className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={(e) => handleFavorite(item, e)}
                    className={`p-1.5 rounded-lg shadow-sm transition-colors ${
                      itemIsFavorite 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-white/90 hover:bg-white'
                    }`}
                    title={itemIsFavorite ? '取消收藏' : '收藏'}
                  >
                    <Heart className={`w-4 h-4 ${itemIsFavorite ? 'text-white fill-current' : 'text-gray-600'}`} />
                  </button>
                </div>
              </div>
            )}
            
            {/* 内容区域 */}
            <div className="flex-1 p-5 flex flex-col">
              {/* 无图片时显示分类标签 */}
              {!item.imageUrl && (
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium border ${getCategoryColor(item.category)}`}>
                      {item.category}
                    </span>
                    {itemIsRead && (
                      <span className="flex items-center text-xs text-gray-400">
                        <Check className="w-3 h-3 mr-0.5" />
                        已读
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleShare(item)}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="分享"
                    >
                      <Share2 className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => handleFavorite(item, e)}
                      className={`p-1 rounded transition-colors ${
                        itemIsFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                      }`}
                      title={itemIsFavorite ? '取消收藏' : '收藏'}
                    >
                      <Heart className={`w-4 h-4 ${itemIsFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              )}
              
              {/* 标题 */}
              <h3 className={`text-base font-semibold mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors ${
                itemIsRead ? 'text-gray-600' : 'text-gray-900'
              }`}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleRead(item)}
                >
                  {item.title}
                </a>
              </h3>

              {/* 描述 */}
              {item.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-grow">
                  {item.description}
                </p>
              )}

              {/* 底部信息 */}
              <div className="mt-auto pt-4 border-t border-gray-50">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center text-gray-500">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    <span>{formatTime(item.publishedAt)}</span>
                  </div>
                  <span className="text-gray-400 text-xs truncate max-w-[100px]" title={item.source}>
                    {item.source}
                  </span>
                </div>
                
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleRead(item)}
                  className="mt-3 flex items-center justify-center w-full py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  阅读原文
                </a>
              </div>
            </div>
          </article>
          );
        })}
        
        {/* 加载更多时显示骨架屏 */}
        {loadingMore && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </div>

      {/* 无限滚动触发器 */}
      <div ref={loadMoreRef} className="h-10" />

      {/* 加载状态提示 */}
      {news.length > 0 && (
        <div className="text-center pt-4 pb-8">
          {loadingMore ? (
            <div className="flex items-center justify-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span>加载更多...</span>
            </div>
          ) : hasMore ? (
            <p className="text-gray-400 text-sm">向下滚动加载更多</p>
          ) : (
            <p className="text-gray-400 text-sm">- 已加载全部 {total} 条内容 -</p>
          )}
        </div>
      )}

      {/* 空状态 */}
      {news.length === 0 && !loading && !error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">正在获取资讯...</h3>
          <p className="text-gray-500">系统正在从多个数据源获取最新AI资讯</p>
        </div>
      )}
    </div>
  );
};

export default NewsList;
