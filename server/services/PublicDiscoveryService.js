function normalizeOrigin(origin) {
  return String(origin || 'https://ainews.xiaotianaya.com').replace(/\/$/, '');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildJsonFeed(news = [], options = {}) {
  const origin = normalizeOrigin(options.origin);
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'AyaNews · AI 资讯更新',
    home_page_url: origin,
    feed_url: `${origin}/feed.json`,
    description: 'AyaNews 收录的最新 AI 资讯摘要；每条内容保留原始发布者链接。',
    language: 'zh-CN',
    items: (Array.isArray(news) ? news : []).filter((item) => item?.url).map((item) => ({
      id: String(item.id || item.url),
      url: item.url,
      title: item.title || '未命名资讯',
      content_text: item.description || '请前往原始来源阅读完整内容。',
      summary: item.description || undefined,
      date_published: toIsoDate(item.publishedAt) || undefined,
      tags: [item.category].filter(Boolean),
      _ayanews: {
        source: item.source || '未知来源',
        category: item.category || null,
        evidence_boundary: '公开 Feed 仅提供标题、摘要与元数据；事实与数字请回查原始来源。'
      }
    }))
  };
}

function buildRssFeed(news = [], options = {}) {
  const origin = normalizeOrigin(options.origin);
  const items = (Array.isArray(news) ? news : []).filter((item) => item?.url).map((item) => {
    const publishedAt = toIsoDate(item.publishedAt);
    return [
      '    <item>',
      `      <guid isPermaLink="false">${escapeXml(item.id || item.url)}</guid>`,
      `      <title>${escapeXml(item.title || '未命名资讯')}</title>`,
      `      <link>${escapeXml(item.url)}</link>`,
      `      <description>${escapeXml(item.description || '请前往原始来源阅读完整内容。')}</description>`,
      `      <source url="${escapeXml(origin)}">${escapeXml(item.source || 'AyaNews')}</source>`,
      item.category ? `      <category>${escapeXml(item.category)}</category>` : '',
      publishedAt ? `      <pubDate>${new Date(publishedAt).toUTCString()}</pubDate>` : '',
      '    </item>'
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>AyaNews · AI 资讯更新</title>',
    `    <link>${escapeXml(origin)}</link>`,
    '    <description>AyaNews 最新 AI 资讯摘要；每条内容保留原始发布者链接。</description>',
    '    <language>zh-CN</language>',
    items,
    '  </channel>',
    '</rss>'
  ].join('\n');
}

function topicEvidence(topic = {}) {
  return (Array.isArray(topic.signals) ? topic.signals : [])
    .filter((signal) => signal?.url)
    .map((signal) => ({
      url: signal.url,
      source: signal.sourceName || signal.platform || '未知来源',
      platform: signal.platform || null
    }));
}

function buildTopicJsonFeed(topics = [], options = {}) {
  const origin = normalizeOrigin(options.origin);
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'AyaNews · AI 热点与创作者机会',
    home_page_url: origin,
    feed_url: `${origin}/topics/feed.json`,
    description: '由真实 Signal 聚类得到的 AI 热点；评分可解释，证据不足时会明确标记。',
    language: 'zh-CN',
    items: (Array.isArray(topics) ? topics : []).filter((topic) => topic?.id).map((topic) => {
      const evidence = topicEvidence(topic);
      return {
        id: String(topic.id),
        url: `${origin}/api/signals/v1/topics/${encodeURIComponent(topic.id)}`,
        external_url: evidence[0]?.url,
        title: topic.title || '未命名热点',
        content_text: topic.summary || `趋势分 ${topic.trendScore ?? 0}，创作者机会分 ${topic.creatorScore ?? 0}。`,
        summary: topic.summary || undefined,
        date_published: toIsoDate(topic.latestSeenAt) || undefined,
        tags: [topic.trendDirection, topic.evidenceStrength].filter(Boolean),
        _ayanews: {
          trend_score: topic.trendScore ?? 0,
          creator_score: topic.creatorScore ?? 0,
          trend_direction: topic.trendDirection || 'steady',
          evidence_strength: topic.evidenceStrength || 'single-source',
          evidence_urls: evidence.map((item) => item.url),
          evidence: evidence,
          evidence_boundary: '热点和评分来自站内已收录信号；发布事实性结论前必须打开原始证据复核。'
        }
      };
    })
  };
}

function buildTopicRssFeed(topics = [], options = {}) {
  const origin = normalizeOrigin(options.origin);
  const items = (Array.isArray(topics) ? topics : []).filter((topic) => topic?.id).map((topic) => {
    const evidence = topicEvidence(topic);
    const detailUrl = `${origin}/api/signals/v1/topics/${encodeURIComponent(topic.id)}`;
    const primaryUrl = evidence[0]?.url || detailUrl;
    const evidenceLines = evidence.map((item) => `${item.source}: ${item.url}`).join('\n');
    const description = [
      topic.summary || '',
      `趋势分 ${topic.trendScore ?? 0}；创作者机会分 ${topic.creatorScore ?? 0}；证据强度 ${topic.evidenceStrength || 'single-source'}。`,
      evidenceLines
    ].filter(Boolean).join('\n');
    const publishedAt = toIsoDate(topic.latestSeenAt);
    return [
      '    <item>',
      `      <guid isPermaLink="false">${escapeXml(topic.id)}</guid>`,
      `      <title>${escapeXml(topic.title || '未命名热点')}</title>`,
      `      <link>${escapeXml(primaryUrl)}</link>`,
      `      <description>${escapeXml(description)}</description>`,
      `      <ayanews:topicUrl>${escapeXml(detailUrl)}</ayanews:topicUrl>`,
      ...evidence.map((item) => `      <ayanews:evidence>${escapeXml(item.url)}</ayanews:evidence>`),
      publishedAt ? `      <pubDate>${new Date(publishedAt).toUTCString()}</pubDate>` : '',
      '    </item>'
    ].filter(Boolean).join('\n');
  }).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:ayanews="https://ainews.xiaotianaya.com/ns/1.0">',
    '  <channel>',
    '    <title>AyaNews · AI 热点与创作者机会</title>',
    `    <link>${escapeXml(origin)}</link>`,
    '    <description>由真实 Signal 聚类得到的 AI 热点与选题机会。</description>',
    '    <language>zh-CN</language>',
    items,
    '  </channel>',
    '</rss>'
  ].join('\n');
}

