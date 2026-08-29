const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, readJsonResponse } = require('./connector-utils');

class InstagramConnector {
  constructor(options = {}) {
    this.platform = 'instagram';
    this.env = options.env || process.env;
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
    this.graphVersion = options.graphVersion || 'v23.0';
  }

  async collect(account, options = {}) {
    const token = this.env.INSTAGRAM_ACCESS_TOKEN;
    const viewerId = this.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    if (!token || !viewerId) return { status: 'unconfigured', posts: [] };
    const username = String(account.handle || '').replace(/^@/, '');
    if (!username) {
      const error = new Error('Instagram Business Discovery requires a reviewed username');
      error.code = 'permission_missing';
      throw error;
    }
    const pagination = options.cursor ? `.after(${options.cursor})` : '';
    const fields = `business_discovery.username(${username}){id,username,followers_count,media.limit(50)${pagination}{id,caption,media_type,permalink,timestamp,like_count,comments_count}}`;
    const url = new URL(`/${this.graphVersion}/${encodeURIComponent(viewerId)}`, 'https://graph.facebook.com');
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', token);
    const response = await fetchWithTimeout(this.fetchImpl, url, { signal: options.signal }, this.timeoutMs);
    const data = await readJsonResponse(response, new Date(this.now()));
    const discovery = data.business_discovery;
    if (!discovery || String(discovery.id) !== String(account.externalAccountId)) {
      const error = new Error('Instagram account is not eligible for Business Discovery');
      error.code = 'permission_missing';
      throw error;
    }
    const posts = (discovery.media?.data || []).map((media) => ({
      externalPostId: media.id,
      url: media.permalink,
      title: String(media.caption || '').slice(0, 240),
      text: media.caption || '',
      contentType: media.media_type === 'IMAGE' || media.media_type === 'CAROUSEL_ALBUM'
        ? 'image'
        : media.media_type === 'REELS' ? 'short' : 'video',
      publishedAt: media.timestamp,
      editedAt: null,
      language: 'und',
      verticalIds: account.verticalIds || [],
      sourceConfidence: 'official',
      provenanceUrl: account.profileUrl,
      metrics: {
        likes: media.like_count,
        comments: media.comments_count,
        followersAtCapture: discovery.followers_count
      },
      metadata: { mediaCount: media.media_type === 'CAROUSEL_ALBUM' ? null : 1 }
    }));
    const nextCursor = discovery.media?.paging?.next
      ? discovery.media?.paging?.cursors?.after || null
      : null;
    return normalizeCreatorPage({
      account, posts, nextCursor, exhausted: !nextCursor, rateLimit: null, collectedAt: this.now()
    }, { now: this.now() });
  }
}
module.exports = InstagramConnector;
