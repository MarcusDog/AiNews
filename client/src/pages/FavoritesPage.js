import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Heart, 
  Trash2, 
  ExternalLink, 
  Clock, 
  Search,
  X,
  Globe,
  AlertCircle,
  SortDesc,
  SortAsc
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useUserData } from '../contexts/UserDataContext';

const FavoritesPage = () => {
  const { favorites, removeFavorite, clearFavorites } = useUserData();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('favoritedAt'); // favoritedAt, publishedAt, title
  const [sortOrder, setSortOrder] = useState('desc');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // 获取所有分类
  const categories = useMemo(() => {
    const cats = new Set(favorites.map(f => f.category).filter(Boolean));
    return Array.from(cats);
  }, [favorites]);

  // 筛选和排序
  const filteredFavorites = useMemo(() => {
    let result = [...favorites];
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f => 
        f.title?.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query) ||
        f.source?.toLowerCase().includes(query)
      );
    }
    
    // 分类筛选
    if (filterCategory) {
      result = result.filter(f => f.category === filterCategory);
    }
    
    // 排序
    result.sort((a, b) => {
      let valueA, valueB;
      
      if (sortBy === 'favoritedAt') {
        valueA = a.favoritedAt || 0;
        valueB = b.favoritedAt || 0;
      } else if (sortBy === 'publishedAt') {
        valueA = new Date(a.publishedAt).getTime();
        valueB = new Date(b.publishedAt).getTime();
      } else if (sortBy === 'title') {
        valueA = a.title || '';
        valueB = b.title || '';
        return sortOrder === 'asc' 
          ? valueA.localeCompare(valueB) 
          : valueB.localeCompare(valueA);
      }
      
      return sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
    });
    
    return result;
  }, [favorites, searchQuery, filterCategory, sortBy, sortOrder]);

  const getCategoryColor = (category) => {
    const colors = {
      'AI新闻': 'bg-[#edf3ef] text-[#355947]',
      'AI框架': 'bg-[#eef1eb] text-[#49604f]',
      '新算法': 'bg-[#f2ece5] text-[#665447]',
      '新思路': 'bg-[#f7f0df] text-[#795a24]',
      '新工具': 'bg-[#f6ebe7] text-[#844536]',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  const handleRemove = (newsId, event) => {
    event.preventDefault();
    event.stopPropagation();
    removeFavorite(newsId);
  };

  const handleClearAll = () => {
    clearFavorites();
    setShowConfirmClear(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <Heart className="w-8 h-8 mr-3 text-red-500" />
          我的收藏
        </h1>
        <p className="text-gray-600 mt-2">
          已收藏 {favorites.length} 篇资讯
        </p>
      </div>

      {favorites.length > 0 ? (
        <>
          {/* 搜索和筛选 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              {/* 搜索框 */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="搜索收藏..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* 分类筛选 */}
              <div className="w-40">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">全部分类</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              {/* 排序 */}
              <div className="flex items-center space-x-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="favoritedAt">收藏时间</option>
                  <option value="publishedAt">发布时间</option>
                  <option value="title">标题</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {sortOrder === 'desc' ? (
                    <SortDesc className="w-4 h-4" />
                  ) : (
                    <SortAsc className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {/* 清空按钮 */}
              <button
                onClick={() => setShowConfirmClear(true)}
                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                清空
              </button>
            </div>
          </div>

          {/* 确认清空弹窗 */}
          {showConfirmClear && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
                <div className="flex items-center text-red-600 mb-4">
                  <AlertCircle className="w-6 h-6 mr-2" />
                  <h3 className="text-lg font-semibold">确认清空收藏</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  确定要清空所有收藏吗？此操作无法撤销。
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    确认清空
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 收藏列表 */}
          {filteredFavorites.length > 0 ? (
            <div className="space-y-4">
              {filteredFavorites.map((item) => (
                <article
                  key={item.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start space-x-4">
                    {/* 图片 */}
                    {item.imageUrl && (
                      <div className="flex-shrink-0">
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-20 h-20 object-cover rounded-lg"
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
                          {item.title}
                        </a>
                      </h3>

                      {/* 描述 */}
                      {item.description && (
                        <p className="text-gray-600 mb-3 line-clamp-2 text-sm">
                          {item.description}
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
                        
                        <span className="flex items-center text-red-500">
                          <Heart className="w-3.5 h-3.5 mr-1 fill-current" />
                          {formatDistanceToNow(item.favoritedAt, { addSuffix: true, locale: zhCN })}收藏
                        </span>
                      </div>
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="打开链接"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={(e) => handleRemove(item.id, e)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="取消收藏"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">没有找到匹配的收藏</h3>
              <p className="text-gray-600">
                尝试调整搜索条件或筛选器
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16">
          <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">暂无收藏</h3>
          <p className="text-gray-600 mb-6">
            浏览资讯时点击收藏按钮，将感兴趣的内容保存到这里
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 bg-[#7d4436] text-white hover:bg-[#65372d] transition-colors"
          >
            去浏览资讯
          </Link>
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
