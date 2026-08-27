const RSSParser = require('rss-parser');
const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

class RssSignalAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.parser = options.parser || new RSSParser();
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 30, 100);
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders({ Accept: 'application/atom+xml, application/rss+xml, text/xml;q=0.9' }),
      responseType: 'text',
      maxContentLength: 2 * 1024 * 1024
    });
    const feed = await this.parser.parseString(response.data);
    return (feed.items || []).slice(0, limit).map((item) => ({
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
