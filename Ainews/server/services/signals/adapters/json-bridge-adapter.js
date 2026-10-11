const net = require('node:net');
const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

function isPrivateHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
  if (net.isIP(normalized)) {
    return normalized.startsWith('127.') || normalized.startsWith('10.') || normalized.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || normalized === '::1';
  }
  return false;
}

function safeBridgeUrl(value, allowPrivate = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!allowPrivate && isPrivateHostname(url.hostname)) return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function parseBridgeConfig(env) {
  try {
    const parsed = JSON.parse(env.SIGNAL_BRIDGES_JSON || '[]');
    if (!Array.isArray(parsed)) return [];
    const allowPrivate = env.SIGNAL_BRIDGES_ALLOW_PRIVATE === '1';
    return parsed.map((item) => ({
      id: String(item?.id || '').trim(),
      url: safeBridgeUrl(item?.url, allowPrivate)
    })).filter((item) => item.id && item.url);
  } catch {
    return [];
  }
}

function validBridgeItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!String(item.title || '').trim()) return false;
  try {
    const url = new URL(item.url);
    const published = new Date(item.publishedAt || item.published_at);
    return url.protocol === 'https:' && !Number.isNaN(published.getTime());
  } catch {
    return false;
  }
}

class JsonBridgeAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.env = options.env || process.env;
  }

  async collect(source, options = {}) {
    const bridges = parseBridgeConfig(this.env);
    if (!source?.configured || bridges.length === 0) return { status: 'unconfigured', items: [] };
    const limit = boundedLimit(options.limit, 50, 200);
    const items = [];
    const errors = [];
    for (const bridge of bridges) {
      try {
        const response = await this.http.get(bridge.url, {
          timeout: source.timeoutMs,
          headers: requestHeaders({ Accept: 'application/json' }),
          responseType: 'json',
          maxContentLength: 2 * 1024 * 1024
        });
        const rows = response.data?.signals || response.data?.items || response.data?.data || [];
        for (const item of Array.isArray(rows) ? rows : []) {
          if (!validBridgeItem(item) || items.length >= limit) continue;
          items.push({
            externalId: item.externalId || item.external_id || item.id || item.url,
            platform: String(item.platform || 'custom').toLowerCase(),
            region: item.region === 'cn' ? 'cn' : 'global',
            kind: item.kind || 'social_post',
            title: item.title,
            summary: item.summary || item.description || null,
            url: item.url,
            author: item.author || null,
            publishedAt: item.publishedAt || item.published_at,
            metrics: item.metrics || {},
            tags: Array.isArray(item.tags) ? item.tags : [],
            repoFullName: item.repoFullName || item.repo_full_name || null,
            raw: { bridgeId: bridge.id, item }
          });
        }
      } catch (error) {
        errors.push({ bridgeId: bridge.id, error: String(error.message || error).slice(0, 240) });
      }
    }
    return { status: errors.length && !items.length ? 'failure' : 'success', items, errors };
  }
}

JsonBridgeAdapter.parseBridgeConfig = parseBridgeConfig;
JsonBridgeAdapter.safeBridgeUrl = safeBridgeUrl;
module.exports = JsonBridgeAdapter;
