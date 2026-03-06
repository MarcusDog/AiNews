import React, { useState, useEffect, useCallback } from 'react';
import { Book, Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

const GlossaryPage = () => {
  const [glossary, setGlossary] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [expandedTerms, setExpandedTerms] = useState(new Set());

  // 使用useCallback包装fetch函数
  const loadData = useCallback(() => {
    fetchCategories();
    fetchGlossary();
  }, [selectedCategory]);

  // 页面挂载和切换时自动加载数据
  useRefreshOnVisible(loadData, [selectedCategory]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/glossary/categories');
      const data = await response.json();
      if (data.success) {
        setCategories(['全部', ...data.data]);
      }
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const fetchGlossary = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (selectedCategory !== '全部') {
        params.append('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/glossary?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setGlossary(data.data);
      } else {
        throw new Error(data.error || '获取失败');
      }
    } catch (error) {
      console.error('获取AI知识库失败:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchGlossary();
  };

  const toggleTerm = (termId) => {
    setExpandedTerms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(termId)) {
        newSet.delete(termId);
      } else {
        newSet.add(termId);
      }
      return newSet;
    });
  };

  const getCategoryColor = (category) => {
    const colors = {
      '基础概念': 'bg-blue-100 text-blue-700',
      '模型架构': 'bg-purple-100 text-purple-700',
      '模型类型': 'bg-green-100 text-green-700',
      '应用领域': 'bg-yellow-100 text-yellow-700',
      '应用技术': 'bg-pink-100 text-pink-700',
      '训练方法': 'bg-indigo-100 text-indigo-700',
      '学习方法': 'bg-cyan-100 text-cyan-700',
      '数据表示': 'bg-orange-100 text-orange-700',
      '数据存储': 'bg-teal-100 text-teal-700',
      '硬件': 'bg-red-100 text-red-700',
      '运行阶段': 'bg-gray-100 text-gray-700',
      '模型问题': 'bg-rose-100 text-rose-700',
      'AI安全': 'bg-amber-100 text-amber-700',
      '技术接口': 'bg-lime-100 text-lime-700',
      '部署方式': 'bg-emerald-100 text-emerald-700',
      '优化技术': 'bg-violet-100 text-violet-700',
      '模型参数': 'bg-sky-100 text-sky-700',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
<h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Book className="w-8 h-8 mr-3 text-blue-600" />
            AI知识库
          </h1>
<p className="text-gray-600 mt-2">
            全面的AI学习资源，涵盖基础概念、模型架构、算法框架、训练方法、AI技术及应用领域，共收录 {glossary.length} 个知识点
          </p>
          <div className="mt-4 flex gap-3">
            <a 
              href="/ai-architecture-guide.html" 
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 7m0 13V7" />
              </svg>
              📊 查看模型架构与算法框架详解
            </a>
          </div>
        </div>

      {/* 搜索和筛选 */}
      <div className="mb-6 space-y-4">
        {/* 搜索框 */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="搜索术语、英文名称或定义..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-24 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            搜索
          </button>
        </form>

        {/* 分类筛选 */}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-2" />
          <span className="text-gray-600">加载AI知识库中...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="text-center py-12">
          <div className="text-red-500 mb-4">加载失败: {error}</div>
          <button
            onClick={fetchGlossary}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      )}

      {/* 术语列表 */}
      {!loading && !error && (
        <div className="space-y-4">
          {glossary.map((term) => (
            <div
              key={term.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* 术语标题 */}
              <button
                onClick={() => toggleTerm(term.id)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {term.term}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {term.english}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(term.category)}`}>
                    {term.category}
                  </span>
                </div>
                {expandedTerms.has(term.id) ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* 术语详情 */}
              {expandedTerms.has(term.id) && (
                <div className="px-6 pb-4 border-t border-gray-100">
                  <div className="pt-4 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">定义</h4>
                      <p className="text-gray-700">{term.definition}</p>
                    </div>
                    {term.example && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-1">示例</h4>
                        <p className="text-gray-600 bg-gray-50 px-3 py-2 rounded-lg text-sm">
                          {term.example}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 空状态 */}
          {glossary.length === 0 && (
            <div className="text-center py-12">
              <Book className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">未找到相关术语</h3>
              <p className="text-gray-600">
                尝试使用其他关键词搜索，或选择其他分类
              </p>
            </div>
          )}
        </div>
      )}

      {/* 底部提示 */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">学习提示</h4>
        <p className="text-sm text-blue-700">
          AI知识库收录了180+个AI术语、算法框架、技术概念和应用场景的详细解释，涵盖从基础概念到前沿技术的完整体系。
          您可以通过搜索或分类筛选找到感兴趣的术语。
        </p>
      </div>
    </div>
  );
};

export default GlossaryPage;
