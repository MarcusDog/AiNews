const Parser = require('rss-parser');
const cheerio = require('cheerio');
const { normalizeCreatorPage } = require('../creator-normalizer');
const {
  createConnectorFetch,
  decodeConnectorCursor,
  encodeConnectorCursor,
  fetchWithTimeout,
  readTextResponse
} = require('./connector-utils');

function publicText(value) {
  const $ = cheerio.load(`<main>${value || ''}</main>`);
  return $('main').text().replace(/\s+/g, ' ').trim();
}

class RssCreatorConnector {
  constructor(options = {}) {
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
    this.parser = options.parser || new Parser();
  }

  async collect(account, options = {}) {
    const state = decodeConnectorCursor('rss', options.cursor);
    const headers = {};
    if (state.etag) headers['if-none-match'] = state.etag;
    if (state.lastModified) headers['if-modified-since'] = state.lastModified;
    const feedUrl = account.feedUrl || account.externalAccountId;
    const response = await fetchWithTimeout(
      this.fetchImpl,
      feedUrl,
      { headers, signal: options.signal },
      this.timeoutMs
    );
    if (response.status === 304) {
      const unchanged = normalizeCreatorPage({
        account, posts: [], nextCursor: options.cursor, exhausted: true, rateLimit: null, collectedAt: this.now()
      }, { now: this.now() });
      if (options.history) unchanged.partialReason = 'rss_feed_retention_window';
      return unchanged;
    }
    const xml = await readTextResponse(response, new Date(this.now()));
    const feed = await this.parser.parseString(xml);
    const posts = (feed.items || []).flatMap((item) => {
      const url = item.link || item.guid;
      if (!url) return [];
      return [{
        externalPostId: item.guid || item.id || url,
        url,
        title: item.title || '',
        text: publicText(item.contentSnippet || item.content || item.summary || ''),
        contentType: 'article',
        publishedAt: item.isoDate || item.pubDate,
        editedAt: null,
        language: feed.language || 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'public',
        provenanceUrl: feedUrl,
        metrics: null
      }];
    });
    const nextCursor = encodeConnectorCursor('rss', {
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified')
    });
    const normalized = normalizeCreatorPage({
      account, posts, nextCursor, exhausted: true, rateLimit: null, collectedAt: this.now()
    }, { now: this.now() });
    if (options.history) normalized.partialReason = 'rss_feed_retention_window';
    return normalized;
  }
}

module.exports = RssCreatorConnector;
