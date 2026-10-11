const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

const ALLOWED_SOURCE_IDS = new Set(['weibo', 'bilibili', 'zhihu', 'toutiao', 'baidu']);
const ALLOWED_HOSTS = {
  weibo: ['weibo.com', 'www.weibo.com', 'm.weibo.cn', 's.weibo.com'],
  bilibili: ['bilibili.com', 'www.bilibili.com', 'b23.tv'],
  zhihu: ['zhihu.com', 'www.zhihu.com', 'zhuanlan.zhihu.com'],
  toutiao: ['toutiao.com', 'www.toutiao.com'],
  baidu: ['baidu.com', 'www.baidu.com']
};

function isAllowedEvidenceUrl(rawUrl, sourceId) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return (ALLOWED_HOSTS[sourceId] || []).some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

class NewsNowAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
  }

  async collect(source, options = {}) {
    if (!source?.configured || !source?.endpoint) return { status: 'unconfigured', items: [] };
    if (!ALLOWED_SOURCE_IDS.has(source.sourceId)) throw new TypeError('NewsNow source id 不在允许列表');
    const limit = boundedLimit(options.limit, 30, 100);
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: { id: source.sourceId },
      maxContentLength: 2 * 1024 * 1024
    });
    const rows = response.data?.items || response.data?.data?.items || response.data?.data || [];
    const collectedAt = new Date().toISOString();
    const items = (Array.isArray(rows) ? rows : []).slice(0, limit).map((item, index) => {
      const evidenceUrl = item.url || item.mobileUrl;
      return {
        externalId: String(item.id || evidenceUrl || `${source.sourceId}-${index + 1}`),
        kind: 'hot_rank',
        title: item.title,
        summary: item.description || item.extra?.info || null,
        url: evidenceUrl,
        author: item.author || source.name || null,
        publishedAt: item.publishedAt || item.published_at || collectedAt,
        metrics: { rank: item.rank ?? index + 1 },
        tags: [source.sourceId],
        raw: item
      };
    }).filter((item) => item.title && isAllowedEvidenceUrl(item.url, source.sourceId));
    return { status: 'success', items };
  }
}

NewsNowAdapter.isAllowedEvidenceUrl = isAllowedEvidenceUrl;
module.exports = NewsNowAdapter;
