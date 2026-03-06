import { useEffect, useState, useCallback } from 'react';

/**
 * 自定义Hook：检测页面可见性变化
 * 当用户切换回页面时触发回调
 */
export function usePageVisibility(callback) {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      
      if (visible && callback) {
        callback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callback]);

  return isVisible;
}

/**
 * 自定义Hook：在组件挂载和页面变为可见时执行回调
 * 用于解决页面切换后需要手动刷新的问题
 */
export function useRefreshOnVisible(fetchCallback, deps = []) {
  // 页面挂载时执行
  useEffect(() => {
    fetchCallback();
  }, deps);

  // 页面从隐藏变为可见时执行
  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden) {
      fetchCallback();
    }
  }, [fetchCallback]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);
}

export default usePageVisibility;
