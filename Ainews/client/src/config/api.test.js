import { API_BASE_URL, API_ENDPOINTS, SOCKET_URL } from './api';

test('HTTP API stays same-origin while local WebSocket connects to the backend port', () => {
  expect(API_BASE_URL).toBe('');
  expect(API_ENDPOINTS.NEWS_LATEST).toBe('/api/news/latest');
  expect(API_ENDPOINTS.CONTENT_GENERATE).toBe('/api/content/v1/generate');
  expect(API_ENDPOINTS.ANALYTICS_DIVERSITY_REVIEW).toBe('/api/analytics/diversity-review');
  expect(API_ENDPOINTS.ADMIN_VERIFY).toBe('/api/admin/verify');
  expect(API_ENDPOINTS.ADMIN_OVERVIEW).toBe('/api/admin/overview');
  expect(SOCKET_URL).toBe('http://localhost:3002');
});
