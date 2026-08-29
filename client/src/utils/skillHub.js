const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const formatMetric = (value) => {
  const number = toFiniteNumber(value);
  return number === null ? '—' : new Intl.NumberFormat('zh-CN').format(number);
};

export const formatDateTime = (value) => {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

const uniqueBlindSpots = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.id || `${item?.dimension || ''}:${item?.label || ''}`;
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildVisionConsole = ({
  review,
  diversity,
  stats,
  newsStatus,
  sourceHealth
} = {}) => {
  const summary = sourceHealth?.summary || {};
  const sources = Array.isArray(sourceHealth?.sources) ? sourceHealth.sources : [];
  const score = toFiniteNumber(diversity?.diversityScore);
  const reviewScore = toFiniteNumber(review?.score);
  const totalNews = toFiniteNumber(stats?.total);
  const totalSources = toFiniteNumber(summary.total);
  const hasLiveData = [score, reviewScore, totalNews, totalSources].some((value) => value !== null);

  return {
    dataState: hasLiveData ? 'live' : 'unavailable',
    score,
    reviewScore,
    riskLevel: diversity?.riskLevel || review?.riskLevel || 'unknown',
    totalNews,
    today: toFiniteNumber(stats?.today),
    totalSources,
    healthySources: toFiniteNumber(summary.healthy),
    delayedSources: toFiniteNumber(summary.delayed),
    errorSources: toFiniteNumber(summary.error),
    pendingSources: toFiniteNumber(summary.pending),
    inactiveSources: toFiniteNumber(summary.inactive),
    dimensions: Array.isArray(diversity?.dimensions) ? diversity.dimensions : [],
    blindSpots: uniqueBlindSpots([
      ...(Array.isArray(diversity?.blindSpots) ? diversity.blindSpots : []),
      ...(Array.isArray(review?.metrics?.blindSpots) ? review.metrics.blindSpots : [])
    ]),
    scope: diversity?.analyzedScope || '尚无分析范围',
    methodology: diversity?.methodology || '',
    reviewStatus: review?.status || 'unavailable',
    reviewDate: review?.auditDate || null,
    reviewModel: review?.model || null,
    reviewSummary: review?.summary || '',
    reviewSources: Array.isArray(review?.sources) ? review.sources : [],
    sourceSummary: summary,
    sources,
    lastUpdate: newsStatus?.lastUpdate || stats?.lastUpdate || null,
    ingestionStatus: newsStatus?.status || '状态未知'
  };
};

export const filterSourceRegistry = (sources = [], filters = {}) => {
  const query = String(filters.query || '').trim().toLowerCase();
  const group = filters.group || 'all';
  const status = filters.status || 'all';

  return (Array.isArray(sources) ? sources : []).filter((source) => {
    const haystack = [source.name, source.category, source.sourceGroupLabel, source.language]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (!query || haystack.includes(query))
      && (group === 'all' || source.sourceGroup === group)
      && (status === 'all' || source.status === status);
  });
};

export const getIntegrationCatalog = (origin = '') => {
  const base = String(origin || '').replace(/\/$/, '');
  return [
    {
      id: 'skill',
      label: 'Skill',
      status: 'live',
      endpoint: `${base}/downloads/AyaNewsSkill.zip`,
      description: '下载可安装 Skill，内含证据规则、CLI 与内容模板。',
      code: `curl -LO "${base}/downloads/AyaNewsSkill.zip"`
    },
    {
      id: 'rest',
      label: 'REST API',
      status: 'live',
      endpoint: `${base}/api/content/v1/capabilities`,
      description: '读取最新资讯、搜索、趋势与证据包；无需 API Key。',
      code: `curl "${base}/api/content/v1/latest?limit=10"`
    },
    {
      id: 'a2a',
      label: 'A2A',
      status: 'planned',
      endpoint: '',
      description: 'A2A Agent Card 与协议端点尚未上线；当前不会把普通 REST 接口伪装成 A2A。',
      code: ''
    },
    {
      id: 'rss',
      label: 'RSS / Feed',
      status: 'live',
      endpoint: `${base}/feed.json`,
      description: '通过 RSS 2.0 或 JSON Feed 1.1 订阅最新公开资讯。',
      code: `curl "${base}/feed.json"\n# 或：${base}/rss.xml`
    },
    {
      id: 'mcp',
      label: 'MCP',
      status: 'planned',
      endpoint: '',
      description: 'Remote MCP 尚未上线；页面不会提供不可运行的连接配置。',
      code: ''
    },
    {
      id: 'webhook',
      label: 'Webhook',
      status: 'planned',
      endpoint: '',
      description: '签名 Webhook 与投递重试仍在规划中，当前实时更新由站内 WebSocket 使用。',
      code: ''
    }
  ];
};
