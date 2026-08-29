const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

function repositoryUrl(type, id) {
  if (type === 'dataset') return `https://huggingface.co/datasets/${id}`;
  if (type === 'space') return `https://huggingface.co/spaces/${id}`;
  return `https://huggingface.co/${id}`;
}

class HuggingFaceAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
  }

  async collect(source, options = {}) {
    // Hugging Face's public /api/trending contract currently rejects limit > 20.
    const limit = boundedLimit(options.limit, 20, 20);
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: { limit }
    });
    const entries = Array.isArray(response.data)
      ? response.data
      : response.data?.recentlyTrending || response.data?.trending || [];
    return entries.slice(0, limit).map((entry) => {
      const repo = entry.repoData || entry;
      const repoType = entry.repoType || repo.repoType || 'model';
      return {
        externalId: repo.id,
        kind: repoType === 'space' ? 'demo' : repoType,
        title: repo.id,
        summary: repo.description || repo.pipeline_tag || null,
        url: repositoryUrl(repoType, repo.id),
        author: repo.author || repo.id?.split('/')[0] || null,
        publishedAt: repo.lastModified || repo.createdAt || new Date().toISOString(),
        metrics: {
          likes: repo.likes ?? null,
          downloads: repo.downloads ?? null
        },
        tags: [repoType, repo.pipeline_tag].filter(Boolean),
        repoFullName: repo.id,
        raw: entry
      };
    }).filter((item) => item.externalId && item.title);
  }
}

module.exports = HuggingFaceAdapter;
