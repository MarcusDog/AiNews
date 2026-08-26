import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Server, 
  Wifi, 
  WifiOff,
  RefreshCw,
  X,
  Zap,
  Database,
  Activity,
  Bell,
  ChevronUp,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { useSocket, ConnectionStatus } from '../contexts/SocketContext';

function SystemStatus({ onRefresh }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const { 
    isConnected, 
    connectionStatus, 
    connectionInfo,
    lastMessage, 
    notifications,
    clearNotification,
    clearAllNotifications,
    reconnect,
    requestRefresh,
    getConnectionStatusText,
    getConnectionStatusColor
  } = useSocket();

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/news/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setLastChecked(new Date());
      }
    } catch (error) {
      console.error('获取状态失败:', error);
      setStatus({
        status: '错误',
        error: '无法连接到服务器',
        newsCount: 0,
        isUpdating: false
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // 每60秒检查一次
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // 监听WebSocket消息并刷新状态
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'news-update' || 
          lastMessage.type === 'refresh-complete' ||
          lastMessage.type === 'daily-update') {
        fetchStatus();
        if (onRefresh) onRefresh();
      }
    }
  }, [lastMessage, fetchStatus, onRefresh]);

  // 手动刷新
  const handleRefresh = async () => {
    if (refreshing) return;
    
    setRefreshing(true);
    
    // 通过WebSocket刷新
    if (isConnected) {
      requestRefresh();
    } else {
      // 通过API刷新
      try {
        await fetch('/api/news/update', { method: 'POST' });
        await fetchStatus();
        if (onRefresh) onRefresh();
      } catch (error) {
        console.error('刷新失败:', error);
      }
    }
    
    setTimeout(() => setRefreshing(false), 3000);
  };

  // 手动重连
  const handleReconnect = () => {
    reconnect();
  };

  if (loading && !status) {
    return null;
  }

  const isDemo = status?.isUsingDemo || status?.newsCount === 0;
  const isUpdating = status?.isUpdating || refreshing;
  
  // 确定状态颜色和图标
  const getStatusStyle = () => {
    if (!isConnected && connectionStatus === ConnectionStatus.FAILED) {
      return { color: 'bg-red-500', Icon: AlertCircle, text: '连接失败' };
    }
    if (connectionStatus === ConnectionStatus.RECONNECTING) {
      return { color: 'bg-yellow-500', Icon: Loader2, text: '重连中' };
    }
    if (!isConnected) {
      return { color: 'bg-gray-500', Icon: WifiOff, text: '离线模式' };
    }
    if (isUpdating) {
      return { color: 'bg-blue-500', Icon: RefreshCw, text: '更新中' };
    }
    if (isDemo) {
      return { color: 'bg-yellow-500', Icon: AlertCircle, text: '演示模式' };
    }
    if (status?.status === '错误') {
      return { color: 'bg-red-500', Icon: AlertCircle, text: '连接错误' };
    }
    return { color: 'bg-green-500', Icon: CheckCircle, text: '系统正常' };
  };

  const { color: statusColor, Icon: StatusIcon, text: statusText } = getStatusStyle();
  const hasNotifications = notifications.length > 0;

  // 最小化视图
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 hidden flex-col items-end space-y-2 sm:flex">
        {/* 通知气泡 */}
        {hasNotifications && (
          <div className="flex flex-col space-y-1 max-h-40 overflow-y-auto">
            {notifications.slice(-3).map((notification) => (
              <div
                key={notification.id}
                className={`px-3 py-2 rounded-lg shadow-lg text-sm flex items-center space-x-2 animate-slide-in ${
                  notification.type === 'success' ? 'bg-green-500 text-white' :
                  notification.type === 'error' ? 'bg-red-500 text-white' :
                  notification.type === 'warning' ? 'bg-yellow-500 text-white' :
                  'bg-blue-500 text-white'
                }`}
              >
                <span>{notification.message}</span>
                <button
                  onClick={() => clearNotification(notification.id)}
                  className="p-0.5 hover:bg-white/20 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* 状态按钮 */}
        <button
          onClick={() => setIsMinimized(false)}
          className={`${statusColor} text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform relative`}
          title={statusText}
        >
          <StatusIcon className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
          
          {/* 连接指示器 */}
          <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
            isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
          }`} />
          
          {/* 通知计数 */}
          {hasNotifications && (
            <span className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
              {notifications.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* 通知列表 */}
      {hasNotifications && !isExpanded && (
        <div className="fixed top-20 right-4 z-50 flex flex-col space-y-2 max-w-sm">
          {notifications.slice(-3).map((notification) => (
            <div
              key={notification.id}
              className={`px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 animate-slide-in ${
                notification.type === 'success' ? 'bg-green-500 text-white' :
                notification.type === 'error' ? 'bg-red-500 text-white' :
                notification.type === 'warning' ? 'bg-yellow-500 text-white' :
                'bg-blue-500 text-white'
              }`}
            >
              <Zap className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm">{notification.title}</p>
                <p className="text-xs opacity-90">{notification.message}</p>
              </div>
              <button 
                onClick={() => clearNotification(notification.id)}
                className="p-1 hover:bg-white/20 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 状态面板 */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className={`bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${
          isExpanded ? 'w-80' : 'w-72'
        }`}>
          {/* 头部 */}
          <div className={`${statusColor} text-white px-4 py-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <StatusIcon className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
                <span className="font-medium">{statusText}</span>
              </div>
              <div className="flex items-center space-x-1">
                {/* 刷新按钮 */}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                  title="刷新新闻"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                
                {/* 展开/收起 */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                
                {/* 最小化 */}
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="px-4 py-3 text-sm space-y-2 bg-gray-50">
            {/* 新闻数量 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center text-gray-600">
                <Database className="w-4 h-4 mr-2" />
                新闻总数
              </span>
              <span className="font-medium text-gray-900">{status?.newsCount || 0} 条</span>
            </div>
            
            {/* WebSocket状态 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center text-gray-600">
                {isConnected ? <Wifi className="w-4 h-4 mr-2" /> : <WifiOff className="w-4 h-4 mr-2" />}
                实时推送
              </span>
              <div className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-2 ${
                  getConnectionStatusColor() === 'green' ? 'bg-green-500' :
                  getConnectionStatusColor() === 'yellow' ? 'bg-yellow-500' :
                  getConnectionStatusColor() === 'red' ? 'bg-red-500' : 'bg-gray-500'
                }`} />
                <span className="font-medium text-gray-900">{getConnectionStatusText()}</span>
              </div>
            </div>
            
            {/* 上次检查 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center text-gray-600">
                <Clock className="w-4 h-4 mr-2" />
                上次检查
              </span>
              <span className="font-medium text-gray-900">
                {lastChecked ? lastChecked.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>
          </div>

          {/* 展开的详细信息 */}
          {isExpanded && (
            <div className="px-4 py-3 text-sm space-y-3 border-t border-gray-200">
              {/* 连接信息 */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900 flex items-center">
                  <Activity className="w-4 h-4 mr-2" />
                  连接详情
                </h4>
                
                {connectionInfo.connectedAt && (
                  <div className="flex items-center justify-between text-gray-600">
                    <span>连接时间</span>
                    <span>{new Date(connectionInfo.connectedAt).toLocaleTimeString('zh-CN')}</span>
                  </div>
                )}
                
                {connectionInfo.latency !== null && (
                  <div className="flex items-center justify-between text-gray-600">
                    <span>延迟</span>
                    <span className={connectionInfo.latency > 1000 ? 'text-yellow-600' : 'text-green-600'}>
                      {connectionInfo.latency}ms
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-gray-600">
                  <span>重连次数</span>
                  <span>{connectionInfo.reconnectCount}</span>
                </div>
              </div>
              
              {/* 分类统计 */}
              {status?.categories && status.categories.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 flex items-center">
                    <Server className="w-4 h-4 mr-2" />
                    分类分布
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {status.categories.map((cat) => (
                      <div key={cat.name} className="flex items-center justify-between text-gray-600 bg-gray-100 rounded px-2 py-1">
                        <span className="truncate">{cat.name}</span>
                        <span className="font-medium ml-2">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 通知列表 */}
              {hasNotifications && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 flex items-center">
                      <Bell className="w-4 h-4 mr-2" />
                      通知 ({notifications.length})
                    </h4>
                    <button
                      onClick={clearAllNotifications}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      清除全部
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`text-xs px-2 py-1 rounded flex items-center justify-between ${
                          notification.type === 'success' ? 'bg-green-100 text-green-700' :
                          notification.type === 'error' ? 'bg-red-100 text-red-700' :
                          notification.type === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <span className="truncate">{notification.message}</span>
                        <button
                          onClick={() => clearNotification(notification.id)}
                          className="ml-1 p-0.5 hover:bg-black/10 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 操作按钮 */}
              {connectionStatus === ConnectionStatus.FAILED && (
                <button
                  onClick={handleReconnect}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  重新连接
                </button>
              )}
            </div>
          )}
          
          {/* 底部信息 */}
          <div className="px-4 py-2 bg-gray-100 text-xs text-gray-500 flex items-center justify-between">
            <span>AI资讯平台 v2.0</span>
            <span>{status?.lastUpdate ? `更新: ${new Date(status.lastUpdate).toLocaleTimeString('zh-CN')}` : ''}</span>
          </div>
        </div>
      </div>

      {/* CSS动画 */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

export default SystemStatus;
