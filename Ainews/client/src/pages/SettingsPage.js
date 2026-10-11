import React, { useState, useCallback } from 'react';
import { 
  Settings, 
  Bell, 
  Clock, 
  RefreshCw, 
  Save, 
  CheckCircle, 
  AlertTriangle, 
  Rss, 
  ExternalLink,
  Database,
  Loader2,
  Palette
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

const SOURCE_GROUP_LABELS = {
  research: '研究',
  product: '产品',
  engineering: '工程',
  investment: '投资'
};

const SOURCE_GROUP_ORDER = ['research', 'product', 'engineering', 'investment'];

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    updateTime: '08:00',
    autoRefresh: true,
    refreshInterval: 180,
    notifications: true,
    preferredCategories: [],
    theme: 'light',
    language: 'zh',
    compactMode: false,
    showImages: true
  });
  
  const [saveStatus, setSaveStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  
  // 数据源管理
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  
  // 系统状态
  const [systemStatus, setSystemStatus] = useState(null);
  
  const { connectionInfo } = useSocket();

  const categories = [
    'AI新闻', 'AI框架', '新算法', '新思路', '新工具'
  ];

// 加载设置的回调函数
  const loadSettings = useCallback(() => {
    // 从本地存储加载设置
    const savedSettings = localStorage.getItem('ainews-settings');
    if (savedSettings) {
      setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) }));
    }

    // 加载数据源
    fetchSources();

    // 加载系统状态
    fetchSystemStatus();
  }, []);

  // 页面挂载和切换时自动加载
  useRefreshOnVisible(loadSettings);

  const fetchSources = async () => {
    setLoadingSources(true);
    try {
      const response = await fetch('/api/admin/sources');
      const data = await response.json();
      if (data.success) {
        setSources(data.data || []);
      }
    } catch (error) {
      console.error('获取数据源失败:', error);
    } finally {
      setLoadingSources(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/news/status');
      const data = await response.json();
      if (data.success) {
        setSystemStatus(data.data);
      }
    } catch (error) {
      console.error('获取系统状态失败:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCategoryToggle = (category) => {
    setSettings(prev => ({
      ...prev,
      preferredCategories: prev.preferredCategories.includes(category)
        ? prev.preferredCategories.filter(c => c !== category)
        : [...prev.preferredCategories, category]
    }));
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('ainews-settings', JSON.stringify(settings));
      localStorage.setItem('ainews-last-update', new Date().toLocaleString('zh-CN'));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('保存设置失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const manualRefresh = async () => {
    try {
      setSaveStatus('refreshing');
      const response = await fetch('/api/news/update', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setSaveStatus('refresh-success');
        fetchSystemStatus();
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('手动刷新失败:', error);
      setSaveStatus('refresh-error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const getStatusColor = (isHealthy) => {
    return isHealthy ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const groupedSources = SOURCE_GROUP_ORDER.map((group) => ({
    key: group,
    label: SOURCE_GROUP_LABELS[group],
    items: sources.filter((source) => source.source_group === group)
  })).filter((group) => group.items.length > 0);

  const renderStatusMessage = () => {
    if (!saveStatus) return null;
    
    const messages = {
      'success': { icon: CheckCircle, text: '设置已保存成功', color: 'bg-green-50 text-green-700' },
      'error': { icon: AlertTriangle, text: '保存设置失败，请重试', color: 'bg-red-50 text-red-700' },
      'refreshing': { icon: Loader2, text: '正在刷新新闻...', color: 'bg-blue-50 text-blue-700', spin: true },
      'refresh-success': { icon: RefreshCw, text: '手动刷新完成', color: 'bg-blue-50 text-blue-700' },
      'refresh-error': { icon: AlertTriangle, text: '手动刷新失败，请检查网络', color: 'bg-orange-50 text-orange-700' },
      'sources-reset': { icon: CheckCircle, text: '数据源已重置', color: 'bg-green-50 text-green-700' },
      'reset-success': { icon: CheckCircle, text: '设置已重置为默认值', color: 'bg-blue-50 text-blue-700' }
    };
    
    const msg = messages[saveStatus];
    if (!msg) return null;
    
    const Icon = msg.icon;
    
    return (
      <div className={`mb-6 p-4 rounded-lg flex items-center ${msg.color}`}>
        <Icon className={`w-5 h-5 mr-2 ${msg.spin ? 'animate-spin' : ''}`} />
        {msg.text}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <Settings className="w-8 h-8 mr-3" />
          系统设置
        </h1>
        <p className="text-gray-600 mt-2">配置AI资讯平台的行为和偏好</p>
      </div>

      {/* 状态提示 */}
      {renderStatusMessage()}

      {/* 标签页导航 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'general', label: '常规设置', icon: Settings },
            { id: 'sources', label: '数据源', icon: Rss },
            { id: 'display', label: '显示设置', icon: Palette },
            { id: 'system', label: '关于本站', icon: Database }
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

      <div className="space-y-6">
        {/* 常规设置标签页 */}
        {activeTab === 'general' && (
          <>
            {/* 自动更新设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                自动更新设置
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">自动更新</label>
                    <p className="text-sm text-gray-500">服务端固定在每天 08:00 全量更新，并每 2 小时增量抓取最新内容</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoRefresh}
                      onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">更新时间</label>
                    <p className="text-sm text-gray-500">主更新窗口固定为每日 08:00，其余每 2 小时一次</p>
                  </div>
                  <input
                    type="time"
                    value={settings.updateTime}
                    onChange={(e) => handleSettingChange('updateTime', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">列表刷新间隔</label>
                    <p className="text-sm text-gray-500">浏览器端列表自动重新拉取的间隔，不影响服务端抓取计划</p>
                  </div>
                  <select
                    value={settings.refreshInterval}
                    onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={0}>不自动刷新</option>
                    <option value={60}>1小时</option>
                    <option value={120}>2小时</option>
                    <option value={180}>3小时</option>
                    <option value={360}>6小时</option>
                  </select>
                </div>

                {/* 手动刷新按钮 */}
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={manualRefresh}
                    disabled={saveStatus === 'refreshing'}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${saveStatus === 'refreshing' ? 'animate-spin' : ''}`} />
                    {saveStatus === 'refreshing' ? '刷新中...' : '立即刷新新闻'}
                  </button>
                </div>
              </div>
            </div>

            {/* 通知设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                通知设置
              </h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">启用通知</label>
                    <p className="text-sm text-gray-500">接收重要AI资讯的推送通知</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notifications}
                      onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* 偏好设置 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">内容偏好</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    关注的资讯分类
                  </label>
                  <p className="text-sm text-gray-500 mb-3">选择您感兴趣的AI资讯分类（空选表示全部）</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {categories.map((category) => (
                      <label 
                        key={category} 
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          settings.preferredCategories.includes(category)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={settings.preferredCategories.includes(category)}
                          onChange={() => handleCategoryToggle(category)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 数据源管理标签页 */}
        {activeTab === 'sources' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Rss className="w-5 h-5 mr-2" />
                RSS数据源
              </h2>
              <button
                onClick={fetchSources}
                disabled={loadingSources}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 inline mr-1 ${loadingSources ? 'animate-spin' : ''}`} />
                刷新列表
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              本站聚合多个 AI 资讯 RSS 数据源，按研究、产品、工程、投资四种视角展示覆盖面与健康状态。数据每 2 小时自动抓取更新。
            </p>

            {loadingSources ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">加载数据源...</span>
              </div>
            ) : sources.length > 0 ? (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {groupedSources.map((group) => (
                    <div key={group.key} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        {group.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-gray-900">{group.items.length}</div>
                      <p className="mt-1 text-sm text-gray-500">
                        正常 {group.items.filter((item) => item.is_healthy).length} 个，异常 {group.items.filter((item) => !item.is_healthy).length} 个
                      </p>
                    </div>
                  ))}
                </div>

                {groupedSources.map((group) => (
                  <section key={group.key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{group.label}</h3>
                        <p className="text-sm text-gray-500">
                          {group.items.length} 个数据源
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((source, index) => (
                        <div
                          key={`${group.key}-${source.name}-${index}`}
                          className={`rounded-xl border p-4 ${
                            source.is_healthy ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-medium text-gray-900">{source.name}</h4>
                                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
                                  {group.label}
                                </span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(source.is_healthy)}`}>
                                  {source.is_healthy ? '正常' : '异常'}
                                </span>
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                  {source.category}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm text-gray-500" title={source.url}>
                                {source.url}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                <span>文章: {source.article_count || 0}</span>
                                <span>失败: {source.fail_count || 0} 次</span>
                                <span>优先级: P{source.priority}</span>
                                <span>{source.language === 'zh' ? '中文源' : '英文源'}</span>
                              </div>
                              {source.last_error && (
                                <p className="mt-2 text-xs text-red-600">
                                  错误: {source.last_error}
                                </p>
                              )}
                            </div>

                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-blue-600"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Rss className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无数据源信息</p>
                <p className="text-sm mt-1">请先刷新新闻以初始化数据源</p>
              </div>
            )}
            
            {/* 数据源统计 */}
            {sources.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    总计: {sources.length} 个数据源
                  </span>
                  <div className="flex items-center space-x-4">
                    <span className="text-green-600">
                      正常: {sources.filter(s => s.is_healthy).length}
                    </span>
                    <span className="text-red-600">
                      异常: {sources.filter(s => !s.is_healthy).length}
                    </span>
                    <span className="text-gray-600">
                      已覆盖: {groupedSources.length} 个分组
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 显示设置标签页 */}
        {activeTab === 'display' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Palette className="w-5 h-5 mr-2" />
              显示设置
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">紧凑模式</label>
                  <p className="text-sm text-gray-500">使用更紧凑的布局显示新闻列表</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.compactMode}
                    onChange={(e) => handleSettingChange('compactMode', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">显示图片</label>
                  <p className="text-sm text-gray-500">在新闻列表中显示缩略图</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showImages}
                    onChange={(e) => handleSettingChange('showImages', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">主题</label>
                  <p className="text-sm text-gray-500">选择界面主题（即将支持）</p>
                </div>
                <select
                  value={settings.theme}
                  onChange={(e) => handleSettingChange('theme', e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled
                >
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                  <option value="auto">跟随系统</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 系统信息标签页 */}
        {activeTab === 'system' && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                <Database className="w-5 h-5 mr-2" />
                站点状态
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">实时推送</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      connectionInfo?.isConnected
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {connectionInfo?.isConnected ? '已连接' : '断开'}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">新闻数量</span>
                    <span className="text-sm font-medium text-gray-900">
                      {systemStatus?.newsCount?.toLocaleString() || '加载中...'}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">分类数量</span>
                    <span className="text-sm font-medium text-gray-900">
                      {systemStatus?.categories?.length || 0}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">运行状态</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      systemStatus?.isUpdating
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {systemStatus?.status || '正常'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">版本信息</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">版本:</span>
                  <span className="text-gray-900 font-medium">v2.0.0</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">最后更新:</span>
                  <span className="text-gray-900">
                    {systemStatus?.lastUpdate
                      ? new Date(systemStatus.lastUpdate).toLocaleString('zh-CN')
                      : localStorage.getItem('ainews-last-update') || '未记录'
                    }
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">技术栈:</span>
                  <span className="text-gray-900">React + Node.js + Express + SQLite</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">数据库:</span>
                  <span className="text-gray-900">SQLite (本地存储)</span>
                </div>
              </div>
            </div>

            {/* 我的数据（用户自助管理） */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">我的数据</h2>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">搜索历史</p>
                    <p className="text-xs text-gray-500">已保存的搜索记录</p>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.removeItem('ainews-search-history');
                      setSaveStatus('success');
                      setTimeout(() => setSaveStatus(null), 2000);
                    }}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    清除
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">收藏记录</p>
                    <p className="text-xs text-gray-500">已收藏的新闻</p>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.removeItem('ainews-favorites');
                      setSaveStatus('success');
                      setTimeout(() => setSaveStatus(null), 2000);
                    }}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    清除
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-700">阅读记录</p>
                    <p className="text-xs text-gray-500">已阅读的新闻ID</p>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.removeItem('ainews-read-history');
                      setSaveStatus('success');
                      setTimeout(() => setSaveStatus(null), 2000);
                    }}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    清除
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 保存按钮 */}
        {(activeTab === 'general' || activeTab === 'display') && (
          <div className="flex justify-end space-x-4">
            <button
              onClick={() => {
                localStorage.removeItem('ainews-settings');
                setSettings({
                  updateTime: '08:00',
                  autoRefresh: true,
                  refreshInterval: 180,
                  notifications: true,
                  preferredCategories: [],
                  theme: 'light',
                  language: 'zh',
                  compactMode: false,
                  showImages: true
                });
                setSaveStatus('reset-success');
                setTimeout(() => setSaveStatus(null), 3000);
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              重置设置
            </button>
            
            <button
              onClick={saveSettings}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              保存设置
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