function jsonResponse(description, schema = { type: 'object' }) {
  return {
    description,
    content: { 'application/json': { schema } }
  };
}

function getOperation(summary, parameters = []) {
  return {
    summary,
    parameters,
    responses: { 200: jsonResponse('请求成功') }
  };
}

function queryParameter(name, options = {}) {
  return {
    in: 'query',
    name,
    required: Boolean(options.required),
    schema: { type: options.type || 'string', ...options.schema },
    description: options.description
  };
}

function buildOpenApiDocument(options = {}) {
  const origin = normalizeOrigin(options.origin);
  return {
    openapi: '3.1.0',
    info: {
      title: 'AyaNews Public Content API',
      version: '2.0.0',
      description: '面向开发者与 Agent 的 AI 新闻、真实 Signal、事件 Topic、创作者机会、变化游标与来源健康接口。所有证据保留原始 URL。'
    },
    servers: [{ url: origin }],
    tags: [
      { name: 'Research', description: '新闻检索与证据研究' },
      { name: 'Topics', description: '24/48/72 小时热点、趋势与创作者机会' },
      { name: 'Sources', description: '公开来源注册表与采集健康状态' },
      { name: 'Feeds', description: '轻量订阅格式' }
    ],
    paths: {
      '/api/content/v1/capabilities': { get: { ...getOperation('读取当前已实现能力'), tags: ['Research'] } },
      '/api/content/v1/latest': {
        get: {
          ...getOperation('读取最新资讯', [
            queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 50, default: 20 } }),
            queryParameter('category')
          ]),
          tags: ['Research']
        }
      },
      '/api/content/v1/search': {
        get: {
          ...getOperation('搜索资讯', [
            queryParameter('q', { required: true }),
            queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 50, default: 20 } }),
            queryParameter('category')
          ]),
          tags: ['Research']
        }
      },
      '/api/content/v1/trends': { get: { ...getOperation('读取站内等长窗口趋势'), tags: ['Research'] } },
      '/api/content/v1/brief': {
        get: {
          ...getOperation('生成带引用的内容证据包', [
            queryParameter('topic', { required: true }),
            queryParameter('audience'),
            queryParameter('goal'),
            queryParameter('format'),
            queryParameter('days', { type: 'integer', schema: { minimum: 1, maximum: 30, default: 14 } }),
            queryParameter('limit', { type: 'integer', schema: { minimum: 3, maximum: 8, default: 6 } })
          ]),
          tags: ['Research']
        }
      },
      '/api/content/v1/generate': {
        post: {
          summary: '基于证据包生成引用成稿',
          tags: ['Research'],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['topic'], properties: { topic: { type: 'string' }, audience: { type: 'string' }, goal: { type: 'string' }, format: { type: 'string' }, days: { type: 'integer' }, limit: { type: 'integer' } } } } } },
          responses: { 200: jsonResponse('引用审计通过的成稿'), 422: jsonResponse('证据不足'), 503: jsonResponse('内容模型未配置') }
        }
      },
      '/api/content/v1/sources': { get: { ...getOperation('读取公开来源注册表'), tags: ['Sources'] } },
      '/api/content/v1/source-health': { get: { ...getOperation('读取来源采集健康摘要'), tags: ['Sources'] } },
      '/api/signals/v1/topics': { get: { ...getOperation('读取持久化热点 Topic', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), queryParameter('page', { type: 'integer', schema: { minimum: 1, default: 1 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Topics'] } },
      '/api/signals/v1/topics/{id}': { get: { ...getOperation('读取 Topic 详情与原始证据'), tags: ['Topics'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: jsonResponse('Topic 详情', { $ref: '#/components/schemas/TopicResponse' }), 404: jsonResponse('Topic 不存在') } } },
      '/api/signals/v1/opportunities': { get: { ...getOperation('读取创作者机会', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } })]), tags: ['Topics'] } },
      '/api/signals/v1/opportunities/random': { get: { ...getOperation('从真实持久化 Topic 随机选择创作者机会', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } })]), tags: ['Topics'] } },
      '/api/signals/v1/sources': { get: { ...getOperation('读取 Signal 来源配置与实际健康状态'), tags: ['Sources'] } },
      '/api/signals/v1/health': { get: { ...getOperation('读取 Signal 系统健康摘要'), tags: ['Sources'] } },
      '/api/signals/v1/changes': { get: { ...getOperation('读取 seq 游标之后的 Topic 变化', [queryParameter('since', { type: 'integer', schema: { minimum: 0, default: 0 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 500, default: 100 } })]), tags: ['Topics'], responses: { 200: jsonResponse('增量变化'), 410: jsonResponse('游标已过期，需要全量同步') } } },
      '/api/signals/v1/admin/refresh': { post: { summary: '受保护地刷新 Signal 并重建 Topic', tags: ['Topics'], security: [{ AdminApiKey: [] }], responses: { 200: jsonResponse('刷新完成'), 401: jsonResponse('缺少密钥'), 403: jsonResponse('密钥无效'), 503: jsonResponse('管理能力未配置') } } },
      '/feed.json': { get: { ...getOperation('JSON Feed 1.1', [queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 50 } })]), tags: ['Feeds'] } },
      '/rss.xml': { get: { summary: 'RSS 2.0 Feed', tags: ['Feeds'], responses: { 200: { description: 'RSS XML', content: { 'application/rss+xml': { schema: { type: 'string' } } } } } } },
      '/topics/feed.json': { get: { ...getOperation('Topic JSON Feed 1.1', [queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 50 } })]), tags: ['Feeds'] } },
      '/topics/rss.xml': { get: { summary: 'Topic RSS 2.0 Feed', tags: ['Feeds'], responses: { 200: { description: 'Topic RSS XML', content: { 'application/rss+xml': { schema: { type: 'string' } } } } } } }
    },
    components: {
      securitySchemes: { AdminApiKey: { type: 'apiKey', in: 'header', name: 'x-admin-api-key' } },
      schemas: {
        SignalMetrics: {
          type: 'object',
          properties: Object.fromEntries(['views', 'likes', 'comments', 'replies', 'shares', 'reposts', 'stars', 'forks', 'openIssues', 'points', 'rank', 'downloads'].map((name) => [name, { type: ['number', 'null'], minimum: 0 }]))
        },
        Signal: {
          type: 'object', required: ['id', 'sourceId', 'platform', 'title', 'url', 'publishedAt', 'metrics'],
          properties: { id: { type: 'string' }, sourceId: { type: 'string' }, platform: { type: 'string' }, title: { type: 'string' }, url: { type: 'string', format: 'uri' }, publishedAt: { type: 'string', format: 'date-time' }, metrics: { $ref: '#/components/schemas/SignalMetrics' } }
        },
        Topic: {
          type: 'object', required: ['id', 'canonical_topic_id', 'title', 'trendScore', 'creatorScore', 'evidenceStrength'],
          properties: { id: { type: 'string' }, canonical_topic_id: { type: 'string' }, title: { type: 'string' }, trendScore: { type: 'number' }, creatorScore: { type: 'number' }, evidenceStrength: { type: 'string' }, signals: { type: 'array', items: { $ref: '#/components/schemas/Signal' } } }
        },
        TopicResponse: { type: 'object', properties: { success: { const: true }, data: { $ref: '#/components/schemas/Topic' } } }
      }
    }
  };
}

