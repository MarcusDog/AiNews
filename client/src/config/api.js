// API 配置 - 使用固定后端地址
// 在 Docker 部署中，前端通过 localhost:3003 访问，后端在 localhost:3002
const BACKEND_URL = 'http://localhost:3002';

const getBaseUrl = () => {
  // Docker 生产环境使用完整 URL
  return BACKEND_URL;
};

const getSocketUrl = () => {
  // WebSocket 使用相同地址
  return BACKEND_URL;
};

export const API_BASE_URL = getBaseUrl();
export const SOCKET_URL = getSocketUrl();

// API 端点
export const API_ENDPOINTS = {
  NEWS_LATEST: `${API_BASE_URL}/api/news/latest`,
  NEWS_CATEGORY: `${API_BASE_URL}/api/news/category`,
  NEWS_SEARCH: `${API_BASE_URL}/api/news/search`,
  NEWS_DETAIL: (id) => `${API_BASE_URL}/api/news/${id}`,
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