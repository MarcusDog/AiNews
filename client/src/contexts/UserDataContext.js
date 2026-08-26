import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { createFavoriteSnapshot, readStoredArray, updateReadHistory } from '../utils/userData';

const FAVORITES_KEY = 'ainews-favorites';
const READ_HISTORY_KEY = 'ainews-read-history';
const UserDataContext = createContext(null);

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '同步用户数据失败');
  return payload.data;
}

export const UserDataProvider = ({ children }) => {
  const { user, isReady: isAuthReady } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [readHistory, setReadHistory] = useState([]);
  const [syncError, setSyncError] = useState('');

  const saveGuestFavorites = useCallback((next) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }, []);

  const saveGuestReadHistory = useCallback((next) => {
    localStorage.setItem(READ_HISTORY_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    if (!isAuthReady) return undefined;
    let cancelled = false;
    setFavorites([]);
    setReadHistory([]);
    setSyncError('');

    if (!user) {
      setFavorites(readStoredArray(FAVORITES_KEY));
      setReadHistory(readStoredArray(READ_HISTORY_KEY));
      return undefined;
    }

    const migrationKey = `ainews-user-data-migrated:${user.id}`;
    const legacyFavorites = readStoredArray(FAVORITES_KEY);
    const legacyHistory = readStoredArray(READ_HISTORY_KEY);
    const shouldImport = !localStorage.getItem(migrationKey) && (legacyFavorites.length || legacyHistory.length);

    (async () => {
      try {
        const data = shouldImport
          ? await apiRequest('/api/user-data/import', {
              method: 'POST',
              body: JSON.stringify({ favorites: legacyFavorites, readHistory: legacyHistory })
            })
          : await apiRequest('/api/user-data');
        if (cancelled) return;
        setFavorites(data.favorites || []);
        setReadHistory(data.readHistory || []);
        if (shouldImport) {
          localStorage.setItem(migrationKey, '1');
          localStorage.removeItem(FAVORITES_KEY);
          localStorage.removeItem(READ_HISTORY_KEY);
        }
      } catch (error) {
        if (!cancelled) setSyncError(error.message);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthReady, user]);

  const addFavorite = useCallback((news) => {
    if (!news?.id || !news?.title || favorites.some((item) => item.id === news.id)) return false;
    const snapshot = createFavoriteSnapshot(news);
    const next = [snapshot, ...favorites];
    setFavorites(next);
    if (user) {
      apiRequest('/api/user-data/favorites', {
        method: 'PUT',
        body: JSON.stringify({ article: snapshot })
      }).catch((error) => setSyncError(error.message));
    } else {
      saveGuestFavorites(next);
    }
    return true;
  }, [favorites, saveGuestFavorites, user]);

  const removeFavorite = useCallback((newsId) => {
    const next = favorites.filter((item) => item.id !== newsId);
    setFavorites(next);
    if (user) {
      apiRequest(`/api/user-data/favorites/${encodeURIComponent(newsId)}`, { method: 'DELETE' })
        .catch((error) => setSyncError(error.message));
    } else {
      saveGuestFavorites(next);
    }
    return true;
  }, [favorites, saveGuestFavorites, user]);

  const isFavorite = useCallback((newsId) => favorites.some((item) => item.id === newsId), [favorites]);

  const toggleFavorite = useCallback((news) => (
    isFavorite(news.id) ? removeFavorite(news.id) : addFavorite(news)
  ), [addFavorite, isFavorite, removeFavorite]);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
    if (user) {
      apiRequest('/api/user-data/favorites', { method: 'DELETE' }).catch((error) => setSyncError(error.message));
    } else {
      saveGuestFavorites([]);
    }
  }, [saveGuestFavorites, user]);

  const markAsRead = useCallback((newsId) => {
    if (!newsId) return;
    const readAt = Date.now();
    setReadHistory((current) => {
      const next = updateReadHistory(current, newsId, readAt);
      if (!user) saveGuestReadHistory(next);
      return next;
    });
    if (user) {
      apiRequest(`/api/user-data/read-history/${encodeURIComponent(newsId)}`, {
        method: 'POST',
        body: JSON.stringify({ readAt })
      }).catch((error) => setSyncError(error.message));
    }
  }, [saveGuestReadHistory, user]);

  const isRead = useCallback((newsId) => readHistory.some((item) => item.id === newsId), [readHistory]);

  const clearReadHistory = useCallback(() => {
    setReadHistory([]);
    if (user) {
      apiRequest('/api/user-data/read-history', { method: 'DELETE' }).catch((error) => setSyncError(error.message));
    } else {
      saveGuestReadHistory([]);
    }
  }, [saveGuestReadHistory, user]);

  const getReadIds = useCallback(() => new Set(readHistory.map((item) => item.id)), [readHistory]);
  const getStats = useCallback(() => ({
    favoritesCount: favorites.length,
    readCount: readHistory.length,
    todayReadCount: readHistory.filter((item) => new Date(item.readAt).toDateString() === new Date().toDateString()).length
  }), [favorites, readHistory]);

  const value = useMemo(() => ({
    favorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    readHistory,
    markAsRead,
    isRead,
    clearReadHistory,
    getReadIds,
    getStats,
    syncError
  }), [addFavorite, clearFavorites, clearReadHistory, favorites, getReadIds, getStats, isFavorite, isRead, markAsRead, readHistory, removeFavorite, syncError, toggleFavorite]);

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (!context) throw new Error('useUserData must be used within a UserDataProvider');
  return context;
};

export default UserDataContext;
