const { boundedLimit, defaultHttp, requestHeaders, stripHtml } = require('./adapter-utils');

const AI_PATTERNS = [
  /(^|[^a-z])ai([^a-z]|$)/i,
  /artificial intelligence|machine learning|deep learning|large language model|\bllms?\b/i,
  /\b(openai|chatgpt|anthropic|claude|gemini|deepmind|deepseek|qwen|hugging ?face)\b/i,
  /\bai[- ]?(agent|model|coding|video|image|safety|alignment|benchmark|tool)s?\b/i,
  /人工智能|大模型|生成式|机器学习|深度学习|智能体|提示词|通义千问|智谱|豆包|月之暗面|可灵/i
];

function isAiRelevant(item = {}) {
  const text = [item.title, item.summary, ...(item.tags || [])].filter(Boolean).join(' ');
  return AI_PATTERNS.some((pattern) => pattern.test(text));
}

class MastodonAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 20, 40);
    const base = source.endpoint.replace(/\/$/, '');
    const requestOptions = {
      timeout: source.timeoutMs,
      headers: requestHeaders(),
      params: { limit: Math.min(limit, 20) }
    };
    const [statusesResponse, linksResponse] = await Promise.all([
      this.http.get(`${base}/statuses`, requestOptions),
      this.http.get(`${base}/links`, requestOptions)
    ]);
    const statuses = (statusesResponse.data || []).map((item) => ({
      externalId: String(item.id),
      kind: 'social_post',
      title: stripHtml(item.content).slice(0, 240),
      summary: stripHtml(item.content) || null,
      url: item.url || item.uri,
      author: item.account?.acct || item.account?.username || null,
      publishedAt: item.created_at,
      metrics: {
        likes: item.favourites_count ?? null,
        reposts: item.reblogs_count ?? null,
        replies: item.replies_count ?? null
      },
      tags: (item.tags || []).map((tag) => tag.name).filter(Boolean),
      raw: item
    })).filter((item) => item.title && item.url && isAiRelevant(item));
    const links = (linksResponse.data || []).map((item) => {
      const latestHistory = Array.isArray(item.history) ? item.history[0] : null;
      return {
        externalId: item.url,
        kind: 'shared_link',
        title: item.title,
        summary: item.description || null,
        url: item.url,
        author: item.author_name || item.provider_name || null,
        publishedAt: latestHistory?.day
          ? new Date(Number(latestHistory.day) * 1000).toISOString()
          : new Date().toISOString(),
        metrics: { shares: latestHistory?.uses == null ? null : Number(latestHistory.uses) },
        raw: item
      };
    }).filter((item) => item.title && item.url && isAiRelevant(item));

    return [...statuses, ...links].slice(0, limit);
  }
}

MastodonAdapter.isAiRelevant = isAiRelevant;
module.exports = MastodonAdapter;
