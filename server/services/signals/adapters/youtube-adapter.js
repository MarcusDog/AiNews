const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

class YouTubeAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.env = options.env || process.env;
  }

  async collect(source, options = {}) {
    const apiKey = this.env.YOUTUBE_API_KEY;
    if (!source?.configured || !apiKey) return { status: 'unconfigured', items: [] };
    const limit = boundedLimit(options.limit, 20, 50);
    const publishedAfter = new Date(
      (options.now ? new Date(options.now) : new Date()).getTime() - 72 * 3600000
    ).toISOString();
    const search = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: {
        key: apiKey,
        part: 'snippet',
        type: 'video',
        q: 'AI OR LLM OR AI Agent',
        order: 'date',
        publishedAfter,
        maxResults: limit
      }
    });
    const searchItems = (search.data?.items || []).filter((item) => item?.id?.videoId);
    if (!searchItems.length) return { status: 'success', items: [], quotaCost: 1 };
    const ids = searchItems.map((item) => item.id.videoId);
    const stats = await this.http.get(source.endpoint.replace(/\/search$/, '/videos'), {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: {
        key: apiKey,
        part: 'statistics',
        id: ids.join(',')
      }
    });
    const statsById = new Map((stats.data?.items || []).map((item) => [item.id, item.statistics || {}]));
    const items = searchItems.map((item) => {
      const videoId = item.id.videoId;
      const statistics = statsById.get(videoId) || {};
      return {
        externalId: videoId,
        kind: 'video',
        title: item.snippet?.title,
        summary: item.snippet?.description || null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        author: item.snippet?.channelTitle || null,
        publishedAt: item.snippet?.publishedAt,
        metrics: {
          views: statistics.viewCount == null ? null : Number(statistics.viewCount),
          likes: statistics.likeCount == null ? null : Number(statistics.likeCount),
          comments: statistics.commentCount == null ? null : Number(statistics.commentCount)
        },
        tags: item.snippet?.tags || [],
        raw: { search: item, statistics }
      };
    });
    return { status: 'success', items, quotaCost: 2 };
  }
}

module.exports = YouTubeAdapter;
