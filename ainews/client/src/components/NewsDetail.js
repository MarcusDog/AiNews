import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  ExternalLink, 
  Clock, 
  User, 
  Loader2,
  AlertCircle,
  Heart,
  Share2,
  Bookmark,
  ChevronRight,
  Calendar,
  Eye,
  ThumbsUp,
  MessageSquare
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useUserData } from '../contexts/UserDataContext';

const NewsDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [news, setNews] = useState(null);
  const [relatedNews, setRelatedNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const { toggleFavorite, isFavorite, markAsRead } = useUserData();

  useEffect(() => {
    const fetchNewsDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/news/${id}`);
        const data = await response.json();

        if (data.success) {
          setNews(data.data);
          markAsRead(id);
          // 获取相关推荐
          fetchRelatedNews(data.data.category, id);
        } else {
          throw new Error(data.error || '获取新闻详情失败');
        }
      } catch (err) {
        console.error('获取新闻详情失败:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchNewsDetail();
    }
  }, [id, markAsRead]);

  const fetchRelatedNews = async (category, currentId) => {
    try {
      const response = await fetch(`/api/news/latest?category=${category}&limit=5`);
      const data = await response.json();
      
      if (data.success) {
        // 过滤掉当前文章
        const filtered = data.data.data.filter(item => item.id !== currentId).slice(0, 4);
        setRelatedNews(filtered);
      }
    } catch (error) {
      console.error('获取相关文章失败:', error);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: news?.title,
          text: news?.description,
          url: window.location.href,
        });
      } catch (err) {
        console.log('分享取消');
      }
    } else {
      // 复制链接到剪贴板
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('复制失败:', err);
      }
    }
  };

  const handleFavorite = () => {
    if (news) {
      toggleFavorite(news);
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      'AI新闻': 'bg-blue-100 text-blue-700 border-blue-200',
      'AI框架': 'bg-green-100 text-green-700 border-green-200',
      '新算法': 'bg-purple-100 text-purple-700 border-purple-200',
      '新思路': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      '新工具': 'bg-pink-100 text-pink-700 border-pink-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'AI新闻': '📰',
      'AI框架': '🛠️',
      '新算法': '🧮',
      '新思路': '💡',
      '新工具': '🔧',
    };
    return icons[category] || '📄';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-pulse" />
          </div>
        </div>
        <span className="mt-4 text-gray-600 font-medium">加载文章详情...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">加载失败</h3>
        <p className="text-gray-600 mb-6">{error}</p>
        <div className="flex items-center justify-center space-x-3">
          <Link
            to="/"
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!news) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">文章不存在</h3>
        <p className="text-gray-600 mb-6">您访问的文章可能已被删除或移动</p>
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回首页
        </Link>
      </div>
    );
  }

  const isNewsFavorite = isFavorite(news.id);

  return (
    <article className="max-w-5xl mx-auto">
      {/* 面包屑导航 */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:text-blue-600 transition-colors flex items-center">
          <span className="mr-1">🏠</span> 首页
        </Link>
        <ChevronRight className="w-4 h-4" />
        <button
          onClick={() => navigate(`/?category=${news.category}`)}
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(news.category)} hover:opacity-80 transition-opacity`}
        >
          {getCategoryIcon(news.category)} {news.category}
        </button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-400 truncate max-w-[200px]">文章详情</span>
      </nav>

      {/* 文章主体 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 文章头部 */}
        <div className="p-8 border-b border-gray-100">
          {/* 分类和来源 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${getCategoryColor(news.category)}`}>
                {getCategoryIcon(news.category)} {news.category}
              </span>
              <span className="flex items-center text-sm text-gray-500">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2" />
                {news.source}
              </span>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleShare}
                className="p-2.5 rounded-xl bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                title={copied ? '链接已复制!' : '分享'}
              >
                {copied ? (
                  <span className="text-green-600 text-xs font-medium">已复制!</span>
                ) : (
                  <Share2 className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={handleFavorite}
                className={`p-2.5 rounded-xl transition-all ${
                  isNewsFavorite
                    ? 'bg-red-50 text-red-500'
                    : 'bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500'
                }`}
                title={isNewsFavorite ? '取消收藏' : '收藏'}
              >
                <Heart className={`w-5 h-5 ${isNewsFavorite ? 'fill-current' : ''}`} />
              </button>
              <button
                className="p-2.5 rounded-xl bg-gray-50 text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-all"
                title="稍后阅读"
              >
                <Bookmark className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 标题 */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-tight">
            {news.title}
          </h1>

          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
              <Calendar className="w-4 h-4 mr-2 text-gray-400" />
              {format(new Date(news.publishedAt), 'yyyy年MM月dd日', { locale: zhCN })}
            </div>
            <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 mr-2 text-gray-400" />
              {format(new Date(news.publishedAt), 'HH:mm', { locale: zhCN })}
            </div>
            {news.author && (
              <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                <User className="w-4 h-4 mr-2 text-gray-400" />
                {news.author}
              </div>
            )}
            <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
              <Eye className="w-4 h-4 mr-2 text-gray-400" />
              刚刚阅读
            </div>
          </div>
        </div>

        {/* 主图 */}
        {news.imageUrl && (
          <div className="relative">
            <img
              src={news.imageUrl}
              alt={news.title}
              className="w-full max-h-[500px] object-cover"
              onError={(e) => {
                e.target.parentElement.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </div>
        )}

        {/* 内容区域 */}
        <div className="p-8">
          {/* 描述/摘要 */}
          {news.description && (
            <div className="prose max-w-none mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500 p-6 rounded-r-xl">
                <p className="text-lg text-gray-700 leading-relaxed font-medium">
                  {news.description}
                </p>
              </div>
            </div>
          )}

          {/* 操作按钮区域 */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-100">
            <div className="flex items-center space-x-3">
              <a
                href={news.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                阅读原文
              </a>
              <button
                onClick={handleFavorite}
                className={`inline-flex items-center px-4 py-3 rounded-xl transition-all ${
                  isNewsFavorite
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600'
                }`}
              >
                <Heart className={`w-5 h-5 mr-2 ${isNewsFavorite ? 'fill-current' : ''}`} />
                {isNewsFavorite ? '已收藏' : '收藏'}
              </button>
            </div>

            {/* 互动统计 */}
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <button className="flex items-center space-x-1 hover:text-blue-600 transition-colors">
                <ThumbsUp className="w-4 h-4" />
                <span>有用</span>
              </button>
              <button className="flex items-center space-x-1 hover:text-blue-600 transition-colors">
                <MessageSquare className="w-4 h-4" />
                <span>评论</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 相关推荐 */}
      {relatedNews.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <span className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white text-sm">📌</span>
              </span>
              相关推荐
            </h2>
            <button
              onClick={() => navigate(`/?category=${news.category}`)}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
            >
              查看更多
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedNews.map((item) => (
              <Link
                key={item.id}
                to={`/news/${item.id}`}
                className="group bg-white rounded-xl border border-gray-100 p-4 hover:shadow-lg hover:border-blue-200 transition-all duration-300"
              >
                <div className="flex items-start space-x-4">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(item.category)}`}>
                        {item.category}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(item.publishedAt), { locale: zhCN, addSuffix: true })}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.source}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 底部导航 */}
      <div className="mt-8 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回列表
        </Link>
        
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          回到顶部 ↑
        </button>
      </div>
    </article>
  );
};

export default NewsDetail;
