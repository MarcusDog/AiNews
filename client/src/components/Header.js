import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Brain, TrendingUp, Heart, Settings, Sparkles, Book, Activity, Search as SearchIcon } from 'lucide-react';

const Header = ({ onRefresh, selectedCategory, setSelectedCategory }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const categories = [
    { name: '全部', icon: '🔥' },
    { name: 'AI新闻', icon: '📰' },
    { name: 'AI框架', icon: '🛠️' },
    { name: '新算法', icon: '🧮' },
    { name: '新思路', icon: '💡' },
    { name: '新工具', icon: '🔧' }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100 z-30">
      <div className="flex items-center justify-between px-4 lg:px-6 py-3">
      {/* 左侧：Logo */}
      <div className="flex items-center space-x-4">
        <Link to="/" className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                AI资讯平台
              </h1>
              <p className="text-xs text-gray-500 flex items-center">
                <Sparkles className="w-3 h-3 mr-1 text-yellow-500" />
                实时AI科技资讯
              </p>
            </div>
          </Link>
        </div>

        {/* 中间：分类导航 */}
        <nav className="hidden lg:flex items-center bg-gray-50 rounded-xl p-1">
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => {
                setSelectedCategory(category.name);
                navigate('/');
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-1.5 ${
                selectedCategory === category.name
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <span>{category.icon}</span>
              <span>{category.name}</span>
            </button>
          ))}
        </nav>

        {/* 右侧：搜索 + 快捷操作 */}
        <div className="flex items-center space-x-2">
          {/* 搜索框 */}
          <form onSubmit={handleSearch} className="hidden sm:flex items-center">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="搜索AI资讯..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-none w-48 lg:w-64 transition-all placeholder:text-gray-400"
              />
            </div>
          </form>

{/* 快捷操作按钮组 */}
      <div className="flex items-center space-x-1 bg-gray-50 rounded-xl p-1">
        {/* AI词典 */}
        <Link
          to="/glossary"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-purple-500"
          title="AI知识库"
        >
          <Book className="w-5 h-5" />
        </Link>

        {/* 搜索 */}
        <Link
          to="/search"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-blue-500"
          title="搜索"
        >
          <SearchIcon className="w-5 h-5" />
        </Link>

        {/* 收藏 */}
        <Link
          to="/favorites"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-red-500"
          title="我的收藏"
        >
          <Heart className="w-5 h-5" />
        </Link>

        {/* 分析页面 */}
        <Link
          to="/analytics"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-green-500"
          title="数据分析"
        >
          <TrendingUp className="w-5 h-5" />
        </Link>

        {/* 系统监控 */}
        <Link
          to="/health"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-orange-500"
          title="系统监控"
        >
          <Activity className="w-5 h-5" />
        </Link>

        {/* 刷新按钮 */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-blue-500 disabled:opacity-50"
          title="刷新内容"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* 设置 */}
        <Link
          to="/settings"
          className="p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-gray-700"
          title="设置"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>
        </div>
      </div>

      {/* 移动端分类导航 */}
      <div className="lg:hidden overflow-x-auto scrollbar-hide border-t border-gray-100">
        <div className="flex items-center space-x-1 px-4 py-2">
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => {
                setSelectedCategory(category.name);
                navigate('/');
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                selectedCategory === category.name
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {category.icon} {category.name}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

export default Header;
