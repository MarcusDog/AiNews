const TRUST_CLASSES = ['official', 'community_api', 'public_feed', 'bridge'];
const SOURCE_TIERS = ['L1', 'L2', 'L3', 'L4'];
const SOURCE_REGIONS = ['cn', 'global'];

const source = (config) => ({
  enabled: true,
  configured: true,
  schedulable: true,
  timeoutMs: 15000,
  trustClass: 'public_feed',
  setupHint: null,
  ...config
});

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeBaseUrl(value) {
  if (!hasValue(value)) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function hasValidBridgeConfig(raw) {
  if (!hasValue(raw)) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.some((item) => item && hasValue(item.id) && normalizeBaseUrl(item.url));
  } catch {
    return false;
  }
}

function configuredMastodonInstances(raw) {
  const defaults = ['https://mastodon.social'];
  if (!hasValue(raw)) return defaults;
  const unique = new Set(raw.split(',').map((item) => normalizeBaseUrl(item)).filter(Boolean));
  return [...unique].slice(0, 10);
}

function configuredRedditCommunities(raw) {
  const defaults = ['LocalLLaMA', 'MachineLearning', 'artificial'];
  if (!hasValue(raw)) return defaults;
  const unique = new Set(raw.split(',').map((item) => item.trim()).filter((item) => /^[A-Za-z0-9_]{1,32}$/.test(item)));
  return [...unique].slice(0, 20);
}

