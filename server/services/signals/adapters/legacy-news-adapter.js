class LegacyNewsAdapter {
  constructor(options = {}) {
    this.newsProvider = options.newsProvider || (async ({ limit }) => {
      const NewsService = require('../../NewsService');
      return NewsService.getLatestNews({ page: 1, limit });
    });
  }

  async collect(source, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
    const result = await this.newsProvider({ limit });
    const rows = Array.isArray(result) ? result : result?.data || [];
    return rows.slice(0, limit).map((item) => ({
      externalId: item.id || item.url,
      kind: 'news',
      title: item.title,
      summary: item.description || null,
      url: item.url,
      author: item.author || item.source || null,
      publishedAt: item.publishedAt || item.published_at,
      metrics: {},
      tags: [item.category, item.source].filter(Boolean),
      raw: item
    })).filter((item) => item.title && item.url && item.publishedAt);
  }
}

module.exports = LegacyNewsAdapter;
