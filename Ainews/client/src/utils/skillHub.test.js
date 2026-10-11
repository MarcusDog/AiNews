import {
  buildVisionConsole,
  filterSourceRegistry,
  formatMetric,
  getIntegrationCatalog
} from './skillHub';

const REVIEW = {
  status: 'verified',
  score: 31,
  riskLevel: 'high',
  auditDate: '2026-08-26',
  model: 'MiniMax-M3',
  metrics: {
    publishers: 5,
    regions: 2,
    evidenceTypes: 3,
    selectedSources: 8,
    blindSpots: [{ id: 'evidence:missing', label: '证据盲区', missing: ['official'] }]
  }
};

const DIVERSITY = {
  diversityScore: 21,
  riskLevel: 'high',
  analyzedScope: '最近 200 条去重资讯',
  methodology: '真实样本熵分析',
  dimensions: [
    { id: 'source', label: '来源分散度', score: 20, coverage: 10, target: 8 },
    { id: 'region', label: '国内外覆盖', score: 19, coverage: 2, target: 2 }
  ],
  blindSpots: [{ id: 'source:concentration', label: '来源过度集中', dominant: { name: 'arXiv', percentage: 93 }, missing: [] }]
};

const SOURCES = [
  { name: 'OpenAI News', sourceGroup: 'product', sourceGroupLabel: '产品与官方', status: 'healthy', articleCount: 20 },
  { name: 'Tech Media', sourceGroup: 'investment', sourceGroupLabel: '媒体与产业', status: 'delayed', articleCount: 10 },
  { name: 'Disabled Feed', sourceGroup: 'research', sourceGroupLabel: '研究', status: 'inactive', articleCount: 0 }
];

test('buildVisionConsole only derives metrics from live payloads', () => {
  const consoleData = buildVisionConsole({
    review: REVIEW,
    diversity: DIVERSITY,
    stats: { total: 10978, today: 27 },
    newsStatus: { lastUpdate: '2026-08-26T10:19:53.671Z', status: '正常运行' },
    sourceHealth: { sources: SOURCES, summary: { total: 3, healthy: 1, delayed: 1, inactive: 1, error: 0, pending: 0 } }
  });

  expect(consoleData.score).toBe(21);
  expect(consoleData.reviewScore).toBe(31);
  expect(consoleData.totalNews).toBe(10978);
  expect(consoleData.totalSources).toBe(3);
  expect(consoleData.healthySources).toBe(1);
  expect(consoleData.blindSpots).toHaveLength(2);
  expect(consoleData.scope).toBe('最近 200 条去重资讯');
});

test('buildVisionConsole keeps unavailable values explicit instead of inventing zeroes', () => {
  const consoleData = buildVisionConsole({});

  expect(consoleData.score).toBeNull();
  expect(consoleData.totalNews).toBeNull();
  expect(consoleData.totalSources).toBeNull();
  expect(consoleData.dimensions).toEqual([]);
  expect(consoleData.dataState).toBe('unavailable');
});

test('source registry supports simultaneous query, group and status filters', () => {
  const result = filterSourceRegistry(SOURCES, {
    query: 'tech',
    group: 'investment',
    status: 'delayed'
  });

  expect(result).toEqual([SOURCES[1]]);
});

test('integration catalog labels live and planned capabilities honestly', () => {
  const catalog = getIntegrationCatalog('https://ainews.example');

  expect(catalog.find((item) => item.id === 'rest')).toMatchObject({ status: 'live' });
  expect(catalog.find((item) => item.id === 'a2a')).toMatchObject({ status: 'planned', endpoint: '', code: '' });
  expect(catalog.find((item) => item.id === 'mcp')).toMatchObject({ status: 'planned', code: '' });
  expect(catalog.find((item) => item.id === 'webhook')).toMatchObject({ status: 'planned', code: '' });
});

test('formatMetric preserves real zeroes and marks missing data', () => {
  expect(formatMetric(10978)).toBe('10,978');
  expect(formatMetric(0)).toBe('0');
  expect(formatMetric(null)).toBe('—');
});
