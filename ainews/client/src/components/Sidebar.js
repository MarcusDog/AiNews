import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  X, 
  Home, 
  TrendingUp, 
  Search, 
  Settings, 
  Brain, 
  Cpu, 
  Lightbulb, 
  Wrench,
  Newspaper,
  Target,
  Book,
  Activity,
  Heart,
  Sparkles,
  Zap,
  BarChart3,
  Globe
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose, selectedCategory, setSelectedCategory }) => {
  const location = useLocation();

  const navigationItems = [
    { name: '首页', href: '/', icon: Home, color: 'text-blue-600' },
    { name: '我的收藏', href: '/favorites', icon: Heart, color: 'text-red-500' },
    { name: '数据分析', href: '/analytics', icon: TrendingUp, color: 'text-green-600' },
    { name: 'AI知识库', href: '/glossary', icon: Book, color: 'text-purple-600' },
    { name: '系统监控', href: '/health', icon: Activity, color: 'text-orange-500' },
    { name: '搜索', href: '/search', icon: Search, color: 'text-gray-600' },
    { name: '设置', href: '/settings', icon: Settings, color: 'text-gray-500' },
  ];

  const categories = [
    { name: '全部', icon: Newspaper, color: 'from-gray-500 to-gray-600', emoji: '🔥' },
    { name: 'AI新闻', icon: Brain, color: 'from-blue-500 to-blue-600', emoji: '📰' },
    { name: 'AI框架', icon: Cpu, color: 'from-green-500 to-green-600', emoji: '🛠️' },
    { name: '新算法', icon: Target, color: 'from-purple-500 to-purple-600', emoji: '🧮' },
    { name: '新思路', icon: Lightbulb, color: 'from-yellow-500 to-yellow-600', emoji: '💡' },
    { name: '新工具', icon: Wrench, color: 'from-pink-500 to-pink-600', emoji: '🔧' },
  ];

  const quickStats = [
    { label: '每日更新', value: '08:00', icon: Zap },
    { label: '数据源', value: '40+', icon: Globe },
    { label: '分析维度', value: '5种', icon: BarChart3 },
  ];

  const isActive = (href) => location.pathname === href;

  return (
    <>
{/* 侧边栏 - 桌面端默认显示 */}
    <aside className={`fixed left-0 top-0 h-full w-72 bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 transform transition-transform duration-300 ease-out z-40 ${
      isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    }`}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* 头部Logo区域 */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center space-x-3" onClick={() => window.innerWidth < 1024 && onClose()}>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">AI资讯平台</h1>
                  <p className="text-xs text-gray-500 flex items-center">
                    <Sparkles className="w-3 h-3 mr-1 text-yellow-500" />
                    实时AI科技资讯
                  </p>
                </div>
              </Link>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
                aria-label="关闭菜单"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* 滚动区域 */}
          <div className="flex-1 overflow-y-auto">
            {/* 导航菜单 */}
            <nav className="p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">
                导航
              </h3>
              <ul className="space-y-1">
                {navigationItems.map((item) => (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={() => window.innerWidth < 1024 && onClose()}
                      className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                        isActive(item.href)
                          ? 'bg-white shadow-sm text-gray-900 border border-gray-100'
                          : 'text-gray-600 hover:bg-white hover:shadow-sm hover:text-gray-900'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 mr-3 ${isActive(item.href) ? item.color : 'text-gray-400'}`} />
                      {item.name}
                      {item.name === '我的收藏' && (
                        <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          ❤️
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* 分类菜单 */}
            <div className="px-4 pb-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">
                资讯分类
              </h3>
              <ul className="space-y-1">
                {categories.map((category) => (
                  <li key={category.name}>
                    <button
                      onClick={() => {
                        setSelectedCategory(category.name);
                        window.innerWidth < 1024 && onClose();
                        // Navigate to home if not there
                        if (location.pathname !== '/') {
                          window.location.href = '/';
                        }
                      }}
                      className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                        selectedCategory === category.name
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'text-gray-600 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <span className="mr-3 text-lg">{category.emoji}</span>
                      {category.name}
                      {selectedCategory === category.name && (
                        <span className="ml-auto w-2 h-2 bg-white rounded-full" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 底部统计信息 */}
          <div className="p-4 border-t border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="grid grid-cols-3 gap-2">
              {quickStats.map((stat) => (
                <div key={stat.label} className="text-center p-2">
                  <stat.icon className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                  <p className="text-sm font-semibold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
