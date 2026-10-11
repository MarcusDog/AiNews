const { normalizeCreatorPage } = require('../creator-normalizer');
const {
  createConnectorFetch,
  decodeConnectorCursor,
  encodeConnectorCursor,
  fetchWithTimeout,
  normalizeRateLimitReset,
  readJsonResponse
} = require('./connector-utils');

class GithubCreatorConnector {
  constructor(options = {}) {
    this.fetchImpl = createConnectorFetch(options);
    this.timeoutMs = options.timeoutMs || 10000;
    this.now = options.now || (() => new Date().toISOString());
    this.token = options.token || null;
  }

  async request(url, signal, etag) {
    const headers = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28'
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (etag) headers['if-none-match'] = etag;
    const response = await fetchWithTimeout(this.fetchImpl, url, { headers, signal }, this.timeoutMs);
    if (response.status === 304) return { items: [], etag, notModified: true, headers: response.headers };
    const items = await readJsonResponse(response, new Date(this.now()));
    return { items: Array.isArray(items) ? items : [], etag: response.headers.get('etag'), headers: response.headers };
  }

  async collect(account, options = {}) {
    const cursor = decodeConnectorCursor('github', options.cursor);
    const page = Math.max(1, Number(cursor.page) || 1);
    const handle = account.handle;
    const scope = account.accountType === 'organization' ? 'orgs' : 'users';
    const repos = await this.request(
      `https://api.github.com/${scope}/${encodeURIComponent(handle)}/repos?sort=pushed&direction=desc&per_page=100&page=${page}`,
      options.signal,
      cursor.reposEtag
    );
    const releases = [];
    const releaseEtags = {};
    for (const repository of account.repositories || []) {
      const result = await this.request(
        `https://api.github.com/repos/${repository}/releases?per_page=30&page=${page}`,
        options.signal,
        cursor.releaseEtags?.[repository]
      );
      releaseEtags[repository] = result.etag;
      releases.push(...result.items);
    }
    const events = await this.request(
      `https://api.github.com/users/${encodeURIComponent(handle)}/events/public?per_page=100&page=${page}`,
      options.signal,
      cursor.eventsEtag
    );
    const verticalIds = account.verticalIds || [];
    const posts = [
      ...repos.items.map((repo) => ({
        externalPostId: `repo:${repo.id}`,
        url: repo.html_url,
        title: repo.full_name || repo.name,
        text: repo.description || '',
        contentType: 'repository',
        publishedAt: repo.created_at || repo.pushed_at,
        editedAt: repo.pushed_at && repo.created_at && Date.parse(repo.pushed_at) >= Date.parse(repo.created_at)
          ? repo.pushed_at
          : null,
        language: 'und', verticalIds, sourceConfidence: 'official', provenanceUrl: account.profileUrl,
        metrics: { likes: repo.stargazers_count, shares: repo.forks_count, comments: repo.open_issues_count }
      })),
      ...releases.map((release) => ({
        externalPostId: `release:${release.id}`,
        url: release.html_url,
        title: release.name || release.tag_name,
        text: release.body || '',
        contentType: 'repository',
        publishedAt: release.published_at || release.created_at,
        editedAt: null,
        language: 'und', verticalIds, sourceConfidence: 'official', provenanceUrl: account.profileUrl,
        metrics: null
      })),
      ...events.items.map((event) => ({
        externalPostId: `event:${event.id}`,
        url: `https://github.com/${event.repo?.name || handle}`,
        title: `${event.type || 'GitHub event'} · ${event.repo?.name || handle}`,
        text: '',
        contentType: 'post',
        publishedAt: event.created_at,
        editedAt: null,
        language: 'und', verticalIds, sourceConfidence: 'official', provenanceUrl: account.profileUrl,
        metrics: null
      }))
    ];
    const exhausted = repos.items.length < 100 && events.items.length < 100 && releases.length < 30;
    return normalizeCreatorPage({
      account,
      posts,
      nextCursor: encodeConnectorCursor('github', {
        page: exhausted ? page : page + 1,
        reposEtag: repos.etag,
        eventsEtag: events.etag,
        releaseEtags
      }),
      exhausted,
      rateLimit: {
        remaining: repos.headers.get('x-ratelimit-remaining'),
        resetAt: normalizeRateLimitReset(repos.headers.get('x-ratelimit-reset'))
      },
      collectedAt: this.now()
    }, { now: this.now() });
  }
}

module.exports = GithubCreatorConnector;
