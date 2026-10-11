import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Heart,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  UserRound
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCategoryLabel } from '../utils/newsFeed';

const categories = ['全部', 'AI新闻', 'AI框架', '新算法', '新思路', '新工具'];

const Header = ({ onRefresh, selectedCategory, setSelectedCategory }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  const chooseCategory = (category) => {
    setSelectedCategory(category);
    navigate('/');
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 900);
  };

  const handleLogout = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await logout();
      navigate('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#d7d0c5] bg-[#fbfaf6]/[0.97] text-[#2b2925] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex flex-none items-center gap-3" aria-label="AI News 首页">
          <span className="relative flex h-9 w-9 items-center justify-center border border-[#80776c] font-mono text-sm font-bold tracking-tight transition group-hover:border-[#914b3a] group-hover:text-[#914b3a]">
            AI
            <span className="absolute -right-1 -top-1 h-2 w-2 bg-[#914b3a]" />
          </span>
          <span>
            <span className="block text-[15px] font-black leading-none tracking-[0.16em]">AINEWS</span>
            <span className="mt-1.5 block font-mono text-[8px] tracking-[0.24em] text-[#80776c]">资讯阅读台</span>
          </span>
        </Link>

        <span className="hidden h-6 w-px bg-[#d7d0c5] xl:block" />

        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="新闻分类">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => chooseCategory(category)}
              className={`relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition ${
                selectedCategory === category ? 'text-[#2b2925]' : 'text-[#777066] hover:text-[#2b2925]'
              }`}
            >
              {getCategoryLabel(category)}
              {selectedCategory === category && <span className="absolute inset-x-3 -bottom-[17px] h-0.5 bg-[#914b3a]" />}
            </button>
          ))}
        </nav>

        <form onSubmit={handleSearch} className="ml-auto hidden w-full max-w-[260px] items-center xl:flex">
          <label className="relative w-full">
            <span className="sr-only">搜索 AI 资讯</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8378]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索报道、公司、模型"
              className="h-10 w-full border border-[#d7d0c5] bg-white pl-10 pr-3 text-sm text-[#2b2925] outline-none transition placeholder:text-[#9a9287] focus:border-[#914b3a]"
            />
          </label>
        </form>

        <div className="flex flex-none items-center gap-0.5">
          <Link to="/search" className="header-icon inline-flex xl:hidden" aria-label="搜索" title="搜索"><Search className="h-[18px] w-[18px]" /></Link>
          <Link to="/favorites" className="header-icon hidden sm:inline-flex" aria-label="收藏" title="收藏"><Heart className="h-[18px] w-[18px]" /></Link>
          <Link to="/glossary" className="header-icon hidden md:inline-flex" aria-label="AI 知识库" title="AI 知识库"><BookOpen className="h-[18px] w-[18px]" /></Link>
          <Link to="/skills" className="header-icon hidden md:inline-flex" aria-label="技能总览" title="技能总览"><Sparkles className="h-[18px] w-[18px]" /></Link>
          <Link to="/analytics" className="header-icon hidden md:inline-flex" aria-label="数据分析" title="数据分析"><BarChart3 className="h-[18px] w-[18px]" /></Link>
          <button type="button" onClick={handleRefresh} disabled={isRefreshing} className="header-icon inline-flex" aria-label="刷新" title="刷新">
            <RefreshCw className={`h-[18px] w-[18px] ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <span className="hidden h-6 w-px bg-[#d7d0c5] sm:block" />

        {isAuthenticated ? (
          <div className="flex items-center gap-1">
            <Link to="/account" className="flex h-9 items-center gap-2 px-2 text-sm text-[#615b53] transition hover:text-[#2b2925]" title="账户">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e6ded2] text-xs font-bold text-[#413d37]">
                {user?.displayName?.[0]?.toUpperCase() || 'U'}
              </span>
              <span className="hidden max-w-24 truncate 2xl:block">{user?.displayName || '账户'}</span>
            </Link>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} className="header-icon hidden sm:inline-flex" aria-label="退出登录" title="退出登录">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        ) : (
          <Link to="/login" aria-label="登录" className="inline-flex h-9 items-center gap-2 border border-[#b9b0a4] px-3 text-xs font-semibold text-[#4a453f] transition hover:border-[#914b3a] hover:text-[#914b3a]">
            <LogIn className="h-4 w-4 sm:hidden" />
            <UserRound className="hidden h-4 w-4 sm:block" />
            <span className="hidden sm:inline">登录</span>
          </Link>
        )}
      </div>

      <nav className="scrollbar-hide flex h-11 items-center gap-1 overflow-x-auto border-t border-[#e2dcd3] px-4 lg:hidden" aria-label="移动端新闻分类">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => chooseCategory(category)}
            className={`h-full flex-none border-b-2 px-3 text-xs font-medium transition ${
              selectedCategory === category ? 'border-[#914b3a] text-[#2b2925]' : 'border-transparent text-[#777066]'
            }`}
          >
            {getCategoryLabel(category)}
          </button>
        ))}
      </nav>
    </header>
  );
};

export default Header;
