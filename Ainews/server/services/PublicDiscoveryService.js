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

function pathParameter(name, description) {
  return { in: 'path', name, required: true, schema: { type: 'string' }, description };
}

function headerParameter(name, description, pattern) {
  return {
    in: 'header', name, required: true, description,
    schema: { type: 'string', ...(pattern ? { pattern } : {}) }
  };
}

function jsonBody(schema, required = true) {
  return { required, content: { 'application/json': { schema } } };
}

function creatorListParameters(extra = []) {
  return [
    queryParameter('q', { description: 'FTS5 全文搜索；按字面量绑定查询，不执行搜索运算符' }),
    queryParameter('cursor', { description: '与规范化查询和筛选绑定的不透明 keyset cursor；不得解析或跨查询复用' }),
    queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } }),
    ...extra
  ];
}

function buildCreatorPaths() {
  const session = [{ SessionCookie: [] }];
  const admin = [{ AdminApiKey: [] }];
  const creatorId = pathParameter('id', '稳定 Creator、Topic、订阅或端点 ID');
  const authenticated = (summary, method = 'get', options = {}) => ({
    [method]: { summary, tags: ['Creator Alerts'], security: session, responses: { 200: jsonResponse('请求成功'), 401: jsonResponse('需要登录') }, ...options }
  });
  const managed = (summary, options = {}) => ({
    post: { summary, tags: ['Creator Operations'], security: admin, responses: { 200: jsonResponse('操作成功'), 401: jsonResponse('缺少管理密钥'), 403: jsonResponse('管理密钥无效'), 503: jsonResponse('能力未配置') }, ...options }
  });
  const subscriptionBody = jsonBody({
    type: 'object', required: ['name', 'deliveryMode', 'endpointIds'],
    properties: {
      name: { type: 'string' }, deliveryMode: { enum: ['immediate', 'digest'] },
      endpointIds: { type: 'array', items: { type: 'string' } },
      filters: { type: 'object', properties: { verticals: { type: 'array', items: { type: 'string' } }, platforms: { type: 'array', items: { type: 'string' } }, creators: { type: 'array', items: { type: 'string' } }, eventTypes: { type: 'array', items: { type: 'string' } }, minimumScore: { type: ['number', 'null'], minimum: 0, maximum: 100 } } },
      quietHours: { type: 'object' }
    }
  });
  const endpointBody = jsonBody({
    type: 'object', required: ['type', 'destination'],
    properties: { type: { enum: ['in_app', 'webhook', 'email', 'feishu', 'wecom', 'dingtalk', 'telegram', 'ntfy', 'bark'] }, destination: { type: 'string' }, secretRef: { type: 'string', description: '服务端环境变量引用；API 永不回显密钥值' }, enabled: { type: 'boolean' } }
  });
  return {
    '/api/auth/register': { post: { summary: '注册推送管理账号并创建同站 Session', tags: ['Creator Alerts'], requestBody: jsonBody({ type: 'object', required: ['email', 'password', 'displayName'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' }, displayName: { type: 'string' } } }), responses: { 201: jsonResponse('注册成功') } } },
    '/api/auth/login': { post: { summary: '登录推送管理账号', tags: ['Creator Alerts'], requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } } }), responses: { 200: jsonResponse('登录成功'), 401: jsonResponse('凭据无效') } } },
    '/api/auth/session': { get: { summary: '无噪声检查当前会话状态', tags: ['Creator Alerts'], responses: { 200: jsonResponse('会话状态；anonymous 时 authenticated=false') } } },
    '/api/auth/me': authenticated('读取当前登录账号'),
    '/api/creators/v1/verticals': { get: { ...getOperation('读取已配置垂类和真实覆盖统计'), tags: ['Creators'] } },
    '/api/creators/v1/creators': { get: { ...getOperation('搜索核验观察名单中的 Creator', creatorListParameters([queryParameter('status', { schema: { enum: ['verified', 'candidate', 'rejected'] } }), queryParameter('vertical'), queryParameter('platform')])), tags: ['Creators'] } },
    '/api/creators/v1/creators/{id}': { get: { ...getOperation('读取 Creator、公开账号与回填覆盖'), tags: ['Creators'], parameters: [creatorId], responses: { 200: jsonResponse('Creator 详情', { $ref: '#/components/schemas/Creator' }), 404: jsonResponse('Creator 不存在') } } },
    '/api/creators/v1/creators/{id}/posts': { get: { ...getOperation('分页读取单个 Creator 的已采集公开帖子', [creatorId, ...creatorListParameters()]), tags: ['Creators'] } },
    '/api/creators/v1/posts': { get: { ...getOperation('全文搜索或分页读取公开帖子', creatorListParameters([queryParameter('vertical'), queryParameter('platform'), queryParameter('creator'), queryParameter('since', { description: 'ISO 8601 起始时间' }), queryParameter('hot', { schema: { enum: ['true', 'false', '1', '0'] } })])), tags: ['Creators'] } },
    '/api/creators/v1/hot': { get: { ...getOperation('读取单博主爆款、多博主共题或跨平台扩散', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '24h' } }), queryParameter('type', { schema: { enum: ['post', 'multi_creator', 'cross_platform'], default: 'post' } }), queryParameter('vertical'), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Creators'] } },
    '/api/creators/v1/topics': { get: { ...getOperation('搜索跨博主 Creator Topic', creatorListParameters([queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), queryParameter('vertical'), queryParameter('since', { description: 'ISO 8601 起始时间' })])), tags: ['Creators'] } },
    '/api/creators/v1/topics/{id}': { get: { ...getOperation('读取 Creator Topic 及全部原帖证据'), tags: ['Creators'], parameters: [creatorId], responses: { 200: jsonResponse('Creator Topic', { $ref: '#/components/schemas/CreatorTopic' }), 404: jsonResponse('Topic 不存在') } } },
    '/api/creators/v1/sources': { get: { ...getOperation('区分支持、已配置、在线、partial、blocked 与 unconfigured 的来源覆盖'), tags: ['Creator Sources'] } },
    '/api/creators/v1/changes': { get: { ...getOperation('按单调 seq 游标读取已提交 Creator 事件', [queryParameter('since', { type: 'integer', schema: { minimum: 0, default: 0 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 500, default: 100 } }), queryParameter('vertical'), queryParameter('platform'), queryParameter('creator')]), tags: ['Creators'], responses: { 200: jsonResponse('增量变化'), 410: { ...jsonResponse('游标已过期，需要重新同步'), description: '游标已过期，需要重新同步' } } } },
    '/api/creators/v1/stream': { get: { summary: '登录态 SSE；首次连接从当前末尾追新，Last-Event-ID 或 since 显式续传', tags: ['Creator Alerts'], security: session, parameters: [{ in: 'header', name: 'Last-Event-ID', required: false, schema: { type: 'integer', minimum: 0 }, description: '最后已持久处理的事件 seq；重连时从下一条继续' }, queryParameter('since', { type: 'integer', schema: { minimum: 0 } }), queryParameter('vertical'), queryParameter('platform'), queryParameter('creator')], responses: { 200: { description: 'text/event-stream；每 15 秒 heartbeat，事件在数据库提交后发送', content: { 'text/event-stream': { schema: { type: 'string' } } } }, 401: jsonResponse('需要登录'), 410: jsonResponse('游标已过期；响应含 resync、oldest_cursor、latest_cursor') } } },
    '/api/creators/v1/subscriptions': { ...authenticated('列出当前用户订阅'), ...authenticated('创建持久订阅', 'post', { requestBody: subscriptionBody }) },
    '/api/creators/v1/subscriptions/{id}': { ...authenticated('更新所属订阅', 'patch', { parameters: [creatorId], requestBody: subscriptionBody }), ...authenticated('删除所属订阅', 'delete', { parameters: [creatorId] }) },
    '/api/creators/v1/delivery-endpoints': { ...authenticated('列出当前用户投递端点'), ...authenticated('创建投递端点', 'post', { requestBody: endpointBody }) },
    '/api/creators/v1/delivery-endpoints/{id}': { ...authenticated('更新所属投递端点', 'patch', { parameters: [creatorId], requestBody: endpointBody }), ...authenticated('删除所属投递端点', 'delete', { parameters: [creatorId] }) },
    '/api/creators/v1/delivery-endpoints/{id}/test': authenticated('经持久 outbox 发送一次可审计测试投递', 'post', { parameters: [creatorId] }),
    '/api/creators/v1/deliveries': authenticated('列出当前用户的等待、成功、重试和死信投递', 'get', { parameters: [queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 50 } })] }),
    '/api/creators/v1/admin/creators/import': managed('导入经过人工核验的 Creator 观察名单', { requestBody: jsonBody({ type: 'object' }) }),
    '/api/creators/v1/admin/refresh': managed('立即运行增量采集调度'),
    '/api/creators/v1/admin/backfill': managed('恢复或强制运行一个账号的历史回填', { requestBody: jsonBody({ type: 'object', required: ['accountId'], properties: { accountId: { type: 'string' }, force: { type: 'boolean', default: false } } }) }),
    '/api/creators/v1/admin/backfills': { get: { summary: '分页查看回填状态与历史限制原因', tags: ['Creator Operations'], security: admin, parameters: creatorListParameters([queryParameter('state', { schema: { $ref: '#/components/schemas/CreatorBackfillState' } }), queryParameter('platform')]), responses: { 200: jsonResponse('回填列表'), 401: jsonResponse('缺少管理密钥'), 403: jsonResponse('管理密钥无效') } } },
    '/api/creators/v1/admin/maintenance/preview': managed('冻结时间边界与最大 rowid，预览所有保留期清理候选'),
    '/api/creators/v1/admin/maintenance/execute': managed('使用单次、限时、绑定操作者的 preview token 执行清理', { requestBody: jsonBody({ type: 'object', required: ['token'], properties: { token: { type: 'string' } } }) }),
    '/api/creators/v1/admin/backup': managed('创建路径受限、拒绝覆盖并经 integrity_check 的 SQLite online backup', { requestBody: jsonBody({ type: 'object', properties: { fileName: { type: 'string' } } }, false) }),
    '/api/creators/v1/admin/export': managed('创建一致性 JSONL 导出与 SHA256；排除 secret、cursor 和请求凭据', { requestBody: jsonBody({ type: 'object', properties: { fileName: { type: 'string' } } }, false) }),
    '/api/ingest/v1/youtube/websub': {
      get: { summary: '验证 YouTube WebSub challenge 和已持久 Topic lease', tags: ['Creator Ingest'], parameters: ['hub.mode', 'hub.topic', 'hub.challenge', 'hub.lease_seconds', 'hub.verify_token'].map((name) => queryParameter(name)), responses: { 200: { description: '原样 challenge', content: { 'text/plain': { schema: { type: 'string' } } } }, 400: jsonResponse('验证失败') } },
      post: { summary: '接收 YouTube Atom 增量通知', description: '对原始 XML 字节验证 X-Hub-Signature-256（SHA-256 HMAC）；SHA-1 仅在显式兼容开关下允许。重复回调幂等。', tags: ['Creator Ingest'], parameters: [{ in: 'header', name: 'X-Hub-Signature-256', required: true, schema: { type: 'string', pattern: '^sha256=[a-fA-F0-9]{64}$' } }], requestBody: { required: true, content: { 'application/atom+xml': { schema: { type: 'string', format: 'binary' } } } }, responses: { 202: jsonResponse('通知已提交'), 401: jsonResponse('签名无效') } }
    },
    '/api/ingest/v1/creator-bridge': { post: { summary: '接收独立 Sidecar 的已签名公开帖子批次', description: '签名消息为 timestamp.nonce.sha256(raw body)；必须对原始请求字节计算 SHA256 后再用服务端 HMAC secret 校验，且账号需在核验绑定名单中。', tags: ['Creator Ingest'], parameters: [headerParameter('x-aya-source-id', '配置中的 Sidecar 来源 ID'), headerParameter('x-aya-timestamp', '10 或 13 位 Unix 时间', '^\\d{10}(?:\\d{3})?$'), headerParameter('x-aya-nonce', '8–160 字符单次 nonce'), headerParameter('x-aya-signature', 'sha256=<64 hex> HMAC', '^sha256=[a-fA-F0-9]{64}$')], requestBody: jsonBody({ type: 'object', required: ['version', 'platform', 'externalAccountId', 'items'], properties: { version: { const: 1 }, platform: { type: 'string' }, externalAccountId: { type: 'string' }, nextCursor: {}, exhausted: { type: 'boolean' }, items: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/CreatorPostIngest' } } } }), responses: { 202: jsonResponse('批次已原子提交'), 401: jsonResponse('签名无效'), 403: jsonResponse('来源与账号未绑定'), 409: jsonResponse('nonce 已使用'), 413: jsonResponse('超过 2 MiB'), 422: jsonResponse('Schema 或公开性不合格') } } }
  };
}

function buildCreatorSchemas() {
  return {
    CreatorBackfillState: { type: 'string', enum: ['pending', 'running', 'complete', 'partial', 'blocked'], description: 'complete 仅表示 cursor 耗尽且完成 reconciliation；权限或历史窗口限制必须是 partial/blocked' },
    CreatorMetrics: { type: 'object', additionalProperties: { type: ['number', 'null'], minimum: 0 }, description: '来源未提供的指标保持 null，绝不补零' },
    CreatorHotness: { type: 'object', required: ['formulaVersion', 'score', 'confidence', 'components', 'penalties'], properties: { formulaVersion: { const: 'creator-hotness-v1' }, score: { type: 'number', minimum: 0, maximum: 100 }, confidence: { enum: ['low', 'medium', 'high'] }, components: { type: 'object', additionalProperties: { type: ['number', 'null'] } }, penalties: { type: 'object', additionalProperties: { type: ['number', 'null'] } } } },
    CreatorPost: { type: 'object', required: ['id', 'creatorId', 'platform', 'url', 'title', 'publishedAt', 'metrics'], properties: { id: { type: 'string' }, creatorId: { type: 'string' }, platform: { type: 'string' }, url: { type: 'string', format: 'uri', pattern: '^https://' }, title: { type: 'string' }, text: { type: ['string', 'null'] }, publishedAt: { type: 'string', format: 'date-time' }, metrics: { $ref: '#/components/schemas/CreatorMetrics' }, hotness: { oneOf: [{ $ref: '#/components/schemas/CreatorHotness' }, { type: 'null' }] } } },
    CreatorPostIngest: { type: 'object', required: ['externalPostId', 'url', 'publishedAt'], properties: { externalPostId: { type: 'string' }, url: { type: 'string', format: 'uri', pattern: '^https://' }, title: { type: 'string' }, text: { type: 'string' }, visibility: { const: 'public' }, publishedAt: { type: 'string', format: 'date-time' }, editedAt: { type: ['string', 'null'], format: 'date-time' }, metrics: { $ref: '#/components/schemas/CreatorMetrics' } } },
    CreatorAccount: { type: 'object', properties: { id: { type: 'string' }, platform: { type: 'string' }, profileUrl: { type: 'string', format: 'uri' }, authState: { type: 'string' }, backfill: { type: 'object', required: ['state'], properties: { state: { $ref: '#/components/schemas/CreatorBackfillState' }, oldestFetchedAt: { type: ['string', 'null'], format: 'date-time' }, newestFetchedAt: { type: ['string', 'null'], format: 'date-time' }, historyLimitReason: { type: ['string', 'null'] } } } } },
    Creator: { type: 'object', required: ['id', 'displayName', 'reviewStatus', 'accounts'], properties: { id: { type: 'string' }, displayName: { type: 'string' }, reviewStatus: { enum: ['verified', 'candidate', 'rejected'] }, verticalIds: { type: 'array', items: { type: 'string' } }, accounts: { type: 'array', items: { $ref: '#/components/schemas/CreatorAccount' } } } },
    CreatorTopic: { type: 'object', required: ['id', 'title', 'formulaVersion', 'creatorCount', 'platformCount', 'evidence'], properties: { id: { type: 'string' }, title: { type: 'string' }, formulaVersion: { const: 'creator-topic-v1' }, creatorCount: { type: 'integer', minimum: 1 }, platformCount: { type: 'integer', minimum: 1 }, evidence: { type: 'array', items: { type: 'object', required: ['url'], properties: { postId: { type: 'string' }, url: { type: 'string', format: 'uri', pattern: '^https://' } } } } } },
    CreatorEvent: { type: 'object', required: ['seq', 'eventType', 'entityType', 'entityId', 'occurredAt'], properties: { seq: { type: 'integer', minimum: 1 }, eventType: { enum: ['post.published', 'post.hot', 'topic.multi_creator', 'topic.cross_platform'] }, entityType: { enum: ['post', 'topic'] }, entityId: { type: 'string' }, verticalId: { type: ['string', 'null'] }, platform: { type: ['string', 'null'] }, score: { type: ['number', 'null'] }, occurredAt: { type: 'string', format: 'date-time' } } },
    DeliveryEndpoint: { type: 'object', required: ['id', 'type', 'destination', 'enabled'], properties: { id: { type: 'string' }, type: { type: 'string' }, destination: { type: 'string' }, enabled: { type: 'boolean' } }, description: 'secretRef 和 secret 值不会出现在响应中' },
    CreatorSubscription: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, deliveryMode: { enum: ['immediate', 'digest'] }, endpointIds: { type: 'array', items: { type: 'string' } }, enabled: { type: 'boolean' } } },
    CreatorDelivery: { type: 'object', properties: { id: { type: 'string' }, status: { enum: ['pending', 'leased', 'retry', 'delivered', 'dead'] }, attemptCount: { type: 'integer', minimum: 0 }, nextAttemptAt: { type: ['string', 'null'], format: 'date-time' } } },
    MaintenancePreview: { type: 'object', required: ['token', 'expiresAt', 'candidates'], properties: { token: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' }, candidates: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } } } }
  };
}

const CREATOR_PROFILE_VALUES = ['general', 'short-video', 'tool-review', 'news-commentary', 'deep-dive'];
const creatorProfileParameter = () => queryParameter('profile', {
  schema: { enum: CREATOR_PROFILE_VALUES, default: 'general' },
  description: 'AI 博主画像：综合、短视频、工具实测、热点快评或深度拆解'
});

function buildOpenApiDocument(options = {}) {
  const origin = normalizeOrigin(options.origin);
  return {
    openapi: '3.1.0',
    info: {
      title: 'AyaNews Public Content API',
      version: '2.4.0',
      description: '面向开发者与 Agent 的新闻、Signal、跨垂类 Creator、事件 Topic、持久推送、历史覆盖与来源健康接口。所有证据保留原始 URL。'
    },
    servers: [{ url: origin }],
    tags: [
      { name: 'Research', description: '新闻检索与证据研究' },
      { name: 'Topics', description: '24/48/72 小时热点、趋势与创作者机会' },
      { name: 'Sources', description: '公开来源注册表与采集健康状态' },
      { name: 'Feeds', description: '轻量订阅格式' },
      { name: 'Creators', description: '四垂类 Creator、公开帖子、爆款和跨平台共题' },
      { name: 'Creator Sources', description: 'Creator 来源、配置、运行与历史覆盖状态' },
      { name: 'Creator Alerts', description: '登录态订阅、投递端点、SSE 和投递审计' },
      { name: 'Creator Ingest', description: 'YouTube WebSub 与签名 Sidecar 摄取' },
      { name: 'Creator Operations', description: '受管理密钥保护的导入、回填、维护、备份与导出' }
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
            queryParameter('topicId', { description: '可选的稳定 Topic ID；提供时优先读取该 Topic 当前窗口内的原始 Signal 证据' }),
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
      '/api/news/feed': { get: { ...getOperation('读取真实历史新闻流', [queryParameter('page', { type: 'integer', schema: { minimum: 1, default: 1 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Research'] } },
      '/api/news/domestic': { get: { ...getOperation('读取包含国内公开信号证据的热点', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } })]), tags: ['Topics'] } },
      '/api/news/hot-rank': { get: { ...getOperation('读取按真实趋势分排序的热点', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } })]), tags: ['Topics'] } },
      '/api/news/discover': { get: { ...getOperation('发现面向创作者的选题机会', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), creatorProfileParameter(), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Topics'] } },
      '/api/news/dashboard': { get: { ...getOperation('读取 News、Topic 与来源健康聚合面板', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } })]), tags: ['Topics', 'Sources'] } },
      '/api/news/by-source': { get: { ...getOperation('按旧 News 与 Signal 来源读取真实统计'), tags: ['Sources'] } },
      '/api/news/recommendations': { get: { ...getOperation('读取按来源、地区和证据类型轮换的真实新闻推荐', [queryParameter('userId', { description: '兼容旧客户端的推荐上下文标识，不读取私有用户数据' }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 30, default: 10 } })]), tags: ['Research'] } },
      '/api/signals/v1/topics': { get: { ...getOperation('读取持久化热点 Topic', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), queryParameter('page', { type: 'integer', schema: { minimum: 1, default: 1 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Topics'] } },
      '/api/signals/v1/topics/{id}': { get: { ...getOperation('读取 Topic 详情与原始证据'), tags: ['Topics'], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }, queryParameter('window', { schema: { enum: ['24h', '48h', '72h'] }, description: '可选；按同一时间窗裁剪证据并重算分数' })], responses: { 200: jsonResponse('Topic 详情', { $ref: '#/components/schemas/TopicResponse' }), 404: jsonResponse('Topic 不存在') } } },
      '/api/signals/v1/opportunities': { get: { ...getOperation('读取创作者机会', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), creatorProfileParameter(), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 20 } })]), tags: ['Topics'] } },
      '/api/signals/v1/opportunities/random': { get: { ...getOperation('从真实持久化 Topic 随机选择创作者机会', [queryParameter('window', { schema: { enum: ['24h', '48h', '72h'], default: '72h' } }), creatorProfileParameter(), queryParameter('exclude', { description: '排除上一条 Topic ID，避免连续重复选题' })]), tags: ['Topics'] } },
      '/api/signals/v1/sources': { get: { ...getOperation('读取 Signal 来源配置与实际健康状态'), tags: ['Sources'] } },
      '/api/signals/v1/health': { get: { ...getOperation('读取 Signal 系统健康摘要'), tags: ['Sources'] } },
      '/api/signals/v1/changes': { get: { ...getOperation('读取 seq 游标之后的 Topic 变化', [queryParameter('since', { type: 'integer', schema: { minimum: 0, default: 0 } }), queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 500, default: 100 } })]), tags: ['Topics'], responses: { 200: jsonResponse('增量变化'), 410: jsonResponse('游标已过期，需要全量同步') } } },
      '/api/signals/v1/admin/refresh': { post: { summary: '受保护地刷新 Signal 并重建 Topic', tags: ['Topics'], security: [{ AdminApiKey: [] }], responses: { 200: jsonResponse('刷新完成'), 401: jsonResponse('缺少密钥'), 403: jsonResponse('密钥无效'), 503: jsonResponse('管理能力未配置') } } },
      '/feed.json': { get: { ...getOperation('JSON Feed 1.1', [queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 50 } })]), tags: ['Feeds'] } },
      '/rss.xml': { get: { summary: 'RSS 2.0 Feed', tags: ['Feeds'], responses: { 200: { description: 'RSS XML', content: { 'application/rss+xml': { schema: { type: 'string' } } } } } } },
      '/topics/feed.json': { get: { ...getOperation('Topic JSON Feed 1.1', [queryParameter('limit', { type: 'integer', schema: { minimum: 1, maximum: 100, default: 50 } })]), tags: ['Feeds'] } },
      '/topics/rss.xml': { get: { summary: 'Topic RSS 2.0 Feed', tags: ['Feeds'], responses: { 200: { description: 'Topic RSS XML', content: { 'application/rss+xml': { schema: { type: 'string' } } } } } } },
      ...buildCreatorPaths()
    },
    components: {
      securitySchemes: {
        AdminApiKey: { type: 'apiKey', in: 'header', name: 'x-admin-api-key' },
        SessionCookie: { type: 'apiKey', in: 'cookie', name: 'session_token', description: '由同站注册/登录接口设置的 HttpOnly Session Cookie' }
      },
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
        TopicResponse: { type: 'object', properties: { success: { const: true }, data: { $ref: '#/components/schemas/Topic' } } },
        ...buildCreatorSchemas()
      }
    }
  };
}

