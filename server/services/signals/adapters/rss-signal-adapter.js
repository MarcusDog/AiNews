const RSSParser = require('rss-parser');
const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

const EXPLICIT_AI_PATTERN = /\b(ai|llm|chatgpt|claude|gemini|qwen|openai|anthropic|deepseek|machine learning|neural networks?|language models?|diffusion|agentic|multimodal|inference|transformers?)\b|人工智能|大模型|语言模型|智能体|生成式|多模态/i;

function isRelevantRedditItem(item, community) {
  if (String(community || '').toLowerCase() !== 'artificial') return true;
  const text = `${item.title || ''} ${item.contentSnippet || item.summary || ''} ${item.content || ''}`;
  return EXPLICIT_AI_PATTERN.test(text);
}

class RssSignalAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.parser = options.parser || new RSSParser();
    this.feedCache = new Map();
    this.cacheTtlMs = Number(options.cacheTtlMs) >= 0 ? Number(options.cacheTtlMs) : 60000;
  }

  async loadFeed(source) {
    const cacheable = source.platform === 'reddit';
    const cached = cacheable ? this.feedCache.get(source.endpoint) : null;
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders({ Accept: 'application/atom+xml, application/rss+xml, text/xml;q=0.9' }),
      responseType: 'text',
      maxContentLength: 2 * 1024 * 1024
    }).then((response) => this.parser.parseString(response.data));

    if (cacheable) {
      this.feedCache.set(source.endpoint, { expiresAt: Date.now() + this.cacheTtlMs, promise });
      promise.catch(() => {
        if (this.feedCache.get(source.endpoint)?.promise === promise) this.feedCache.delete(source.endpoint);
      });
    }
    return promise;
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 30, 100);
    const feed = await this.loadFeed(source);
    const items = source.platform === 'reddit' && source.community
      ? (feed.items || []).filter((item) => (
        String(item.link || '').toLowerCase().includes(`/r/${source.community.toLowerCase()}/`)
        && isRelevantRedditItem(item, source.community)
      ))
      : (feed.items || []);
    return items.slice(0, limit).map((item) => ({
      externalId: item.guid || item.id || item.link,
      kind: source.platform === 'reddit' ? 'discussion' : 'news',
      title: item.title,
      summary: item.contentSnippet || item.summary || item.content || null,
      url: item.link,
      author: item.creator || item.author || item['dc:creator'] || null,
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      metrics: {},
      tags: [source.community, ...(item.categories || [])].filter(Boolean),
      raw: item
    })).filter((item) => item.title && item.url);
  }
}

module.exports = RssSignalAdapter;
