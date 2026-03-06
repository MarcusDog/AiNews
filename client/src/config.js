// API 配置
// 根据环境自动选择 API 地址
const getApiUrl = () => {
  // 如果在 Docker 中，使用完整 URL
  if (process.env.NODE_ENV === 'production') {
    // 生产环境使用后端服务地址
    return 'http://localhost:3002';
  }
  // 开发环境使用相对路径（代理）
  return '';
};

export const API_BASE_URL = getApiUrl();

// WebSocket URL
export const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 
  (process.env.NODE_ENV === 'production' ? 'http://localhost:3002' : 'http://localhost:3002');

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