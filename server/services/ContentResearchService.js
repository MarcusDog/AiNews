const DefaultContentService = require('./ContentService');
const { parseBoundedInteger } = require('../utils/analytics');

function signalToArticle(signal) {
  const kind = String(signal.kind || '').toLowerCase();
  const trustClass = String(signal.sourceTrustClass || '').toLowerCase();
  const sourceGroup = trustClass === 'official' ? 'product' : kind === 'paper' ? 'research'
    : ['discussion', 'shared_link'].includes(kind) ? 'engineering' : 'media';
  return {
    id: signal.id, title: signal.title, description: signal.summary || '',
    source: signal.sourceName || signal.platform || 'Signal 来源', url: signal.url,
    publishedAt: signal.publishedAt || null, category: kind === 'paper' ? '新算法' : 'AI新闻',
    sourceGroup, region: signal.region === 'cn' ? 'cn' : 'global'
  };
}

class ContentResearchService {
  constructor(options = {}) {
    this.newsService = options.newsService;
    this.contentService = options.contentService || DefaultContentService;
    this.signalService = options.signalService || null;
    this.now = options.now || Date.now;
  }

  async buildBrief(query = {}, { signal } = {}) {
    signal?.throwIfAborted();
    const days = parseBoundedInteger(query.days, { fallback: 14, min: 1, max: 30 });
    const limit = parseBoundedInteger(query.limit, { fallback: 6, min: 3, max: 8 });
    const topicId = String(query.topicId || '').trim().slice(0, 120);
    const newsService = this.newsService || require('./NewsService');
    const news = await newsService.getAnalysisNews(500, { signal });
    signal?.throwIfAborted();
    const cutoff = this.now() - days * 86400000;
    const recent = news.data.filter((item) => {
      const time = new Date(item.publishedAt).getTime();
      return !Number.isNaN(time) && time >= cutoff;
    });
    let candidates = recent;
    if (topicId && this.signalService) {
      const topic = await this.signalService.getTopic(topicId, { windowHours: days * 24, signal });
      signal?.throwIfAborted();
      if (!topic) return { statusCode: 404, body: { success: false, error: 'topic_not_found' } };
      const signalArticles = (topic.signals || []).map(signalToArticle).filter((item) => item.url);
      const matchingNews = recent.filter((item) => this.contentService.matchesTopic(item, query.topic));
      const seenUrls = new Set();
      candidates = [...signalArticles, ...matchingNews].filter((item) => {
        if (!item.url || seenUrls.has(item.url)) return false;
        seenUrls.add(item.url); return true;
      });
    }
    const brief = this.contentService.buildBriefFromArticles(candidates, {
      topic: query.topic, audience: query.audience, goal: query.goal, format: query.format,
      limit, preselected: Boolean(topicId && this.signalService)
    });
    return { statusCode: brief.status === 'ready' ? 200 : 422, body: { success: brief.status === 'ready', data: brief } };
  }
}
module.exports = { ContentResearchService, signalToArticle };
