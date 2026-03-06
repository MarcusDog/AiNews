import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// 存储键
const FAVORITES_KEY = 'ainews-favorites';
const READ_HISTORY_KEY = 'ainews-read-history';
const MAX_READ_HISTORY = 500;

// Context
const UserDataContext = createContext(null);

// Provider组件
export const UserDataProvider = ({ children }) => {
  // 收藏状态
  const [favorites, setFavorites] = useState([]);
  
  // 阅读历史（只存储ID和时间戳，减少存储空间）
  const [readHistory, setReadHistory] = useState([]);
  
  // 初始化加载
  useEffect(() => {
    loadFavorites();
    loadReadHistory();
  }, []);

  // 加载收藏
  const loadFavorites = () => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        setFavorites(JSON.parse(saved));
      }
    } catch (error) {
      console.error('加载收藏失败:', error);
    }
  };

  // 加载阅读历史
  const loadReadHistory = () => {
    try {
      const saved = localStorage.getItem(READ_HISTORY_KEY);
      if (saved) {
        setReadHistory(JSON.parse(saved));
      }
    } catch (error) {
      console.error('加载阅读历史失败:', error);
    }
  };

  // 保存收藏
  const saveFavorites = useCallback((newFavorites) => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.error('保存收藏失败:', error);
    }
  }, []);

  // 保存阅读历史
  const saveReadHistory = useCallback((newHistory) => {
    try {
      localStorage.setItem(READ_HISTORY_KEY, JSON.stringify(newHistory));
      setReadHistory(newHistory);
    } catch (error) {
      console.error('保存阅读历史失败:', error);
    }
  }, []);

  // 添加收藏
  const addFavorite = useCallback((news) => {
    if (!news || !news.id) return false;
    
    // 检查是否已收藏
    if (favorites.some(f => f.id === news.id)) {
      return false;
    }
    
    const newFavorite = {
      id: news.id,
      title: news.title,
      description: news.description,
      url: news.url,
      publishedAt: news.publishedAt,
      category: news.category,
      source: news.source,
      imageUrl: news.imageUrl,
      favoritedAt: Date.now()
    };
    
    const newFavorites = [newFavorite, ...favorites];
    saveFavorites(newFavorites);
    return true;
  }, [favorites, saveFavorites]);

  // 移除收藏
  const removeFavorite = useCallback((newsId) => {
    const newFavorites = favorites.filter(f => f.id !== newsId);
    saveFavorites(newFavorites);
    return true;
  }, [favorites, saveFavorites]);

  // 检查是否已收藏
  const isFavorite = useCallback((newsId) => {
    return favorites.some(f => f.id === newsId);
  }, [favorites]);

  // 切换收藏状态
  const toggleFavorite = useCallback((news) => {
    if (isFavorite(news.id)) {
      return removeFavorite(news.id);
    } else {
      return addFavorite(news);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  // 清空收藏
  const clearFavorites = useCallback(() => {
    saveFavorites([]);
  }, [saveFavorites]);

  // 标记为已读
  const markAsRead = useCallback((newsId) => {
    if (!newsId) return;
    
    // 检查是否已在历史中
    if (readHistory.some(r => r.id === newsId)) {
      // 更新时间戳
      const newHistory = readHistory.map(r => 
        r.id === newsId ? { ...r, readAt: Date.now() } : r
      );
      saveReadHistory(newHistory);
      return;
    }
    
    const newRecord = {
      id: newsId,
      readAt: Date.now()
    };
    
    // 限制历史记录数量
    let newHistory = [newRecord, ...readHistory];
    if (newHistory.length > MAX_READ_HISTORY) {
      newHistory = newHistory.slice(0, MAX_READ_HISTORY);
    }
    
    saveReadHistory(newHistory);
  }, [readHistory, saveReadHistory]);

  // 检查是否已读
  const isRead = useCallback((newsId) => {
    return readHistory.some(r => r.id === newsId);
  }, [readHistory]);

  // 清空阅读历史
  const clearReadHistory = useCallback(() => {
    saveReadHistory([]);
  }, [saveReadHistory]);

  // 获取阅读历史ID列表（用于批量检查）
  const getReadIds = useCallback(() => {
    return new Set(readHistory.map(r => r.id));
  }, [readHistory]);

  // 统计信息
  const getStats = useCallback(() => {
    return {
      favoritesCount: favorites.length,
      readCount: readHistory.length,
      todayReadCount: readHistory.filter(r => {
        const today = new Date();
        const readDate = new Date(r.readAt);
        return readDate.toDateString() === today.toDateString();
      }).length
    };
  }, [favorites, readHistory]);

  const value = {
    // 收藏相关
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    
    // 阅读历史相关
    readHistory,
    markAsRead,
    isRead,
    clearReadHistory,
    getReadIds,
    
    // 统计
    getStats
  };

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  );
};

// Hook
export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};

export default UserDataContext;
