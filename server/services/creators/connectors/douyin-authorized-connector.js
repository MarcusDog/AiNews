const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, readJsonResponse } = require('./connector-utils');

class DouyinAuthorizedConnector {
  constructor(options = {}) {
    this.platform = 'douyin';
    this.env = options.env || process.env;
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
    this.endpoint = options.endpoint || 'https://open.douyin.com/api/douyin/v1/video/video_list/';
  }

  async collect(account, options = {}) {
    const token = this.env.DOUYIN_ACCESS_TOKEN;
    const openId = this.env.DOUYIN_OPEN_ID;
    if (!token || !openId) return { status: 'unconfigured', posts: [] };
    if (String(account.externalAccountId) !== String(openId)) {
      const error = new Error('Douyin connector can read only the account that granted authorization');
      error.code = 'permission_missing';
      throw error;
    }
    const url = new URL(this.endpoint);
    url.searchParams.set('open_id', openId);
    url.searchParams.set('count', '20');
    if (options.cursor) url.searchParams.set('cursor', options.cursor);
    const response = await fetchWithTimeout(this.fetchImpl, url, {
      headers: { 'access-token': token },
      signal: options.signal
    }, this.timeoutMs);
    const payload = await readJsonResponse(response, new Date(this.now()));
    if (payload.data?.error_code && payload.data.error_code !== 0) {
      const error = new Error('Douyin API rejected the authorized request');
      error.status = payload.data.error_code === 2190008 ? 401 : 403;
      throw error;
    }
    const posts = (payload.data?.list || []).filter((video) => Number(video.video_status) === 1).map((video) => ({
      externalPostId: video.item_id,
      url: video.share_url || `https://www.douyin.com/video/${encodeURIComponent(video.item_id)}`,
      title: video.title || '',
      text: video.title || '',
      contentType: 'short',
      publishedAt: new Date(Number(video.create_time) * 1000).toISOString(),
      editedAt: null,
      language: 'zh-CN',
      verticalIds: account.verticalIds || [],
      sourceConfidence: 'official',
      provenanceUrl: account.profileUrl,
      metrics: {
        views: video.statistics?.play_count,
        likes: video.statistics?.digg_count,
        comments: video.statistics?.comment_count,
        shares: video.statistics?.share_count
      }
    }));
    const nextCursor = payload.data?.has_more ? String(payload.data.cursor) : null;
    return normalizeCreatorPage({
      account, posts, nextCursor, exhausted: !payload.data?.has_more, rateLimit: null, collectedAt: this.now()
    }, { now: this.now() });
  }
}
module.exports = DouyinAuthorizedConnector;
