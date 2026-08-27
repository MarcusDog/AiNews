// API 配置 - 生产环境使用相对路径（通过 Nginx 反向代理）
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

const getApiUrl = () => {
  // 生产环境：使用相对路径，通过 Nginx 代理到后端
  // 开发环境：使用本地后端地址
  return isProduction ? '' : 'http://localhost:3002';
};

export const API_BASE_URL = getApiUrl();

// WebSocket URL - 生产环境使用当前域名
export const SOCKET_URL = isProduction 
  ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host
  : 'http://localhost:3002';

// API 端点
export const API_ENDPOINTS = {
  NEWS_LATEST: `${API_BASE_URL}/api/news/latest`,
  NEWS_CATEGORY: `${API_BASE_URL}/api/news/category`,
  NEWS_SEARCH: `${API_BASE_URL}/api/news/search`,
  NEWS_STATUS: `${API_BASE_URL}/api/news/status`,
  NEWS_UPDATE: `${API_BASE_URL}/api/news/update`,
  ANALYTICS_STATS: `${API_BASE_URL}/api/analytics/stats`,
  ANALYTICS_TRENDING: `${API_BASE_URL}/api/analytics/trending`,
  ANALYTICS_QUALITY: `${API_BASE_URL}/api/analytics/quality`,
  ANALYTICS_DIVERSITY: `${API_BASE_URL}/api/analytics/diversity`,
  ANALYTICS_TRENDS: `${API_BASE_URL}/api/analytics/trends`,
  ANALYTICS_SMART_TRENDS: `${API_BASE_URL}/api/analytics/smart-trends`,
  GLOSSARY: `${API_BASE_URL}/api/glossary`,
  GLOSSARY_CATEGORIES: `${API_BASE_URL}/api/glossary/categories`,
  ADMIN_SOURCES: `${API_BASE_URL}/api/admin/sources`,
  ADMIN_RESET_SOURCES: `${API_BASE_URL}/api/admin/sources/reset`,
  ADMIN_REFRESH: `${API_BASE_URL}/api/admin/refresh`,
  ADMIN_RECOVERY: `${API_BASE_URL}/api/admin/recovery`,
  ADMIN_LOGS: `${API_BASE_URL}/api/admin/logs`,
  HEALTH: `${API_BASE_URL}/health`,
};