function buildPublicSkillMarkdown(options = {}) {
  const origin = normalizeOrigin(options.origin);
  return `# AyaNewsSkill\n\nAyaNews 官方 Research, Evidence & Creator Intelligence Skill。把 ${origin} 作为 AI 新闻、跨垂类博主内容、热点 Topic、真实选题和持久推送入口。\n\n## 何时使用\n\n当用户需要最新 AI 新闻、24h / 48h / 72h 热点、美妆 / 穿搭 / AI 科技 / 娱乐博主内容、爆款帖子、跨博主共题、创作者选题、跨来源核查、趋势解释、证据成稿或来源视野检查时使用。\n\n## 强制规则\n\n1. 先检索，后结论；不得用模型记忆补齐最新事实。\n2. 每个事实性结论必须保留原始来源 URL；原帖无法打开时降低确定性。\n3. 区分官方一手、研究论文、新闻报道、博主公开帖子、工程实践与推断。\n4. 重大结论优先寻找一手来源；只有 single-source / 单一来源时不得写成全网趋势。\n5. 来源冲突时并列呈现，不得隐藏冲突或自行伪造共识。\n6. 发布时间、采集时间、互动快照时间与事件发生时间必须分开。\n7. Trend Score、Creator Score 与 creator-hotness-v1 只是已采集信号的可解释排序，不等同于全网事实。\n8. unknown 指标保持 null；不得把缺失互动量改成 0。\n\n## Creator 覆盖语义\n\n- complete：cursor 已耗尽并完成二次 reconciliation。\n- partial：平台历史窗口、RSS/Atom 或配额只允许部分历史。\n- blocked：权限、风控或登录态阻止继续获取，并保留原因。\n- unconfigured：需要的密钥、授权或服务未配置；零网络请求。\n- Sidecar required：小红书、任意抖音/微博/B站深挖只能由运营方独立维护登录态 Sidecar，再经签名 Bridge 接入。\n\n“全部公开历史”只指已核验观察名单账号在平台当前允许读取的范围，不包含平台全部用户、私人、付费、已删除或越权内容。X、Instagram、Reddit 与抖音官方 Connector 未配置授权时必须显示 unconfigured，不得声称在线。\n\n## 来源层级\n\n- L1：免凭据公开主干（YouTube Atom、Bluesky、Mastodon、GitHub、RSS）。\n- L2：需要运营方密钥、OAuth、付费或审批的官方 API（YouTube Data、Reddit、X、Instagram、抖音）。\n- L3：运营方自托管桥接（RSSHub、NewsNow）。\n- L4：默认禁用的登录态 Sidecar（MediaCrawler、小红书 MCP、抖音解析器等），只经 HMAC Bridge 接入。\n\n## 创作者画像与垂类\n\n使用 general、short-video、tool-review、news-commentary、deep-dive 之一；垂类使用 ai-tech、beauty、fashion、entertainment。工具实测不会把纯论文作为默认选题，通用人文讨论也不会冒充热点。随机接口可用 exclude 排除上一题。\n\n## Creator Intelligence 接口\n\n- 垂类：${origin}/api/creators/v1/verticals\n- 博主：${origin}/api/creators/v1/creators?vertical=ai-tech&status=verified\n- 帖子全文搜索：${origin}/api/creators/v1/posts?q=Agent&vertical=ai-tech&cursor={opaqueCursor}\n- 爆款/共题：${origin}/api/creators/v1/hot?window=24h&type=cross_platform&vertical=ai-tech\n- Creator Topic：${origin}/api/creators/v1/topics?window=72h&vertical=beauty\n- 来源覆盖：${origin}/api/creators/v1/sources\n- 增量变化：${origin}/api/creators/v1/changes?since=0\n- 登录态 SSE：${origin}/api/creators/v1/stream；首次连接只追新，重连发送 Last-Event-ID；410 时按 resync 全量同步。\n\n## 新闻、Signal 与研究接口\n\n- 历史 News：${origin}/api/news/feed\n- 国内热点：${origin}/api/news/domestic?window=48h\n- 热点榜：${origin}/api/news/hot-rank?window=24h\n- 创作者发现：${origin}/api/news/discover?window=72h&profile=tool-review\n- Topic 详情：${origin}/api/signals/v1/topics/{id}?window=48h\n- 随机真实选题：${origin}/api/signals/v1/opportunities/random?window=72h&profile=general&exclude={previousId}\n- Signal 来源健康：${origin}/api/signals/v1/sources\n- Signal What Changed：${origin}/api/signals/v1/changes?since=0；收到 410 时重新读取 Topic 列表。\n- 证据包：${origin}/api/content/v1/brief?topic=AI%20Agent&topicId={id}&audience=creator&goal=research&format=article\n- OpenAPI：${origin}/openapi.json\n- Topic JSON Feed：${origin}/topics/feed.json\n\n## 推送正确性\n\nWebhook 已实现 HTTPS 目标限制、DNS/SSRF 防护、HMAC 签名、持久 outbox、重试、死信、人工 replay 与投递审计。订阅、端点、投递记录和 SSE 需要同站登录；端点 secret 只用服务端环境变量引用且不回显。飞书、企微、钉钉、Telegram、ntfy、Bark 等通道只有在运营方配置对应传输参数后才可用。\n\n## 人类工作台\n\n- 博主雷达：${origin}/creators\n- 垂类详情：${origin}/verticals/ai-tech\n- 来源：${origin}/sources\n- 推送：${origin}/alerts\n- 选题：${origin}/topics\n- 研究：${origin}/research\n- Skill：${origin}/skills\n\nMCP 与 A2A 协议端点尚未上线，不得声称可用。Creator Webhook 和 SSE 已上线；二者均需要对应认证、端点和服务端配置。\n`;
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
