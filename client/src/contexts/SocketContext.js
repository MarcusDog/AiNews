import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

const SocketContext = createContext(null);
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 15;
const HEARTBEAT_INTERVAL = 30000; // 30秒心跳
const CONNECTION_TIMEOUT = 10000;

// 连接状态枚举
export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
  FAILED: 'failed'
};

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [connectionInfo, setConnectionInfo] = useState({
    connectedAt: null,
    reconnectCount: 0,
    lastPing: null,
    latency: null
  });
  const [notifications, setNotifications] = useState([]);
  
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);
  const heartbeatTimer = useRef(null);
  const pingStartTime = useRef(null);

  // 添加通知
  const addNotification = useCallback((notification) => {
    const id = Date.now();
    const newNotification = {
      id,
      timestamp: new Date().toISOString(),
      ...notification
    };
    
    setNotifications(prev => [...prev.slice(-49), newNotification]);
    
    // 5秒后自动清除非持久通知
    if (!notification.persistent) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    }
    
    return id;
  }, []);

  // 清除通知
  const clearNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 清除所有通知
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // 心跳检测
  const startHeartbeat = useCallback((socketInstance) => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
    }
    
    heartbeatTimer.current = setInterval(() => {
      if (socketInstance && socketInstance.connected) {
        pingStartTime.current = Date.now();
        socketInstance.emit('ping');
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  // 初始化WebSocket连接
  useEffect(() => {
    setConnectionStatus(ConnectionStatus.CONNECTING);
    
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY,
      reconnectionDelayMax: 10000,
      timeout: CONNECTION_TIMEOUT,
      autoConnect: true,
      forceNew: false
    });

    // 连接成功
    newSocket.on('connect', () => {
      console.log('WebSocket已连接:', newSocket.id);
      setIsConnected(true);
      setConnectionStatus(ConnectionStatus.CONNECTED);
      reconnectAttempts.current = 0;
      
      setConnectionInfo(prev => ({
        ...prev,
        connectedAt: new Date().toISOString(),
        reconnectCount: prev.reconnectCount
      }));
      
      // 启动心跳
      startHeartbeat(newSocket);
      
      // 连接成功通知
      if (reconnectAttempts.current > 0) {
        addNotification({
          type: 'success',
          title: '连接已恢复',
          message: 'WebSocket重新连接成功'
        });
      }
    });

    // 心跳响应
    newSocket.on('pong', () => {
      const latency = pingStartTime.current ? Date.now() - pingStartTime.current : null;
      setConnectionInfo(prev => ({
        ...prev,
        lastPing: new Date().toISOString(),
        latency
      }));
    });

    // 欢迎消息
    newSocket.on('welcome', (data) => {
      console.log('收到欢迎消息:', data);
      setLastMessage({ type: 'welcome', data, timestamp: Date.now() });
    });

    // 新闻更新
    newSocket.on('news-update', (data) => {
      console.log('收到新闻更新:', data);
      setLastMessage({ type: 'news-update', data, timestamp: Date.now() });
      
      // 显示更新通知
      if (data.type === 'update-complete' && data.data?.totalSaved > 0) {
        addNotification({
          type: 'info',
          title: '新闻已更新',
          message: `获取了 ${data.data.totalSaved} 条新资讯`
        });
      }
    });

    // 每日更新通知
    newSocket.on('daily-update', (data) => {
      console.log('收到每日更新通知:', data);
      setLastMessage({ type: 'daily-update', data, timestamp: Date.now() });
      
      addNotification({
        type: 'info',
        title: '每日更新完成',
        message: data.message || '今日AI资讯已更新',
        persistent: true
      });
    });

    // 系统状态更新
    newSocket.on('system-status', (data) => {
      console.log('收到系统状态:', data);
      setLastMessage({ type: 'system-status', data, timestamp: Date.now() });
    });

    // 错误消息
    newSocket.on('error-message', (data) => {
      console.error('收到错误消息:', data);
      setLastMessage({ type: 'error', data, timestamp: Date.now() });
      
      addNotification({
        type: 'error',
        title: '系统错误',
        message: data.message || '发生未知错误'
      });
    });

    // 刷新状态
    newSocket.on('refresh-started', (data) => {
      setLastMessage({ type: 'refresh-started', data, timestamp: Date.now() });
      addNotification({
        type: 'info',
        title: '正在刷新',
        message: '正在获取最新资讯...'
      });
    });

    newSocket.on('refresh-complete', (data) => {
      setLastMessage({ type: 'refresh-complete', data, timestamp: Date.now() });
      addNotification({
        type: 'success',
        title: '刷新完成',
        message: '最新资讯已更新'
      });
    });

    newSocket.on('refresh-error', (data) => {
      setLastMessage({ type: 'refresh-error', data, timestamp: Date.now() });
      addNotification({
        type: 'error',
        title: '刷新失败',
        message: data.error || '获取资讯时发生错误'
      });
    });

    // 断开连接
    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket断开:', reason);
      setIsConnected(false);
      stopHeartbeat();
      
      if (reason === 'io server disconnect') {
        // 服务器主动断开，需要手动重连
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
        addNotification({
          type: 'warning',
          title: '连接已断开',
          message: '服务器断开了连接，请刷新页面重试',
          persistent: true
        });
      } else {
        // 其他原因断开，socket.io会自动重连
        setConnectionStatus(ConnectionStatus.RECONNECTING);
      }
    });

    // 连接错误
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket连接错误:', error.message);
      setConnectionStatus(ConnectionStatus.ERROR);
      
      if (reconnectAttempts.current === 0) {
        addNotification({
          type: 'warning',
          title: '连接失败',
          message: '正在尝试重新连接...'
        });
      }
    });

    // 重连尝试
    newSocket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log('WebSocket重连尝试:', attemptNumber);
      setConnectionStatus(ConnectionStatus.RECONNECTING);
      reconnectAttempts.current = attemptNumber;
      
      setConnectionInfo(prev => ({
        ...prev,
        reconnectCount: prev.reconnectCount + 1
      }));
    });

    // 重连成功
    newSocket.io.on('reconnect', (attemptNumber) => {
      console.log('WebSocket重连成功，尝试次数:', attemptNumber);
      setConnectionStatus(ConnectionStatus.CONNECTED);
      reconnectAttempts.current = 0;
    });

    // 重连失败
    newSocket.io.on('reconnect_failed', () => {
      console.error('WebSocket重连失败，已达最大尝试次数');
      setConnectionStatus(ConnectionStatus.FAILED);
      
      addNotification({
        type: 'error',
        title: '连接失败',
        message: '无法连接到服务器，请检查网络后刷新页面',
        persistent: true
      });
    });

    setSocket(newSocket);

    // 清理
    return () => {
      stopHeartbeat();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current); // eslint-disable-line react-hooks/exhaustive-deps
      }
      newSocket.close();
    };
  }, [addNotification, startHeartbeat, stopHeartbeat]);

  // 订阅分类
  const subscribeCategory = useCallback((category) => {
    if (socket && isConnected) {
      socket.emit('subscribe', { category });
      console.log('订阅分类:', category);
    }
  }, [socket, isConnected]);

  // 取消订阅
  const unsubscribeCategory = useCallback((category) => {
    if (socket && isConnected) {
      socket.emit('unsubscribe', { category });
      console.log('取消订阅分类:', category);
    }
  }, [socket, isConnected]);

  // 请求刷新新闻
  const requestRefresh = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('refresh-news');
      return true;
    }
    return false;
  }, [socket, isConnected]);

  // 手动重连
  const reconnect = useCallback(() => {
    if (socket) {
      setConnectionStatus(ConnectionStatus.CONNECTING);
      reconnectAttempts.current = 0;
      socket.connect();
      
      addNotification({
        type: 'info',
        title: '正在重连',
        message: '正在尝试重新连接...'
      });
    }
  }, [socket, addNotification]);

  // 获取连接状态文本
  const getConnectionStatusText = useCallback(() => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return '已连接';
      case ConnectionStatus.CONNECTING:
        return '连接中...';
      case ConnectionStatus.RECONNECTING:
        return `重连中 (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`;
      case ConnectionStatus.ERROR:
        return '连接错误';
      case ConnectionStatus.FAILED:
        return '连接失败';
      default:
        return '未连接';
    }
  }, [connectionStatus]);

  // 获取连接状态颜色
  const getConnectionStatusColor = useCallback(() => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        return 'green';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'yellow';
      case ConnectionStatus.ERROR:
      case ConnectionStatus.FAILED:
        return 'red';
      default:
        return 'gray';
    }
  }, [connectionStatus]);

  const value = {
    socket,
    isConnected,
    connectionStatus,
    connectionInfo,
    lastMessage,
    notifications,
    subscribeCategory,
    unsubscribeCategory,
    requestRefresh,
    reconnect,
    addNotification,
    clearNotification,
    clearAllNotifications,
    getConnectionStatusText,
    getConnectionStatusColor
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

// Hook: 使用Socket上下文
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

// Hook: 监听特定消息类型
export function useSocketMessage(messageType, callback) {
  const { lastMessage } = useSocket();
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (lastMessage && lastMessage.type === messageType) {
      callbackRef.current(lastMessage.data);
    }
  }, [lastMessage, messageType]);
}

// Hook: 监听多个消息类型
export function useSocketMessages(messageTypes, callback) {
  const { lastMessage } = useSocket();
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (lastMessage && messageTypes.includes(lastMessage.type)) {
      callbackRef.current(lastMessage.type, lastMessage.data);
    }
  }, [lastMessage, messageTypes]);
}

// Hook: 自动刷新数据
export function useAutoRefresh(refreshCallback, intervalMs = 30000) {
  const { isConnected, lastMessage } = useSocket();
  const callbackRef = useRef(refreshCallback);
  
  useEffect(() => {
    callbackRef.current = refreshCallback;
  }, [refreshCallback]);

  // 收到更新消息时刷新
  useEffect(() => {
    if (lastMessage?.type === 'news-update' || lastMessage?.type === 'refresh-complete') {
      callbackRef.current();
    }
  }, [lastMessage]);

  // 定时刷新
  useEffect(() => {
    if (!isConnected || intervalMs <= 0) return;
    
    const timer = setInterval(() => {
      callbackRef.current();
    }, intervalMs);
    
    return () => clearInterval(timer);
  }, [isConnected, intervalMs]);
}

export default SocketContext;
