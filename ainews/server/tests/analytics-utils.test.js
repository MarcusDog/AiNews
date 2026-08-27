const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDailyTrendSeries,
  buildDiversitySnapshot,
  parseBoundedInteger
} = require('../utils/analytics');

test('daily trend series fills missing dates in Asia/Shanghai and groups categories by date', () => {
  const result = buildDailyTrendSeries({
    daily: [{ date: '2026-08-04', count: 3 }, { date: '2026-08-06', count: 2 }],
    dailyCategory: [
      { date: '2026-08-04', category: 'AI新闻', count: 2 },
      { date: '2026-08-04', category: '新算法', count: 1 },
      { date: '2026-08-06', category: '新工具', count: 2 }
    ],
    days: 3,
    today: new Date('2026-08-06T01:00:00.000Z'),
    timeZone: 'Asia/Shanghai'
  });

  assert.deepEqual(result.daily, [
    { date: '2026-08-04', count: 3, categories: { AI新闻: 2, 新算法: 1 } },
    { date: '2026-08-05', count: 0, categories: {} },
    { date: '2026-08-06', count: 2, categories: { 新工具: 2 } }
  ]);
  assert.equal(result.total, 5);
  assert.equal(result.changeRate, -33);
});

test('bounded integer parsing rejects invalid and oversized analytics windows', () => {
  assert.equal(parseBoundedInteger('999', { fallback: 7, min: 1, max: 30 }), 30);
  assert.equal(parseBoundedInteger('nope', { fallback: 7, min: 1, max: 30 }), 7);
});

test('diversity snapshot exposes regional and evidence blind spots with source links', () => {
  const articles = [
    { id: '1', title: 'One', source: 'Media A', url: 'https://a.test/1', category: 'AI新闻', region: 'global', sourceGroup: 'investment' },
    { id: '2', title: 'Two', source: 'Media A', url: 'https://a.test/2', category: 'AI新闻', region: 'global', sourceGroup: 'investment' },
    { id: '3', title: 'Three', source: 'Media B', url: 'https://b.test/3', category: 'AI新闻', region: 'global', sourceGroup: 'investment' }
  ];

  const result = buildDiversitySnapshot(articles);

  assert.equal(result.riskLevel, 'high');
  assert(result.blindSpots.some((item) => item.dimension === 'region' && item.missing.includes('cn')));
  assert(result.blindSpots.some((item) => item.dimension === 'evidence' && item.missing.includes('research')));
  assert(result.dimensions.every((dimension) => typeof dimension.score === 'number'));
  assert(result.sourceDistribution.every((source) => source.sampleUrl));
});

test('diversity snapshot treats severe concentration as a blind spot even when every bucket exists', () => {
  const dominant = Array.from({ length: 16 }, (_, index) => ({
    id: `paper-${index}`, title: `Paper ${index}`, source: `Research ${index % 4}`,
    url: `https://research.test/${index}`, category: '新算法', region: 'global', sourceGroup: 'research'
  }));
  const minority = [
    { id: 'official', title: 'Official', source: 'Qwen 官方博客', url: 'https://official.test', category: 'AI新闻', region: 'cn', sourceGroup: 'product' },
    { id: 'engineering', title: 'Engineering', source: '开源中国', url: 'https://engineering.test', category: 'AI框架', region: 'cn', sourceGroup: 'engineering' },
    { id: 'media', title: 'Media', source: 'TechCrunch AI', url: 'https://media.test', category: '新工具', region: 'global', sourceGroup: 'investment' },
    { id: 'idea', title: 'Idea', source: 'Google DeepMind', url: 'https://idea.test', category: '新思路', region: 'global', sourceGroup: 'official' }
  ];

  const result = buildDiversitySnapshot([...dominant, ...minority]);

  assert(result.blindSpots.some((item) => item.dimension === 'evidence' && item.dominant?.percentage >= 75));
  assert(result.blindSpots.some((item) => item.dimension === 'category' && item.dominant?.percentage >= 75));
  assert.equal(new Set(result.blindSpots.map((item) => item.id)).size, result.blindSpots.length);
  assert(result.recommendations.some((item) => item.includes('过度集中')));
});
