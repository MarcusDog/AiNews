const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, normalizeRateLimitReset, readJsonResponse } = require('./connector-utils');

function parseAtUri(uri) {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(String(uri || ''));
  return match ? { did: match[1], rkey: match[2] } : null;
}

class BlueskyConnector {
  constructor(options = {}) {
    this.fetchImpl = createConnectorFetch(options);
    this.baseUrl = options.baseUrl || 'https://public.api.bsky.app';
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
  }

  async collect(account, options = {}) {
    const url = new URL('/xrpc/app.bsky.feed.getAuthorFeed', this.baseUrl);
    url.searchParams.set('actor', account.externalAccountId);
    url.searchParams.set('limit', '100');
    if (options.cursor) url.searchParams.set('cursor', options.cursor);
    const response = await fetchWithTimeout(this.fetchImpl, url, { signal: options.signal }, this.timeoutMs);
    const data = await readJsonResponse(response, new Date(this.now()));
    const posts = (data.feed || []).flatMap((entry) => {
      const post = entry.post;
      const identity = parseAtUri(post?.uri);
      if (!post || !identity) return [];
      const isShared = post.author?.did && post.author.did !== account.externalAccountId;
      return [{
        externalPostId: post.uri,
        url: `https://bsky.app/profile/${identity.did}/post/${encodeURIComponent(identity.rkey)}`,
        title: String(post.record?.text || '').slice(0, 180),
        text: post.record?.text || '',
        contentType: post.record?.reply ? 'thread' : 'post',
        publishedAt: post.record?.createdAt || post.indexedAt,
        editedAt: null,
        language: post.record?.langs?.[0] || 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'public',
        provenanceUrl: account.profileUrl,
        metrics: {
          likes: post.likeCount,
          comments: post.replyCount,
          shares: post.repostCount
        },
        sharedFrom: isShared ? {
          platform: 'bluesky',
          externalAccountId: post.author.did,
          externalPostId: post.uri,
          url: `https://bsky.app/profile/${identity.did}/post/${encodeURIComponent(identity.rkey)}`,
          displayName: post.author.displayName || post.author.handle || post.author.did
        } : null
      }];
    });
    return normalizeCreatorPage({
      account, posts, nextCursor: data.cursor || null, exhausted: !data.cursor,
      rateLimit: {
        remaining: response.headers.get('ratelimit-remaining'),
        resetAt: normalizeRateLimitReset(response.headers.get('ratelimit-reset'))
      },
      collectedAt: this.now()
    }, { now: this.now() });
  }
}

module.exports = BlueskyConnector;
