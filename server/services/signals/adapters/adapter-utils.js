const axios = require('axios');

const USER_AGENT = 'AyaNews/2.0 (+https://ainews.xiaotianaya.com)';

function defaultHttp() {
  return axios;
}

function requestHeaders(extra = {}) {
  return {
    Accept: 'application/json, application/atom+xml, application/rss+xml, text/xml;q=0.9, */*;q=0.8',
    'User-Agent': USER_AGENT,
    ...extra
  };
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedLimit(value, fallback = 20, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

module.exports = {
  USER_AGENT,
  boundedLimit,
  defaultHttp,
  requestHeaders,
  stripHtml
};
