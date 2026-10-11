const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

class XAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.env = options.env || process.env;
  }

  async collect(source, options = {}) {
    const bearer = this.env.X_BEARER_TOKEN;
    if (!source?.configured || !bearer) return { status: 'unconfigured', items: [] };
    const limit = Math.max(10, boundedLimit(options.limit, 20, 100));
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders({ Authorization: `Bearer ${bearer}` }),
      params: {
        query: '(AI OR LLM OR "AI agent") -is:retweet',
        max_results: limit,
        expansions: 'author_id',
        'tweet.fields': 'created_at,lang,public_metrics,entities',
        'user.fields': 'username,name'
      }
    });
    const users = new Map((response.data?.includes?.users || []).map((user) => [user.id, user]));
    const items = (response.data?.data || []).map((post) => {
      const user = users.get(post.author_id);
      const metrics = post.public_metrics || {};
      return {
        externalId: post.id,
        kind: 'social_post',
        title: String(post.text || '').slice(0, 240),
        summary: post.text || null,
        url: `https://x.com/${user?.username || 'i'}/status/${post.id}`,
        author: user?.username || post.author_id || null,
        publishedAt: post.created_at,
        language: post.lang || null,
        metrics: {
          views: metrics.impression_count ?? null,
          likes: metrics.like_count ?? null,
          replies: metrics.reply_count ?? null,
          reposts: metrics.repost_count ?? null,
          shares: (metrics.repost_count ?? 0) + (metrics.quote_count ?? 0)
        },
        tags: (post.entities?.hashtags || []).map((tag) => tag.tag).filter(Boolean),
        raw: post
      };
    }).filter((item) => item.title && item.publishedAt);
    return { status: 'success', items, nextToken: response.data?.meta?.next_token || null };
  }
}

module.exports = XAdapter;
