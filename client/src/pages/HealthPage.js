import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Server, 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  HardDrive,
  BarChart3,
  History,
  Shield,
  Loader2
} from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';
import { useRefreshOnVisible } from '../hooks/usePageVisibility';

const HealthPage = () => {
  const [health, setHealth] = useState(null);
  const [sourceStatus, setSourceStatus] = useState([]);
  const [requestLogs, setRequestLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  const { 
    isConnected, 
    connectionInfo
  } = useSocket();

  // 获取健康状态
  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, sourcesRes, logsRes] = await Promise.all([
        fetch('/health'),
        fetch('/api/admin/sources').catch(() => ({ ok: false })),
        fetch('/api/admin/logs').catch(() => ({ ok: false }))
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
      }

      if (sourcesRes.ok) {
        const sourcesData = await sourcesRes.json();
        if (sourcesData.success) {
          setSourceStatus(sourcesData.data || []);
        }
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.success) {
          setRequestLogs(logsData.data || []);
        }
      }
    } catch (error) {
      console.error('获取健康状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 页面挂载和切换时自动加载数据
  useRefreshOnVisible(() => fetchHealth(), []);

  // 每30秒自动刷新
  useEffect(() => {
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // 手动刷新
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/admin/refresh', { method: 'POST' });
      await fetchHealth();
    } catch (error) {
      console.error('刷新失败:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // 手动恢复
  const handleRecovery = async () => {
    setRecovering(true);
    try {
      await fetch('/api/admin/recovery', { method: 'POST' });
      await fetchHealth();
    } catch (error) {
      console.error('恢复失败:', error);
    } finally {
      setRecovering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">加载系统状态...</span>
      </div>
    );
  }

  // 状态徽章渲染辅助函数
  // eslint-disable-next-line no-unused-vars
  const getStatusBadge = (status) => {
    if (status === 'OK' || status === 'ok' || status === true) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          正常
        </span>
      );
    }
    if (status === 'updating') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          更新中
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3 mr-1" />
        异常
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Activity className="w-8 h-8 mr-3 text-blue-600" />
            系统健康监控
          </h1>
          <p className="text-gray-600 mt-2">实时监控系统状态、数据源健康和自动恢复</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新数据
          </button>
          <button
            onClick={handleRecovery}
            disabled={recovering}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Shield className={`w-4 h-4 mr-2 ${recovering ? 'animate-spin' : ''}`} />
            触发恢复
          </button>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: '概览', icon: BarChart3 },
            { id: 'sources', label: '数据源状态', icon: Server },
            { id: 'logs', label: '请求日志', icon: History }
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
          {/* 系统状态卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 服务器状态 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${health?.status === 'OK' ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Server className={`w-6 h-6 ${health?.status === 'OK' ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">服务器状态</p>
                    <p className="text-2xl font-bold text-gray-900">{health?.status || '未知'}</p>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">版本: {health?.version || '—'}</p>
            </div>

            {/* WebSocket连接 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {isConnected ? (
                      <Wifi className="w-6 h-6 text-green-600" />
                    ) : (
                      <WifiOff className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">WebSocket</p>
                    <p className="text-lg font-bold text-gray-900">{isConnected ? '已连接' : '未连接'}</p>
                  </div>
                </div>
              </div>
              {connectionInfo.latency !== null && (
                <p className="mt-2 text-xs text-gray-500">延迟: {connectionInfo.latency}ms</p>
              )}
            </div>

            {/* 新闻数量 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">新闻总数</p>
                  <p className="text-2xl font-bold text-gray-900">{health?.newsCount || 0}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">分类: {health?.categories || 0}</p>
            </div>

            {/* 更新状态 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${health?.isUpdating ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <RefreshCw className={`w-6 h-6 ${health?.isUpdating ? 'text-blue-600 animate-spin' : 'text-gray-600'}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">更新状态</p>
                  <p className="text-lg font-bold text-gray-900">
                    {health?.isUpdating ? '更新中' : '空闲'}
                  </p>
                </div>
              </div>
              {health?.lastUpdate && (
                <p className="mt-2 text-xs text-gray-500">
                  上次: {new Date(health.lastUpdate).toLocaleString('zh-CN')}
                </p>
              )}
            </div>
          </div>

          {/* 系统信息 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <HardDrive className="w-5 h-5 mr-2" />
              系统信息
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">时间戳</p>
                <p className="font-medium text-gray-900">
                  {health?.timestamp ? new Date(health.timestamp).toLocaleString('zh-CN') : '—'}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">内存缓存</p>
                <p className="font-medium text-gray-900">{health?.memoryCache || 0} 条</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">重连次数</p>
                <p className="font-medium text-gray-900">{connectionInfo.reconnectCount || 0}</p>
              </div>
            </div>
          </div>

          {/* 自修复功能说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 flex items-center mb-3">
              <Shield className="w-5 h-5 mr-2" />
              自修复功能
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start">
                <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-600" />
                <span>WebSocket断线自动重连（最多15次尝试）</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-600" />
                <span>RSS源失败自动降级到备用源</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-600" />
                <span>数据库连接异常自动恢复</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-600" />
                <span>每30分钟自动增量更新</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-blue-600" />
                <span>每日凌晨2点自动清理过期数据</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* 数据源状态标签页 */}
      {activeTab === 'sources' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">RSS数据源状态</h2>
            <p className="text-sm text-gray-500 mt-1">显示各数据源的健康状况和最近请求情况</p>
          </div>
          
          {sourceStatus.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">数据源</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">失败次数</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后成功</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">错误信息</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sourceStatus.map((source, index) => (
                    <tr key={index} className={source.is_active ? '' : 'bg-red-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{source.name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">{source.url}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {source.is_active ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            活跃
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            禁用
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`font-medium ${source.fail_count > 5 ? 'text-red-600' : source.fail_count > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {source.fail_count || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {source.last_success ? new Date(source.last_success).toLocaleString('zh-CN') : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate">
                        {source.error_message || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <Server className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>暂无数据源状态信息</p>
              <p className="text-sm mt-2">数据源状态将在首次请求后记录</p>
            </div>
          )}
        </div>
      )}

      {/* 请求日志标签页 */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">最近请求日志</h2>
            <p className="text-sm text-gray-500 mt-1">显示最近60分钟内的请求统计</p>
          </div>
          
          {requestLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">数据源</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">总请求</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功率</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">平均响应时间</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {requestLogs.map((log, index) => {
                    const successRate = log.total_requests > 0 
                      ? Math.round((log.successful / log.total_requests) * 100) 
                      : 0;
                    return (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                          {log.source_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                          {log.total_requests}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-green-600">
                          {log.successful}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  successRate >= 80 ? 'bg-green-500' : 
                                  successRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${successRate}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{successRate}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                          {log.avg_response_time ? `${Math.round(log.avg_response_time)}ms` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-gray-500">
              <History className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>暂无请求日志</p>
              <p className="text-sm mt-2">请求日志将在数据更新后生成</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HealthPage;
