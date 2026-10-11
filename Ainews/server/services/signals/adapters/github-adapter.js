const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

class GitHubAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
    this.env = options.env || process.env;
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 30, 100);
    const now = options.now ? new Date(options.now) : new Date();
    const since = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
    const headers = requestHeaders({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    });
    if (this.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${this.env.GITHUB_TOKEN}`;
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers,
      params: {
        q: `AI in:name,description created:>=${since}`,
        sort: 'stars',
        order: 'desc',
        per_page: limit
      }
    });
    const items = (response.data?.items || []).slice(0, limit).filter((item) => item?.full_name && item?.html_url).map((item) => ({
      externalId: String(item.id),
      kind: 'repository',
      title: item.full_name,
      summary: item.description || null,
      url: item.html_url,
      author: item.owner?.login || item.full_name.split('/')[0],
      publishedAt: item.created_at || item.pushed_at,
      metrics: {
        stars: item.stargazers_count ?? null,
        forks: item.forks_count ?? null,
        openIssues: item.open_issues_count ?? null
      },
      tags: [...(item.topics || []), item.language].filter(Boolean),
      repoFullName: item.full_name,
      raw: item
    }));

    return {
      items,
      rateLimit: {
        remaining: Number(response.headers?.['x-ratelimit-remaining'] ?? null),
        reset: Number(response.headers?.['x-ratelimit-reset'] ?? null)
      }
    };
  }
}

module.exports = GitHubAdapter;
