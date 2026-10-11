const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, readJsonResponse } = require('./connector-utils');

class RedditConnector {
  constructor(options = {}) {
    this.platform = 'reddit';
    this.env = options.env || process.env;
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
  }

  configured() {
    return Boolean(this.env.REDDIT_CLIENT_ID && this.env.REDDIT_CLIENT_SECRET);
  }

  async request(url, options = {}) {
    return fetchWithTimeout(this.fetchImpl, url, options, this.timeoutMs);
  }

  async accessToken(signal) {
    const basic = Buffer.from(`${this.env.REDDIT_CLIENT_ID}:${this.env.REDDIT_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams(
      this.env.REDDIT_REFRESH_TOKEN
        ? { grant_type: 'refresh_token', refresh_token: this.env.REDDIT_REFRESH_TOKEN }
        : { grant_type: 'client_credentials' }
    );
    const response = await this.request('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'AyaNewsCreator/1.0'
      },
      body,
      signal
    });
    const data = await readJsonResponse(response, new Date(this.now()));
    if (!data.access_token) {
      const error = new Error('reddit OAuth token unavailable');
      error.status = 401;
      throw error;
    }
    return data.access_token;
  }

  async collect(account, options = {}) {
    if (!this.configured()) return { status: 'unconfigured', posts: [] };
    const token = await this.accessToken(options.signal);
    const username = account.handle || account.externalAccountId;
    const url = new URL(`/user/${encodeURIComponent(username)}/submitted`, 'https://oauth.reddit.com');
    url.searchParams.set('limit', '100');
    url.searchParams.set('raw_json', '1');
    if (options.cursor) url.searchParams.set('after', options.cursor);
    const response = await this.request(url, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'AyaNewsCreator/1.0' },
      signal: options.signal
    });
    const data = await readJsonResponse(response, new Date(this.now()));
    const posts = (data.data?.children || []).flatMap((entry) => {
      const post = entry.data;
      if (!post?.name || !post.permalink || !post.created_utc) return [];
      return [{
        externalPostId: post.name,
        url: new URL(post.permalink, 'https://www.reddit.com').toString(),
        title: post.title || '',
        text: post.selftext || '',
        contentType: post.is_video ? 'video' : post.is_self ? 'post' : 'article',
        publishedAt: new Date(Number(post.created_utc) * 1000).toISOString(),
        editedAt: typeof post.edited === 'number' ? new Date(post.edited * 1000).toISOString() : null,
        language: 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'official',
        provenanceUrl: account.profileUrl,
        metrics: { likes: post.score, comments: post.num_comments },
        metadata: { isSponsored: Boolean(post.promoted) }
      }];
    });
    const nextCursor = data.data?.after || null;
    return normalizeCreatorPage({
      account, posts, nextCursor, exhausted: !nextCursor,
      rateLimit: {
        remaining: response.headers.get('x-ratelimit-remaining'),
        resetAt: null,
        retryAfterMs: null
      },
      collectedAt: this.now()
    }, { now: this.now() });
  }
}
module.exports = RedditConnector;
