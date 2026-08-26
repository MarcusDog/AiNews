import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || '请求失败');
    error.status = response.status;
    throw error;
  }

  return payload;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    return readResponse(response);
  }, []);

  const refreshSession = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const payload = await request('/api/auth/me', { method: 'GET' });
      setUser(payload.data.user);
      setAuthError(null);
      return payload.data.user;
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        setAuthError(null);
        return null;
      }

      setAuthError(error.message);
      throw error;
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      setIsReady(true);
    }
  }, [request]);

  useEffect(() => {
    refreshSession().catch(() => {});
  }, [refreshSession]);

  const login = useCallback(async ({ email, password }) => {
    setIsLoading(true);
    try {
      const payload = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setUser(payload.data.user);
      setAuthError(null);
      return payload.data.user;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, [request]);

  const register = useCallback(async ({ email, password, displayName }) => {
    setIsLoading(true);
    try {
      const payload = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName })
      });

      setUser(payload.data.user);
      setAuthError(null);
      return payload.data.user;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, [request]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await request('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setAuthError(null);
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, [request]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const updateProfile = useCallback(async ({ displayName }) => {
    setIsLoading(true);
    try {
      const payload = await request('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName })
      });

      setUser(payload.data.user);
      setAuthError(null);
      return payload.data.user;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, [request]);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    setIsLoading(true);
    try {
      const payload = await request('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      setUser(payload.data.user);
      setAuthError(null);
      return payload.data.user;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
      setIsReady(true);
    }
  }, [request]);

  const value = useMemo(() => ({
    user,
    authError,
    isLoading,
    isReady,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    refreshSession,
    clearAuthError
  }), [authError, changePassword, clearAuthError, isLoading, isReady, login, logout, refreshSession, register, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
