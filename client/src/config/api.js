// API 配置 - 生产环境使用相对路径（通过 Nginx 反向代理）
// 在浏览器中，/api/ 会被 Nginx 代理到后端 3002 端口

const getBaseUrl = () => {
  // HTTP API 始终走同源地址：开发环境由 CRA proxy 转发，生产环境由 Nginx 转发。
  return process.env.REACT_APP_API_BASE_URL || '';
};

const getSocketUrl = () => {
  // 运行时检测
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://localhost:3002';
  }
  // 生产环境：使用当前域名
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
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
  ANALYTICS_DIVERSITY_REVIEW: `${API_BASE_URL}/api/analytics/diversity-review`,
  ANALYTICS_TRENDS: `${API_BASE_URL}/api/analytics/trends`,
  ANALYTICS_SMART_TRENDS: `${API_BASE_URL}/api/analytics/smart-trends`,
  ANALYTICS_DAILY_TRENDS: `${API_BASE_URL}/api/analytics/daily-trends`,
  CONTENT_CAPABILITIES: `${API_BASE_URL}/api/content/v1/capabilities`,
  CONTENT_BRIEF: `${API_BASE_URL}/api/content/v1/brief`,
  CONTENT_GENERATE: `${API_BASE_URL}/api/content/v1/generate`,
  CONTENT_TRENDS: `${API_BASE_URL}/api/content/v1/trends`,
  CONTENT_SOURCES: `${API_BASE_URL}/api/content/v1/sources`,
  CONTENT_SOURCE_HEALTH: `${API_BASE_URL}/api/content/v1/source-health`,
  AGENT_STATUS: `${API_BASE_URL}/api/agent/status`,
  AGENT_CHAT: `${API_BASE_URL}/api/agent/chat`,
  GLOSSARY: `${API_BASE_URL}/api/glossary`,
  GLOSSARY_CATEGORIES: `${API_BASE_URL}/api/glossary/categories`,
  ADMIN_SOURCES: `${API_BASE_URL}/api/admin/sources`,
  ADMIN_VERIFY: `${API_BASE_URL}/api/admin/verify`,
  ADMIN_OVERVIEW: `${API_BASE_URL}/api/admin/overview`,
  ADMIN_CONTACTS: `${API_BASE_URL}/api/admin/contacts`,
  ADMIN_RESET_SOURCES: `${API_BASE_URL}/api/admin/sources/reset`,
  ADMIN_REFRESH: `${API_BASE_URL}/api/admin/refresh`,
  ADMIN_RECOVERY: `${API_BASE_URL}/api/admin/recovery`,
  ADMIN_LOGS: `${API_BASE_URL}/api/admin/logs`,
  HEALTH: `${API_BASE_URL}/health`,
  // 认证端点
  AUTH_REGISTER: `${API_BASE_URL}/api/auth/register`,
  AUTH_LOGIN: `${API_BASE_URL}/api/auth/login`,
  AUTH_LOGOUT: `${API_BASE_URL}/api/auth/logout`,
  AUTH_STATUS: `${API_BASE_URL}/api/auth/status`,
  AUTH_ME: `${API_BASE_URL}/api/auth/me`,
};
