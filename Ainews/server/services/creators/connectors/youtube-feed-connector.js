const Parser = require('rss-parser');
const { normalizeCreatorPage } = require('../creator-normalizer');
const {
  createConnectorFetch,
  fetchWithTimeout,
  readJsonResponse,
  readTextResponse
} = require('./connector-utils');

class YoutubeFeedConnector {
  constructor(options = {}) {
    this.fetchImpl = createConnectorFetch(options);
    this.apiKey = options.apiKey || null;
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
    this.parser = options.parser || new Parser({
      customFields: {
        item: [['yt:videoId', 'videoId'], ['yt:channelId', 'channelId'], ['updated', 'updated']]
      }
    });
  }

  request(url, options = {}) {
    return fetchWithTimeout(this.fetchImpl, url, options, this.timeoutMs);
  }

  async collect(account, options = {}) {
    if (options.history && this.apiKey) return this.collectHistory(account, options);
    const feedUrl = account.feedUrl
      || `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(account.externalAccountId)}`;
    const headers = {};
    if (options.cursor) headers['if-none-match'] = options.cursor;
    const response = await this.request(feedUrl, { headers, signal: options.signal });
    if (response.status === 304) {
      const unchanged = normalizeCreatorPage({
        account, posts: [], nextCursor: options.cursor, exhausted: true, rateLimit: null, collectedAt: this.now()
      }, { now: this.now() });
      if (options.history && !this.apiKey) {
        unchanged.partialReason = 'youtube_data_api_key_required_for_full_history';
      }
      return unchanged;
    }
    const xml = await readTextResponse(response, new Date(this.now()));
    const feed = await this.parser.parseString(xml);
    const posts = (feed.items || []).map((item) => {
      const externalPostId = item.videoId || String(item.guid || '').replace(/^yt:video:/, '');
      return {
        externalPostId,
        url: item.link || `https://www.youtube.com/watch?v=${encodeURIComponent(externalPostId)}`,
        title: item.title || '',
        text: item.contentSnippet || item.content || '',
        contentType: 'video',
        publishedAt: item.isoDate || item.pubDate,
        editedAt: item.updated && Date.parse(item.updated) !== Date.parse(item.isoDate || item.pubDate)
          ? item.updated
          : null,
        language: 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'official',
        provenanceUrl: feedUrl,
        metrics: null,
        metadata: { etag: response.headers.get('etag') || null }
      };
    });
    const normalized = normalizeCreatorPage({
      account,
      posts,
      nextCursor: response.headers.get('etag') || null,
      exhausted: true,
      rateLimit: null,
      collectedAt: this.now()
    }, { now: this.now() });
    if (options.history && !this.apiKey) {
      normalized.partialReason = 'youtube_data_api_key_required_for_full_history';
    }
    return normalized;
  }

  async collectHistory(account, options = {}) {
    let uploadsPlaylistId = account.uploadsPlaylistId;
    if (!uploadsPlaylistId) {
      const channelsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
      channelsUrl.searchParams.set('part', 'contentDetails');
      channelsUrl.searchParams.set('id', account.externalAccountId);
      channelsUrl.searchParams.set('key', this.apiKey);
      const channelsResponse = await this.request(channelsUrl, { signal: options.signal });
      const channels = await readJsonResponse(channelsResponse, new Date(this.now()));
      uploadsPlaylistId = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) throw new Error(`YouTube uploads playlist unavailable for ${account.externalAccountId}`);
    }

    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.searchParams.set('part', 'snippet,contentDetails');
    playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.set('maxResults', '50');
    playlistUrl.searchParams.set('key', this.apiKey);
    if (options.cursor) playlistUrl.searchParams.set('pageToken', options.cursor);
    const playlistResponse = await this.request(playlistUrl, { signal: options.signal });
    const playlist = await readJsonResponse(playlistResponse, new Date(this.now()));
    const statistics = await this.loadStatistics(
      (playlist.items || []).map((item) => item.contentDetails?.videoId).filter(Boolean),
      options.signal
    );
    const posts = (playlist.items || []).map((item) => {
      const externalPostId = item.contentDetails?.videoId;
      const metric = statistics.get(externalPostId) || {};
      return {
        externalPostId,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(externalPostId)}`,
        title: item.snippet?.title || '',
        text: item.snippet?.description || '',
        contentType: 'video',
        publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt,
        editedAt: null,
        language: item.snippet?.defaultLanguage || 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'official',
        provenanceUrl: account.profileUrl,
        metrics: {
          views: metric.viewCount,
          likes: metric.likeCount,
          comments: metric.commentCount
        }
      };
    });
    return normalizeCreatorPage({
      account,
      posts,
      nextCursor: playlist.nextPageToken || null,
      exhausted: !playlist.nextPageToken,
      rateLimit: null,
      collectedAt: this.now()
    }, { now: this.now() });
  }

  async loadStatistics(videoIds, signal) {
    if (!videoIds.length) return new Map();
    const statisticsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statisticsUrl.searchParams.set('part', 'statistics');
    statisticsUrl.searchParams.set('id', videoIds.join(','));
    statisticsUrl.searchParams.set('key', this.apiKey);
    try {
      const response = await this.request(statisticsUrl, { signal });
      const data = await readJsonResponse(response, new Date(this.now()));
      return new Map((data.items || []).map((item) => [item.id, item.statistics || {}]));
    } catch {
      return new Map();
    }
  }
}

module.exports = YoutubeFeedConnector;