function buildPublicSkillMarkdown(options = {}) {
  const origin = normalizeOrigin(options.origin);
  return `# AyaNewsSkill\n\nAyaNews 官方 AI News Research & Evidence Skill。把 ${origin} 作为最新 AI 新闻、热点 Topic 与创作者机会入口。\n\n## 何时使用\n\n当用户需要最新 AI 新闻、24h / 48h / 72h 热点、创作者选题、跨来源核查、趋势解释、证据成稿或站内来源视野检查时使用。\n\n## 强制规则\n\n1. 先检索，后结论；不得用模型记忆补齐最新事实。\n2. 每个事实性结论必须保留原始来源 URL。\n3. 区分官方一手、研究论文、媒体报道、工程实践与推断。\n4. 重大结论优先寻找一手来源；只有 single-source / 单一来源时必须降低确定性。\n5. 来源冲突时并列呈现，不得隐藏冲突或自行伪造共识。\n6. 发布时间、抓取时间与事件发生时间必须分开。\n7. Trend Score 与 Creator Score 只是站内信号的可解释排序，不等同于全网事实。\n\n## 来源层级\n\n- L1：免凭据公开主干（News、HN、GitHub、Mastodon、Reddit RSS、Hugging Face、Bilibili）。\n- L2：需要运营方密钥的官方 API（YouTube、X）。\n- L3：运营方自托管桥接（RSSHub、NewsNow、JSON Bridge）。\n- L4：默认禁用的登录态 Sidecar，只能由运营方单独运行后经 Bridge 接入。\n\n## 可用接口\n\n- 热点：${origin}/api/signals/v1/topics?window=72h\n- Topic 详情：${origin}/api/signals/v1/topics/{id}\n- 创作者机会：${origin}/api/signals/v1/opportunities?window=48h\n- 随机真实选题：${origin}/api/signals/v1/opportunities/random?window=72h\n- Signal 来源健康：${origin}/api/signals/v1/sources\n- What Changed：${origin}/api/signals/v1/changes?since=0\n- 旧 News 兼容接口：${origin}/api/content/v1/latest?limit=10\n- 证据包：${origin}/api/content/v1/brief?topic=AI%20Agent&audience=developer&goal=research&format=article\n- OpenAPI：${origin}/openapi.json\n- Topic JSON Feed：${origin}/topics/feed.json\n- Topic RSS：${origin}/topics/rss.xml\n\nMCP、A2A 协议端点与 Webhook 尚未上线，不得声称可用。What Changed REST 游标接口已经上线；收到 410 时必须重新读取 Topic 列表。\n`;
}

module.exports = {
  buildJsonFeed,
  buildOpenApiDocument,
  buildPublicSkillMarkdown,
  buildRssFeed,
  buildTopicJsonFeed,
  buildTopicRssFeed,
  escapeXml,
  normalizeOrigin
};
