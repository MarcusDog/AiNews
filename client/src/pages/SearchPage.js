import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  Filter, 
  X, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  Trash2,
  Calendar,
  Tag,
  Globe,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

// 搜索历史存储键
const SEARCH_HISTORY_KEY = 'ainews-search-history';
const MAX_HISTORY_ITEMS = 10;

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  
  // 高级筛选状态
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    source: '',
    startDate: '',
    endDate: '',
    sortBy: 'publishedAt',
    sortOrder: 'desc'
  });
  
  // 数据源
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const limit = 15;

// 加载分类和来源的回调函数
  const loadFilterOptions = useCallback(async () => {
    try {
      const [catRes, srcRes] = await Promise.all([
        fetch('/api/news/categories'),
        fetch('/api/news/sources')
      ]);

      const catData = await catRes.json();
      const srcData = await srcRes.json();

      if (catData.success) {
        setCategories(catData.data || []);
      }
      if (srcData.success) {
        setSources(srcData.data || []);
      }
    } catch (err) {
      console.error('加载筛选选项失败:', err);
    }
  }, []);

  // 页面挂载和切换时自动加载筛选选项
  useRefreshOnVisible(() => {
    loadFilterOptions();
    loadSearchHistory();
  }, []);

  // 加载搜索历史
  const loadSearchHistory = () => {
    try {
      const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (saved) {
        setSearchHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error('加载搜索历史失败:', err);
    }
  };

  // 保存搜索历史
  const saveToHistory = (searchQuery) => {
    if (!searchQuery.trim()) return;
    
    try {
      let history = [...searchHistory];
      // 移除重复项
      history = history.filter(item => item.query !== searchQuery);
      // 添加到开头
      history.unshift({
        query: searchQuery,
        timestamp: Date.now(),
        filters: { ...filters }
      });
      // 限制数量
      history = history.slice(0, MAX_HISTORY_ITEMS);
      
      setSearchHistory(history);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('保存搜索历史失败:', err);
    }
  };

  // 清除搜索历史
  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setShowHistory(false);
  };

  // 删除单条历史
  const removeHistoryItem = (index) => {
    const newHistory = searchHistory.filter((_, i) => i !== index);
    setSearchHistory(newHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };

  // 执行搜索
  const performSearch = useCallback(async (searchQuery, pageNum = 1, appendResults = false) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        q: searchQuery,
        page: pageNum.toString(),
        limit: limit.toString()
      });
      
      // 添加筛选参数
      if (filters.category) params.append('category', filters.category);
      if (filters.source) params.append('source', filters.source);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

      const response = await fetch(`/api/news/search?${params}`);
      const data = await response.json();

      if (data.success) {
        const newResults = data.data.data || [];
        const total = data.data.total || 0;
        
        if (appendResults) {
          setResults(prev => [...prev, ...newResults]);
        } else {
          setResults(newResults);
        }
        
        setTotalResults(total);
        setHasMore(newResults.length === limit && (pageNum * limit) < total);
        setPage(pageNum);
        
        // 保存到历史（仅首次搜索）
        if (!appendResults) {
          saveToHistory(searchQuery);
        }
      } else {
        throw new Error(data.error || '搜索失败');
      }
    } catch (err) {
      console.error('搜索失败:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setHasSearched(true);
      setShowHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // 处理搜索提交
  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query.trim() });
      setPage(1);
      performSearch(query.trim(), 1);
    }
  };

  // 加载更多
  const loadMore = () => {
    if (!loading && hasMore) {
      performSearch(query, page + 1, true);
    }
  };

  // 使用历史记录搜索
  const applyHistoryItem = (item) => {
    setQuery(item.query);
    if (item.filters) {
      setFilters(item.filters);
    }
    setSearchParams({ q: item.query });
    performSearch(item.query, 1);
  };

  // 监听URL参数变化
  useEffect(() => {
    const queryParam = searchParams.get('q');
    if (queryParam && queryParam !== query) {
      setQuery(queryParam);
      performSearch(queryParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 重置筛选
  const resetFilters = () => {
    setFilters({
      category: '',
      source: '',
      startDate: '',
      endDate: '',
      sortBy: 'publishedAt',
      sortOrder: 'desc'
    });
  };

  // 应用筛选
  const applyFilters = () => {
    if (query.trim()) {
      setPage(1);
      performSearch(query.trim(), 1);
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      'AI新闻': 'bg-blue-100 text-blue-700',
      'AI框架': 'bg-green-100 text-green-700',
      '新算法': 'bg-purple-100 text-purple-700',
      '新思路': 'bg-yellow-100 text-yellow-700',
      '新工具': 'bg-pink-100 text-pink-700',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text;
    
    try {
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      
      return parts.map((part, index) => 
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 px-0.5 rounded">
            {part}
          </mark>
        ) : part
      );
    } catch (e) {
      return text;
    }
  };

  // 获取活跃筛选数量
  const activeFiltersCount = [
    filters.category,
    filters.source,
    filters.startDate,
    filters.endDate
  ].filter(Boolean).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">搜索AI资讯</h1>
        <p className="text-gray-600">搜索AI相关的新闻、算法、框架、工具和思路</p>
      </div>

      {/* 搜索表单 */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="输入关键词搜索AI资讯..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
            className="w-full pl-10 pr-24 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-lg"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-md transition-colors relative ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title="高级筛选"
            >
              <Filter className="w-5 h-5" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '搜索'
              )}
            </button>
          </div>
          
          {/* 搜索历史下拉 */}
          {showHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-20 max-h-80 overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700 flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  搜索历史
                </span>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs text-gray-500 hover:text-red-600 flex items-center"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  清除
                </button>
              </div>
              {searchHistory.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 cursor-pointer group"
                >
                  <div 
                    className="flex-1 flex items-center"
                    onClick={() => applyHistoryItem(item)}
                  >
                    <Search className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-gray-700">{item.query}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: zhCN })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeHistoryItem(index);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* 高级筛选面板 */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              高级筛选
            </h3>
            <button
              onClick={() => setShowFilters(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 分类筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Tag className="w-4 h-4 mr-1" />
                分类
              </label>
              <select
                value={filters.category}
                onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">全部分类</option>
                {categories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
            </div>
            
            {/* 来源筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Globe className="w-4 h-4 mr-1" />
                来源
              </label>
              <select
                value={filters.source}
                onChange={(e) => setFilters(prev => ({ ...prev, source: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">全部来源</option>
                {sources.map((src) => (
                  <option key={src.name} value={src.name}>
                    {src.name} ({src.count})
                  </option>
                ))}
              </select>
            </div>
            
            {/* 排序 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                {filters.sortOrder === 'desc' ? (
                  <SortDesc className="w-4 h-4 mr-1" />
                ) : (
                  <SortAsc className="w-4 h-4 mr-1" />
                )}
                排序
              </label>
              <div className="flex space-x-2">
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="publishedAt">发布时间</option>
                  <option value="title">标题</option>
                </select>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ 
                    ...prev, 
                    sortOrder: prev.sortOrder === 'desc' ? 'asc' : 'desc' 
                  }))}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  {filters.sortOrder === 'desc' ? (
                    <SortDesc className="w-4 h-4" />
                  ) : (
                    <SortAsc className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            
            {/* 开始日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                开始日期
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* 结束日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                结束日期
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* 筛选操作按钮 */}
          <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
            >
              重置
            </button>
            <button
              type="button"
              onClick={applyFilters}
              disabled={!query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              应用筛选
            </button>
          </div>
        </div>
      )}

      {/* 搜索结果统计 */}
      {hasSearched && !loading && !error && (
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {totalResults > 0 ? (
              <>
                找到 <span className="font-semibold text-gray-900">{totalResults}</span> 条与 
                "<span className="font-semibold text-blue-600">{query}</span>" 相关的结果
              </>
            ) : (
              <>未找到与 "<span className="font-semibold">{query}</span>" 相关的结果</>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
            >
              <X className="w-3 h-3 mr-1" />
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* 加载状态 */}
      {loading && !results.length && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">搜索中...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">搜索失败</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => performSearch(query)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 搜索结果列表 */}
      {!error && results.length > 0 && (
        <div className="space-y-4">
          {results.map((item) => (
            <article
              key={item.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start space-x-4">
                {/* 图片 */}
                {item.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-24 h-24 object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  {/* 标题 */}
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 transition-colors"
                    >
                      {highlightText(item.title, query)}
                    </a>
                  </h3>

                  {/* 描述 */}
                  {item.description && (
                    <p className="text-gray-600 mb-3 line-clamp-2 text-sm">
                      {highlightText(item.description, query)}
                    </p>
                  )}

                  {/* 元信息 */}
                  <div className="flex items-center flex-wrap gap-3 text-sm text-gray-500">
                    <span className="flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {formatDistanceToNow(new Date(item.publishedAt), { 
                        addSuffix: true, 
                        locale: zhCN 
                      })}
                    </span>
                    
                    <span className="flex items-center">
                      <Globe className="w-3.5 h-3.5 mr-1" />
                      {item.source}
                    </span>
                    
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(item.category)}`}>
                      {item.category}
                    </span>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-blue-600 hover:text-blue-700 transition-colors flex items-center"
                    >
                      阅读原文
                      <ChevronUp className="w-4 h-4 ml-1 rotate-90" />
                    </a>
                  </div>
                </div>
              </div>
            </article>
          ))}
          
          {/* 加载更多 */}
          {hasMore && (
            <div className="text-center py-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="inline-flex items-center px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    加载中...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    加载更多
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && hasSearched && results.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">未找到相关结果</h3>
          <p className="text-gray-600 mb-4">
            试试使用不同的关键词，或调整筛选条件
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-blue-600 hover:text-blue-700 mb-4"
            >
              清除筛选条件
            </button>
          )}
          <div className="text-sm text-gray-500 mt-4">
            搜索建议：
            <ul className="mt-2 space-y-1">
              <li>- 使用更通用的关键词，如"AI"、"机器学习"</li>
              <li>- 尝试使用英文关键词</li>
              <li>- 检查拼写是否正确</li>
              <li>- 减少筛选条件</li>
            </ul>
          </div>
        </div>
      )}

      {/* 搜索提示（未搜索状态） */}
      {!hasSearched && (
        <div className="space-y-6">
          {/* 热门搜索 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">热门搜索</h3>
            <div className="flex flex-wrap gap-2">
              {['ChatGPT', 'GPT-4', 'LLM', 'Transformer', 'PyTorch', '机器学习', '神经网络', 'AI Agent'].map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term);
                    setSearchParams({ q: term });
                    performSearch(term);
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors text-sm"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
          
          {/* 搜索提示 */}
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-medium text-blue-900 mb-2">搜索提示</h3>
            <p className="text-blue-700 mb-4">
              您可以搜索以下类型的AI相关内容：
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="text-blue-600">- ChatGPT、GPT-4</div>
              <div className="text-blue-600">- PyTorch、TensorFlow</div>
              <div className="text-blue-600">- 神经网络、深度学习</div>
              <div className="text-blue-600">- 计算机视觉、NLP</div>
              <div className="text-blue-600">- 大语言模型</div>
              <div className="text-blue-600">- AI工具、框架</div>
            </div>
          </div>

          {/* 搜索历史 */}
          {searchHistory.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  最近搜索
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-sm text-gray-500 hover:text-red-600"
                >
                  清除历史
                </button>
              </div>
              <div className="space-y-2">
                {searchHistory.slice(0, 5).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => applyHistoryItem(item)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between group"
                  >
                    <span className="text-gray-700">{item.query}</span>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: zhCN })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
