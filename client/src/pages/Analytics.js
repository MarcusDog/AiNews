import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  Clock, 
  Tag, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  BarChart3, 
  RefreshCw, 
  Activity,
  PieChart,
  Calendar,
  Zap,
  Globe,
  ArrowUp,
  ArrowDown,
  Minus,
  Brain,
  Loader2
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

// 简单柱状图组件
const BarChart = ({ data, maxValue, color = 'blue', showLabels = true }) => {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center">
          {showLabels && (
            <div className="w-24 text-sm text-gray-600 truncate" title={item.label}>
              {item.label}
            </div>
          )}
          <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-${color}-500 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2`}
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
            >
              {item.value > 0 && (
                <span className="text-xs text-white font-medium">
                  {item.value}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// 环形图组件
const DonutChart = ({ data, size = 120, strokeWidth = 20 }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  let offset = 0;
  const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6B7280'];
  
  return (
    <div className="relative inline-block">
      <svg width={size} height={size} className="transform -rotate-90">
        {data.map((item, index) => {
          const percentage = total > 0 ? (item.value / total) : 0;
          const strokeDasharray = `${circumference * percentage} ${circumference}`;
          const strokeDashoffset = -offset;
          offset += circumference * percentage;
          
          return (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-xs text-gray-500">总计</div>
        </div>
      </div>
    </div>
  );
};

// 趋势指示器
const TrendIndicator = ({ value, suffix = '%' }) => {
  if (value > 0) {
    return (
      <span className="inline-flex items-center text-green-600 text-sm">
        <ArrowUp className="w-3 h-3 mr-0.5" />
        +{value}{suffix}
      </span>
    );
  } else if (value < 0) {
    return (
      <span className="inline-flex items-center text-red-600 text-sm">
        <ArrowDown className="w-3 h-3 mr-0.5" />
        {value}{suffix}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-gray-500 text-sm">
      <Minus className="w-3 h-3 mr-0.5" />
      0{suffix}
    </span>
  );
};

// 迷你趋势线
const SparkLine = ({ data, color = '#3B82F6', height = 40, width = 100 }) => {
  if (!data || data.length < 2) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        className="transition-all duration-300"
      />
    </svg>
  );
};

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState([]);
  const [quality, setQuality] = useState(null);
  const [diversity, setDiversity] = useState(null);
  const [trends, setTrends] = useState(null);
  const [smartTrends, setSmartTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hasNewData, setHasNewData] = useState(false);

  // 历史数据（用于趋势图）
  const [historyData, setHistoryData] = useState({
    newsCount: [0, 0, 0, 0, 0, 0, 0],
    diversityScore: [0, 0, 0, 0, 0, 0, 0]
  });

  const { connectionStatus, socket } = useSocket();

  // 获取智能趋势分析
  const fetchSmartTrends = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/smart-trends');
      const data = await response.json();
      
      if (data.success) {
        setSmartTrends(data.data);
        setHasNewData(data.data.hasNewData);
      }
    } catch (error) {
      console.error('获取智能趋势失败:', error);
    }
  }, []);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // 并行获取统计数据（包括智能趋势）
      const [statsRes, trendingRes, qualityRes, diversityRes, trendsRes, smartTrendsRes] = await Promise.all([
        fetch('/api/analytics/stats'),
        fetch('/api/analytics/trending?limit=10'),
        fetch('/api/analytics/quality'),
        fetch('/api/analytics/diversity'),
        fetch('/api/analytics/trends'),
        fetch('/api/analytics/smart-trends')
      ]);

      const [statsData, trendingData, qualityData, diversityData, trendsData, smartTrendsData] = await Promise.all([
        statsRes.json(),
        trendingRes.json(),
        qualityRes.json(),
        diversityRes.json(),
        trendsRes.json(),
        smartTrendsRes.json()
      ]);

      if (statsData.success) setStats(statsData.data);
      if (trendingData.success) setTrending(trendingData.data);
      if (qualityData.success) setQuality(qualityData.data);
      if (diversityData.success) setDiversity(diversityData.data);
      if (trendsData.success) setTrends(trendsData.data);
      if (smartTrendsData.success) {
        setSmartTrends(smartTrendsData.data);
        setHasNewData(smartTrendsData.data.hasNewData);
      }

      setLastUpdate(new Date());

      // 模拟历史数据（实际应从API获取）
      if (statsData.success) {
        setHistoryData(prev => ({
          newsCount: [...prev.newsCount.slice(1), statsData.data.total || 0],
          diversityScore: [...prev.diversityScore.slice(1), diversityData.data?.diversityScore || 0]
        }));
      }

    } catch (error) {
      console.error('获取分析数据失败:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 监听WebSocket新闻更新，自动刷新趋势分析
  useEffect(() => {
    if (!socket) return;

    const handleNewsUpdate = (data) => {
      if (data?.type === 'update-complete' && data?.data?.totalSaved > 0) {
        console.log('检测到新数据，自动刷新趋势分析...');
        // 延迟2秒刷新，等待数据处理完成
        setTimeout(() => {
          fetchSmartTrends();
          setHasNewData(true);
        }, 2000);
      }
    };

    socket.on('news-update', handleNewsUpdate);

    return () => {
      socket.off('news-update', handleNewsUpdate);
    };
  }, [socket, fetchSmartTrends]);

// 使用自定义Hook确保页面切换时自动刷新
  useRefreshOnVisible(() => fetchAnalytics(), []);

  // 每5分钟自动刷新
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnalytics(true);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const getRiskColor = (level) => {
    const colors = {
      'low': 'text-green-600 bg-green-100',
      'medium': 'text-yellow-600 bg-yellow-100',
      'high': 'text-red-600 bg-red-100'
    };
    return colors[level] || 'text-gray-600 bg-gray-100';
  };

  const getRiskIcon = (level) => {
    if (level === 'low') return <CheckCircle className="w-5 h-5" />;
    if (level === 'high') return <AlertTriangle className="w-5 h-5" />;
    return <Eye className="w-5 h-5" />;
  };

  const getCategoryChartData = () => {
    if (!stats?.categories) return [];
    return Object.entries(stats.categories).map(([name, value]) => ({
      label: name,
      value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">加载数据分析中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">数据分析</h1>
          <p className="text-gray-600 mt-1">AI资讯平台运营数据分析与内容多样性检测</p>
        </div>
        <div className="flex items-center space-x-4">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              更新于 {lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 连接状态提示 */}
      {connectionStatus !== 'connected' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center">
          <Activity className="w-5 h-5 text-yellow-600 mr-2" />
          <span className="text-yellow-700 text-sm">
            实时连接已断开，数据可能不是最新的
          </span>
        </div>
      )}

      {/* 标签页导航 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: '概览', icon: BarChart3 },
            { id: 'charts', label: '图表分析', icon: PieChart },
            { id: 'diversity', label: '信息茧房检测', icon: Eye },
            { id: 'trends', label: 'AI趋势分析', icon: TrendingUp }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 概览标签页 */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                  <SparkLine data={historyData.newsCount} color="#3B82F6" />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">总资讯数</p>
                  <div className="flex items-baseline space-x-2">
                    <p className="text-2xl font-bold text-gray-900">{stats.total?.toLocaleString()}</p>
                    <TrendIndicator value={5} />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Clock className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600">{stats.today}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">今日新增</p>
                  <div className="flex items-baseline space-x-2">
                    <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
                    <span className="text-sm text-gray-500">条资讯</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Tag className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex space-x-1">
                    {Object.keys(stats.categories || {}).slice(0, 3).map((cat, i) => (
                      <span key={i} className="w-2 h-2 rounded-full bg-purple-400" />
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">资讯分类</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(stats.categories || {}).length}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${diversity ? getRiskColor(diversity.riskLevel) : 'bg-gray-100'}`}>
                    {diversity ? getRiskIcon(diversity.riskLevel) : <Eye className="w-6 h-6 text-gray-600" />}
                  </div>
                  <SparkLine 
                    data={historyData.diversityScore} 
                    color={diversity?.riskLevel === 'high' ? '#EF4444' : '#10B981'} 
                  />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-500">多样性评分</p>
                  <div className="flex items-baseline space-x-2">
                    <p className="text-2xl font-bold text-gray-900">{diversity?.diversityScore || 0}%</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getRiskColor(diversity?.riskLevel)}`}>
                      {diversity?.riskLevel === 'low' ? '良好' : diversity?.riskLevel === 'high' ? '需改进' : '一般'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 分类统计 */}
          {stats?.categories && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Tag className="w-5 h-5 mr-2 text-purple-600" />
                  分类分布
                </h2>
                <BarChart 
                  data={getCategoryChartData()} 
                  color="purple"
                />
              </div>

              {/* 热门话题 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-yellow-600" />
                  热门话题
                </h2>
                {trending.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {trending.map((topic, index) => (
                      <span
                        key={topic.keyword}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm ${
                          index < 3 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs mr-1.5 ${
                          index < 3 ? 'bg-yellow-500 text-white' : 'bg-gray-400 text-white'
                        }`}>
                          {index + 1}
                        </span>
                        {topic.keyword}
                        <span className="ml-1.5 text-xs opacity-70">({topic.count})</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">暂无热门话题数据</p>
                )}
              </div>
            </div>
          )}

          {/* 内容质量分析 */}
          {quality && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                内容质量分析
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-3xl font-bold text-gray-900">{quality.totalArticles}</p>
                  <p className="text-sm text-gray-500 mt-1">总文章数</p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">{quality.withImages}</p>
                  <p className="text-sm text-gray-500 mt-1">含图片文章</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {quality.totalArticles > 0 ? Math.round(quality.withImages / quality.totalArticles * 100) : 0}%
                  </p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">{quality.withDescriptions}</p>
                  <p className="text-sm text-gray-500 mt-1">含详细描述</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {quality.totalArticles > 0 ? Math.round(quality.withDescriptions / quality.totalArticles * 100) : 0}%
                  </p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                  <p className="text-3xl font-bold text-purple-600">{quality.avgDescriptionLength}</p>
                  <p className="text-sm text-gray-500 mt-1">平均描述长度</p>
                  <p className="text-xs text-purple-600 mt-0.5">字符</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图表分析标签页 */}
      {activeTab === 'charts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 分类饼图 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                <PieChart className="w-5 h-5 mr-2 text-blue-600" />
                分类占比
              </h3>
              <div className="flex items-center justify-center space-x-8">
                <DonutChart 
                  data={getCategoryChartData()}
                  size={160}
                  strokeWidth={25}
                />
                <div className="space-y-2">
                  {getCategoryChartData().map((item, index) => {
                    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#6B7280'];
                    const total = getCategoryChartData().reduce((sum, d) => sum + d.value, 0);
                    const percentage = total > 0 ? Math.round(item.value / total * 100) : 0;
                    
                    return (
                      <div key={index} className="flex items-center">
                        <span 
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: colors[index % colors.length] }}
                        />
                        <span className="text-sm text-gray-600">{item.label}</span>
                        <span className="text-sm font-medium text-gray-900 ml-2">{percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 来源分布 */}
            {diversity?.sourceDistribution && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-green-600" />
                  来源分布 TOP 8
                </h3>
                <BarChart 
                  data={diversity.sourceDistribution.slice(0, 8).map(s => ({
                    label: s.name,
                    value: s.count
                  }))}
                  color="green"
                />
              </div>
            )}
          </div>

          {/* 时间分布（模拟） */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-orange-600" />
              近7天资讯趋势
            </h3>
            <div className="h-48 flex items-end justify-between px-4">
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, index) => {
                const value = Math.random() * 100 + 50; // 模拟数据
                const height = (value / 150) * 100;
                
                return (
                  <div key={day} className="flex flex-col items-center flex-1 mx-1">
                    <div 
                      className="w-full bg-gradient-to-t from-orange-500 to-orange-300 rounded-t-lg transition-all duration-300 hover:from-orange-600 hover:to-orange-400"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-gray-500 mt-2">{day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 信息茧房检测标签页 */}
      {activeTab === 'diversity' && diversity && (
        <div className="space-y-6">
          {/* 多样性评分卡片 */}
          <div className={`rounded-xl p-6 ${
            diversity.riskLevel === 'low' ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' :
            diversity.riskLevel === 'high' ? 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-200' :
            'bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  {getRiskIcon(diversity.riskLevel)}
                  <span className="ml-2">内容多样性评分</span>
                </h2>
                <p className="text-gray-600 mt-1">{diversity.riskMessage}</p>
                
                {/* 多样性进度条 */}
                <div className="mt-4 w-64">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>低多样性</span>
                    <span>高多样性</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        diversity.diversityScore >= 70 ? 'bg-green-500' :
                        diversity.diversityScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${diversity.diversityScore}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-5xl font-bold text-gray-900">{diversity.diversityScore}</span>
                <span className="text-2xl text-gray-500">%</span>
                <p className="text-sm text-gray-500 mt-1">综合评分</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 分类分布 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">分类分布</h3>
              <div className="space-y-3">
                {diversity.categoryDistribution.map((cat) => (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{cat.name}</span>
                      <span className="text-gray-500">{cat.percentage}% ({cat.count})</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          cat.percentage > 50 ? 'bg-orange-500' :
                          cat.percentage < 10 ? 'bg-gray-400' : 'bg-blue-500'
                        }`}
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 来源分布 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">来源分布</h3>
              <div className="grid grid-cols-2 gap-3">
                {diversity.sourceDistribution.slice(0, 8).map((source) => (
                  <div key={source.name} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <p className="text-sm font-medium text-gray-900 truncate" title={source.name}>
                      {source.name}
                    </p>
                    <p className="text-xs text-gray-500">{source.count} 篇 ({source.percentage}%)</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 改进建议 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">改进建议</h3>
            <ul className="space-y-3">
              {diversity.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* AI趋势分析标签页 */}
{activeTab === 'trends' && (
          <div className="space-y-6">
            {/* 智能趋势分析标题 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white relative overflow-hidden">
              {/* 背景装饰 */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-bold flex items-center">
                    <Zap className="w-6 h-6 mr-2" />
                    AI智能趋势分析
                    {hasNewData && (
                      <span className="ml-3 px-2 py-1 bg-yellow-400 text-yellow-900 text-xs rounded-full animate-pulse">
                        有新数据
                      </span>
                    )}
                  </h2>
                  {smartTrends?.timestamp && (
                    <span className="text-sm opacity-75">
                      分析于 {new Date(smartTrends.timestamp).toLocaleString('zh-CN')}
                    </span>
                  )}
                </div>
                <p className="opacity-90 max-w-3xl">
                  基于 {smartTrends?.totalAnalyzed || 0} 篇新闻自动提取关键词，实时追踪AI领域热点话题变化趋势
                </p>
                <div className="flex items-center space-x-6 mt-4 text-sm opacity-75">
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    24小时: {smartTrends?.timeDistribution?.last24h || 0} 篇
                  </span>
                  <span className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    7天: {smartTrends?.timeDistribution?.last7d || 0} 篇
                  </span>
                  <span className="flex items-center">
                    <BarChart3 className="w-4 h-4 mr-1" />
                    30天: {smartTrends?.timeDistribution?.last30d || 0} 篇
                  </span>
                </div>
              </div>
            </div>

            {smartTrends ? (
              <>
                {/* 热门关键词排行 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-red-500" />
                      热门关键词 TOP 10
                    </h3>
                    <span className="text-sm text-gray-500">基于新闻标题和描述自动提取</span>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 左侧：关键词排行 */}
                    <div className="space-y-3">
                      {smartTrends.topKeywords?.map((item, index) => (
                        <div key={item.keyword} className="flex items-center group">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold mr-3 ${
                            index < 3 
                              ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-gray-900">{item.keyword}</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500">{item.articleCount} 篇文章</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  item.trend === 'surging' ? 'bg-red-100 text-red-700' :
                                  item.trend === 'rising' ? 'bg-orange-100 text-orange-700' :
                                  item.trend === 'declining' ? 'bg-gray-100 text-gray-600' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {item.trend === 'surging' ? '🔥 爆发' :
                                   item.trend === 'rising' ? '↗️ 上升' :
                                   item.trend === 'declining' ? '↘️ 下降' : '→ 平稳'}
                                </span>
                              </div>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  item.trend === 'surging' ? 'bg-red-500' :
                                  item.trend === 'rising' ? 'bg-orange-500' :
                                  item.trend === 'declining' ? 'bg-gray-400' :
                                  'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min((item.count / (smartTrends.topKeywords[0]?.count || 1)) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 右侧：趋势可视化 */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-4">趋势分布</h4>
                      <div className="space-y-4">
                        {['surging', 'rising', 'stable', 'declining'].map(trend => {
                          const count = smartTrends.topKeywords?.filter(k => k.trend === trend).length || 0;
                          const labels = {
                            surging: { text: '爆发式增长', color: 'bg-red-500', icon: '🔥' },
                            rising: { text: '上升趋势', color: 'bg-orange-500', icon: '↗️' },
                            stable: { text: '平稳发展', color: 'bg-blue-500', icon: '→' },
                            declining: { text: '热度下降', color: 'bg-gray-400', icon: '↘️' }
                          };
                          const label = labels[trend];
                          const total = smartTrends.topKeywords?.length || 1;
                          
                          return (
                            <div key={trend} className="flex items-center">
                              <span className="w-20 text-sm text-gray-600 flex items-center">
                                <span className="mr-1">{label.icon}</span>
                                {label.text}
                              </span>
                              <div className="flex-1 mx-3">
                                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${label.color} rounded-full transition-all duration-500`}
                                    style={{ width: `${(count / total) * 100}%` }}
                                  />
                                </div>
                              </div>
                              <span className="w-8 text-right text-sm font-medium text-gray-900">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 新兴趋势 */}
                {smartTrends.emergingTrends?.length > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Zap className="w-5 h-5 mr-2 text-green-600" />
                      新兴趋势
                      <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                        快速升温
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {smartTrends.emergingTrends.map((trend, index) => (
                        <div key={index} className="bg-white rounded-lg p-4 shadow-sm border border-green-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-900">{trend.keyword}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              +{trend.growth}%
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{trend.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 智能洞察 */}
                {smartTrends.insights?.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Brain className="w-5 h-5 mr-2 text-purple-600" />
                      智能洞察
                    </h3>
                    <div className="space-y-3">
                      {smartTrends.insights.map((insight, index) => (
                        <div 
                          key={index} 
                          className={`p-4 rounded-lg border-l-4 ${
                            insight.type === 'hot' ? 'bg-red-50 border-red-400' :
                            insight.type === 'tech' ? 'bg-blue-50 border-blue-400' :
                            'bg-green-50 border-green-400'
                          }`}
                        >
                          <div className="flex items-center mb-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              insight.type === 'hot' ? 'bg-red-100 text-red-700' :
                              insight.type === 'tech' ? 'bg-blue-100 text-blue-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {insight.title}
                            </span>
                          </div>
                          <p className="text-gray-700">{insight.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">正在分析新闻数据...</p>
              </div>
            )}
          </div>
        )}
    </div>
  );
};

export default Analytics;
