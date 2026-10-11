const { boundedLimit, defaultHttp, requestHeaders } = require('./adapter-utils');

const STRONG_TERMS = [
  '人工智能', '大模型', 'aigc', 'llm', 'ai agent', 'openai', 'anthropic',
  'google deepmind', 'chatgpt', 'claude', 'gemini', 'deepseek', 'qwen',
  '通义', '智谱', '豆包', 'kimi', '可灵', '即梦', 'comfyui', 'stable diffusion'
];
const GENERIC_PATTERNS = [
  /(^|[^a-z])ai([^a-z]|$)/i,
  /模型/i,
  /智能体/i,
  /提示词/i,
  /机器学习/i,
  /生成式/i,
  /ai\s*编程/i,
  /机器人/i
];

function isAiRelevant(item = {}) {
  const text = `${item.title || ''} ${item.desc || ''} ${item.owner?.name || ''}`.toLowerCase();
  if (STRONG_TERMS.some((term) => text.includes(term))) return true;
  const matches = GENERIC_PATTERNS.filter((pattern) => pattern.test(text));
  return matches.length >= 2;
}

class BilibiliAdapter {
  constructor(options = {}) {
    this.http = options.http || defaultHttp();
  }

  async collect(source, options = {}) {
    const limit = boundedLimit(options.limit, 40, 100);
    const response = await this.http.get(source.endpoint, {
      timeout: source.timeoutMs,
      headers: requestHeaders({ Referer: 'https://www.bilibili.com/' }),
      params: { pn: 1, ps: limit }
    });
    if (response.data?.code !== 0) throw new Error(response.data?.message || 'Bilibili API error');
    return (response.data?.data?.list || []).filter(isAiRelevant).slice(0, limit).map((item) => ({
      externalId: item.bvid || String(item.aid),
      kind: 'video',
      title: item.title,
      summary: item.desc || null,
      url: item.bvid
        ? `https://www.bilibili.com/video/${item.bvid}`
        : `https://www.bilibili.com/video/av${item.aid}`,
      author: item.owner?.name || null,
      publishedAt: new Date(Number(item.pubdate) * 1000).toISOString(),
      metrics: {
        views: item.stat?.view ?? null,
        likes: item.stat?.like ?? null,
        comments: item.stat?.reply ?? null,
        shares: item.stat?.share ?? null
      },
      tags: [item.tname, item.tnamev2].filter(Boolean),
      raw: item
    }));
  }
}

BilibiliAdapter.isAiRelevant = isAiRelevant;
module.exports = BilibiliAdapter;
