const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, normalizeRateLimitReset, readJsonResponse } = require('./connector-utils');

class XConnector {
  constructor(options = {}) {
    this.platform = 'x';
    this.env = options.env || process.env;
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
  }

  async collect(account, options = {}) {
    const bearer = this.env.X_BEARER_TOKEN;
    if (!bearer) return { status: 'unconfigured', posts: [] };
    const url = new URL(`/2/users/${encodeURIComponent(account.externalAccountId)}/tweets`, 'https://api.x.com');
    url.searchParams.set('max_results', '100');
    url.searchParams.set('exclude', 'retweets');
    url.searchParams.set('tweet.fields', 'created_at,lang,public_metrics,entities,edit_history_tweet_ids');
    if (options.cursor) url.searchParams.set('pagination_token', options.cursor);
    const response = await fetchWithTimeout(this.fetchImpl, url, {
      headers: { authorization: `Bearer ${bearer}` },
      signal: options.signal
    }, this.timeoutMs);
    const data = await readJsonResponse(response, new Date(this.now()));
    const posts = (data.data || []).map((post) => ({
      externalPostId: post.id,
      url: `https://x.com/${encodeURIComponent(account.handle || 'i')}/status/${encodeURIComponent(post.id)}`,
      title: String(post.text || '').slice(0, 240),
      text: post.text || '',
      contentType: 'post',
      publishedAt: post.created_at,
      editedAt: null,
      language: post.lang || 'und',
      verticalIds: account.verticalIds || [],
      sourceConfidence: 'official',
      provenanceUrl: account.profileUrl,
      metrics: {
        views: post.public_metrics?.impression_count,
        likes: post.public_metrics?.like_count,
        comments: post.public_metrics?.reply_count,
        shares: post.public_metrics
          ? (Number(post.public_metrics.retweet_count) || 0) + (Number(post.public_metrics.quote_count) || 0)
          : null,
        bookmarks: post.public_metrics?.bookmark_count
      }
    }));
    const nextCursor = data.meta?.next_token || null;
    return normalizeCreatorPage({
      account, posts, nextCursor, exhausted: !nextCursor,
      rateLimit: {
        remaining: response.headers.get('x-rate-limit-remaining'),
        resetAt: normalizeRateLimitReset(response.headers.get('x-rate-limit-reset'))
      },
      collectedAt: this.now()
    }, { now: this.now() });
  }
}
module.exports = XConnector;