function sourceSlug(value) {
  return value.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildSignalSourceCatalog(env = process.env) {
  // Dev fallback: if no real L2/L3/L4 env is set, point at the local mock
  // router mounted under /api/_mock/*. This makes the sources page show
  // "已配置 (dev mock)" rather than "未配置" for operators running the
  // repo without real credentials.
  const DEV_MOCK_BASE = 'http://127.0.0.1:3002/api/_mock';
  const isDev = env.NODE_ENV !== 'production' || env.AYANEWS_DEV_MOCK === '1';
  const rsshubBaseUrl = normalizeBaseUrl(env.RSSHUB_BASE_URL)
    || (isDev ? `${DEV_MOCK_BASE}/rsshub` : null);
  const newsNowBaseUrl = normalizeBaseUrl(env.NEWSNOW_BASE_URL)
    || (isDev ? `${DEV_MOCK_BASE}/newsnow` : null);
  const youtubeConfigured = hasValue(env.YOUTUBE_API_KEY) || isDev;
  const xConfigured = hasValue(env.X_BEARER_TOKEN) || isDev;
  const customBridgeConfigured = hasValidBridgeConfig(env.SIGNAL_BRIDGES_JSON) || isDev;
  const mastodonInstances = configuredMastodonInstances(env.MASTODON_INSTANCES);
  const redditCommunities = configuredRedditCommunities(env.REDDIT_COMMUNITIES);

  const devBadge = isDev && !hasValue(env.YOUTUBE_API_KEY) ? '（dev mock）' : '';

  return [
    source({
      id: 'legacy-news',
      name: 'AyaNews 新闻与官方发布',
      tier: 'L1',
      platform: 'news',
      region: 'global',
      mode: 'database',
      adapter: 'legacy-news',
      trustClass: 'official',
      timeoutMs: 5000
    }),
    source({
      id: 'hackernews-ai',
      name: 'Hacker News AI',
      tier: 'L1',
      platform: 'hackernews',
      region: 'global',
      mode: 'api',
      adapter: 'hacker-news',
      trustClass: 'community_api',
      endpoint: 'https://hn.algolia.com/api/v1/search_by_date'
    }),
    source({
      id: 'github-recent-ai',
      name: 'GitHub 新兴 AI 项目',
      tier: 'L1',
      platform: 'github',
      region: 'global',
      mode: 'api',
      adapter: 'github',
      trustClass: 'official',
      endpoint: 'https://api.github.com/search/repositories'
    }),
    ...mastodonInstances.map((instance, index) => source({
      id: index === 0 && instance === 'https://mastodon.social' ? 'mastodon-trends' : `mastodon-${sourceSlug(instance)}`,
      name: `Mastodon 趋势（${new URL(instance).hostname}）`,
      tier: 'L1',
      platform: 'mastodon',
      region: 'global',
      mode: 'api',
      adapter: 'mastodon',
      trustClass: 'community_api',
      endpoint: `${instance}/api/v1/trends`
    })),
    ...redditCommunities.map((community) => source({
      id: `reddit-${community.toLowerCase()}`,
      name: `Reddit r/${community}`,
      tier: 'L1',
      platform: 'reddit',
      region: 'global',
      mode: 'rss',
      adapter: 'rss-signal',
      trustClass: 'public_feed',
      endpoint: `https://www.reddit.com/r/${community}/.rss`,
      community
    })),
    source({
      id: 'huggingface-trending',
      name: 'Hugging Face Trending',
      tier: 'L1',
      platform: 'huggingface',
      region: 'global',
      mode: 'api',
      adapter: 'hugging-face',
      trustClass: 'official',
      endpoint: 'https://huggingface.co/api/trending'
    }),
    source({
      id: 'bilibili-ai-popular',
      name: 'Bilibili AI 热门',
      tier: 'L1',
      platform: 'bilibili',
      region: 'cn',
      mode: 'api',
      adapter: 'bilibili',
      trustClass: 'community_api',
      endpoint: 'https://api.bilibili.com/x/web-interface/popular'
    }),
    source({
      id: 'youtube-search',
      name: 'YouTube AI 视频',
      tier: 'L2',
      platform: 'youtube',
      region: 'global',
      mode: 'api',
      adapter: 'youtube',
      trustClass: 'official',
      configured: youtubeConfigured,
      schedulable: youtubeConfigured,
      credentialLabel: 'YOUTUBE_API_KEY',
      endpoint: youtubeConfigured && hasValue(env.YOUTUBE_API_KEY) ? 'https://www.googleapis.com/youtube/v3/search' : `${DEV_MOCK_BASE}/youtube/search`,
      setupHint: youtubeConfigured && hasValue(env.YOUTUBE_API_KEY) ? '配置 YouTube Data API Key 后启用' : `dev mock 已启用；配置 YOUTUBE_API_KEY 切换为真实源${devBadge}`
    }),
    source({
      id: 'x-recent-search',
      name: 'X Recent Search',
      tier: 'L2',
      platform: 'x',
      region: 'global',
      mode: 'api',
      adapter: 'x',
      trustClass: 'official',
      configured: xConfigured,
      schedulable: xConfigured,
      credentialLabel: 'X_BEARER_TOKEN',
      endpoint: xConfigured && hasValue(env.X_BEARER_TOKEN) ? 'https://api.x.com/2/tweets/search/recent' : `${DEV_MOCK_BASE}/x/tweets/search/recent`,
      setupHint: xConfigured && hasValue(env.X_BEARER_TOKEN) ? '配置 X API Bearer Token 后启用' : `dev mock 已启用；配置 X_BEARER_TOKEN 切换为真实源${devBadge}`
    }),
    ...[
      ['rsshub-weibo-hot', '微博热搜（RSSHub）', 'weibo', 'weibo/search/hot'],
      ['rsshub-zhihu-hot', '知乎热榜（RSSHub）', 'zhihu', 'zhihu/hotlist'],
      ['rsshub-douyin-hot', '抖音热榜（RSSHub）', 'douyin', 'douyin/hot']
    ].map(([id, name, platform, route]) => source({
      id,
      name,
      tier: 'L3',
      platform,
      region: 'cn',
      mode: 'rss',
      adapter: 'rss-signal',
      trustClass: 'bridge',
      configured: Boolean(rsshubBaseUrl),
      schedulable: Boolean(rsshubBaseUrl),
      endpoint: rsshubBaseUrl ? `${rsshubBaseUrl}/${route}` : null,
      route,
      setupHint: rsshubBaseUrl && env.RSSHUB_BASE_URL ? '配置自托管 RSSHUB_BASE_URL 后启用' : `dev mock 已启用；配置 RSSHUB_BASE_URL 切换为真实源${devBadge}`
    })),
    ...[
      ['newsnow-weibo', '微博热榜（NewsNow）', 'weibo', 'weibo'],
      ['newsnow-bilibili', 'Bilibili 热榜（NewsNow）', 'bilibili', 'bilibili'],
      ['newsnow-zhihu', '知乎热榜（NewsNow）', 'zhihu', 'zhihu']
    ].map(([id, name, platform, sourceId]) => source({
      id,
      name,
      tier: 'L3',
      platform,
      region: 'cn',
      mode: 'api',
      adapter: 'newsnow',
      trustClass: 'bridge',
      configured: Boolean(newsNowBaseUrl),
      schedulable: Boolean(newsNowBaseUrl),
      endpoint: newsNowBaseUrl ? `${newsNowBaseUrl}/api/s` : null,
      sourceId,
      setupHint: newsNowBaseUrl && env.NEWSNOW_BASE_URL ? '配置自托管 NEWSNOW_BASE_URL 后启用' : `dev mock 已启用；配置 NEWSNOW_BASE_URL 切换为真实源${devBadge}`
    })),
    source({
      id: 'custom-json-bridges',
      name: '自定义 Signal JSON Bridges',
      tier: 'L3',
      platform: 'custom',
      region: 'global',
      mode: 'bridge',
      adapter: 'json-bridge',
      trustClass: 'bridge',
      configured: customBridgeConfigured,
      schedulable: customBridgeConfigured,
      endpoint: hasValidBridgeConfig(env.SIGNAL_BRIDGES_JSON) ? null : `${DEV_MOCK_BASE}/bridge`,
      setupHint: hasValidBridgeConfig(env.SIGNAL_BRIDGES_JSON) ? '配置 SIGNAL_BRIDGES_JSON 后启用' : `dev mock 已启用；配置 SIGNAL_BRIDGES_JSON 切换为真实源${devBadge}`
    }),
    source({
      id: 'mediacrawler-sidecar',
      name: 'MediaCrawler 国内社交深挖',
      tier: 'L4',
      platform: 'multi-cn',
      region: 'cn',
      mode: 'sidecar',
      adapter: 'external-sidecar',
      trustClass: 'bridge',
      enabled: isDev,
      configured: isDev,
      schedulable: false,
      endpoint: `${DEV_MOCK_BASE}/mediacrawler`,
      setupHint: isDev ? 'dev mock 已启用；正式部署需用户自托管 MediaCrawler 并通过 JSON Bridge 接入' : '需用户自托管 MediaCrawler，并通过 JSON Bridge 接入'
    }),
    source({
      id: 'agent-reach-sidecar',
      name: 'Agent-Reach 工作站深挖',
      tier: 'L4',
      platform: 'multi-global',
      region: 'global',
      mode: 'sidecar',
      adapter: 'agent-reach',
      trustClass: 'bridge',
      enabled: true,
      configured: true,
      schedulable: true,
      endpoint: 'http://127.0.0.1:3002/api/agent-reach',
      routes: [
        'GET /doctor',
        'GET /youtube-search?q=...',
        'GET /web-read?url=...',
        'GET /rss?url=...',
        'GET /version'
      ],
      setupHint: '已对接 Panniantong/Agent-Reach CLI（pip3 install -e /opt/Agent-Reach）。详见 /docs/AGENT_REACH.md 与 /skills 页面。'
    })
  ];
}

function validateSignalSourceCatalog(catalog = []) {
  const errors = [];
  const ids = new Set();

  catalog.forEach((item, index) => {
    const label = item?.id || `#${index + 1}`;
    if (!item?.id) errors.push(`${label}: 缺少 id`);
    if (ids.has(item?.id)) errors.push(`${label}: id 重复`);
    if (!item?.name) errors.push(`${label}: 缺少名称`);
    if (!SOURCE_TIERS.includes(item?.tier)) errors.push(`${label}: tier 无效`);
    if (!SOURCE_REGIONS.includes(item?.region)) errors.push(`${label}: region 无效`);
    if (!TRUST_CLASSES.includes(item?.trustClass)) errors.push(`${label}: trustClass 无效`);
    if (!item?.platform) errors.push(`${label}: 缺少 platform`);
    if (!item?.mode) errors.push(`${label}: 缺少 mode`);
    if (!item?.adapter) errors.push(`${label}: 缺少 adapter`);
    if (!Number.isInteger(item?.timeoutMs) || item.timeoutMs <= 0) errors.push(`${label}: timeoutMs 无效`);
    if (item?.endpoint && !item.endpoint.startsWith('https://') && !item.endpoint.startsWith('http://127.0.0.1')) errors.push(`${label}: endpoint 必须使用 HTTPS`);
    if (item?.mode === 'sidecar' && item?.schedulable !== false) errors.push(`${label}: sidecar 不可调度`);
    ids.add(item?.id);
  });

  return errors;
}

module.exports = {
  SOURCE_REGIONS,
  SOURCE_TIERS,
  TRUST_CLASSES,
  buildSignalSourceCatalog,
  validateSignalSourceCatalog
};
