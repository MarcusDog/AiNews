const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

class HackerNewsAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 30, 100);
    const now = options.now ? new Date(options.now) : new Date();
    const cutoff = Math.floor((now.getTime() - 72 * 3600000) / 1000);
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: {
        query: 'AI OR LLM OR agent',
        tags: 'story',
        numericFilters: `created_at_i>${cutoff}`,
        hitsPerPage: limit
      }
    });

    return (response.data?.hits || []).slice(0, limit).filter((item) => item?.title && item?.objectID).map((item) => ({
      externalId: String(item.objectID),
      kind: item._tags?.includes('show_hn') ? 'project' : 'discussion',
      title: item.title,
      summary: item.story_text || null,
      url: item.url || `https://news.ycombinator.com/item?id=${item.objectID}`,
      author: item.author || null,
      publishedAt: item.created_at,
      metrics: {
        points: item.points ?? null,
        comments: item.num_comments ?? null
      },
      tags: item._tags || [],
      raw: item
    }));
  }
}

module.exports = HackerNewsAdapter;
