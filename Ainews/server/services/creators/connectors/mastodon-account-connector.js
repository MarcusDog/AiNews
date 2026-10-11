const cheerio = require('cheerio');
const { normalizeCreatorPage } = require('../creator-normalizer');
const { createConnectorFetch, fetchWithTimeout, normalizeRateLimitReset, readJsonResponse } = require('./connector-utils');

function textFromHtml(html) {
  const $ = cheerio.load(`<main>${html || ''}</main>`);
  return $('main').text().replace(/\s+/g, ' ').trim();
}

function nextMaxId(link) {
  const match = /<([^>]+)>;\s*rel="next"/.exec(link || '');
  if (!match) return null;
  try {
    return new URL(match[1]).searchParams.get('max_id');
  } catch {
    return null;
  }
}

class MastodonAccountConnector {
  constructor(options = {}) {
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
  }

  request(url, options = {}) {
    return fetchWithTimeout(this.fetchImpl, url, options, this.timeoutMs);
  }

  async collect(account, options = {}) {
    const baseUrl = account.instanceUrl || new URL(account.profileUrl).origin;
    let accountId = account.externalAccountId;
    if (!/^\d+$/.test(accountId)) {
      const lookupUrl = new URL('/api/v1/accounts/lookup', baseUrl);
      lookupUrl.searchParams.set('acct', accountId);
      const lookupResponse = await this.request(lookupUrl, { signal: options.signal });
      const lookup = await readJsonResponse(lookupResponse, new Date(this.now()));
      accountId = lookup.id;
    }
    const statusesUrl = new URL(`/api/v1/accounts/${encodeURIComponent(accountId)}/statuses`, baseUrl);
    statusesUrl.searchParams.set('limit', '40');
    statusesUrl.searchParams.set('exclude_replies', 'false');
    if (options.cursor) statusesUrl.searchParams.set('max_id', options.cursor);
    const response = await this.request(statusesUrl, { signal: options.signal });
    const statuses = await readJsonResponse(response, new Date(this.now()));
    const posts = statuses.map((status) => {
      const text = textFromHtml(status.content);
      const original = status.reblog;
      return {
        externalPostId: status.id,
        url: status.url,
        title: text.slice(0, 180),
        text,
        contentType: status.in_reply_to_id ? 'thread' : 'post',
        publishedAt: status.created_at,
        editedAt: status.edited_at,
        language: status.language || 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'public',
        provenanceUrl: account.profileUrl,
        metrics: {
          likes: status.favourites_count,
          comments: status.replies_count,
          shares: status.reblogs_count
        },
        sharedFrom: original ? {
          platform: 'mastodon',
          externalAccountId: original.account?.id,
          externalPostId: original.id,
          url: original.url,
          displayName: original.account?.display_name || original.account?.acct || original.account?.id
        } : null
      };
    });
    const nextCursor = nextMaxId(response.headers.get('link'));
    return normalizeCreatorPage({
      account, posts, nextCursor, exhausted: !nextCursor,
      rateLimit: {
        remaining: response.headers.get('x-ratelimit-remaining'),
        resetAt: normalizeRateLimitReset(response.headers.get('x-ratelimit-reset'))
      },
      collectedAt: this.now()
    }, { now: this.now() });
  }
}

module.exports = MastodonAccountConnector;
