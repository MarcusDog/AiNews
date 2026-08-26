const test = require('node:test');
const assert = require('node:assert/strict');

const TrendAnalyzer = require('../services/TrendAnalyzer');

const NOW = new Date('2026-08-06T12:00:00.000Z');

function article(id, daysAgo, text, source = 'Example Source') {
  return {
    id,
    title: text,
    description: '',
    source,
    url: `https://example.com/${id}`,
    publishedAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString()
  };
}

test('keyword extraction uses boundaries and prefers the most specific overlapping term', () => {
  const extracted = TrendAnalyzer.extractKeywords('A report said GPT-5 ships through an API.');
  const names = extracted.map((item) => item.keyword);

  assert(names.includes('GPT-5'));
  assert(names.includes('API'));
  assert(!names.includes('GPT'));
  assert(!names.includes('AI'));
});

test('time windows are cumulative and trend direction compares equal seven-day periods', async () => {
  const news = [
    article('recent-1', 0.2, 'AI Agent for commerce'),
    article('recent-2', 2, 'AI Agent for support'),
    article('recent-3', 5, 'AI Agent workflow'),
    article('previous-1', 10, 'AI Agent benchmark'),
    article('month-1', 20, 'Robotics benchmark')
  ];

  const result = await TrendAnalyzer.analyzeTrends(news, NOW);
  const agent = result.topKeywords.find((item) => item.keyword === 'AI Agent');

  assert.deepEqual(result.timeDistribution, { last24h: 1, last7d: 3, last30d: 5 });
  assert.equal(agent.recentCount, 3);
  assert.equal(agent.previousCount, 1);
  assert.equal(agent.growth, 200);
  assert.equal(agent.trend, 'surging');
  assert.deepEqual(agent.sources.map((source) => source.url).sort(), [
    'https://example.com/recent-1',
    'https://example.com/recent-2',
    'https://example.com/recent-3'
  ]);
});

test('declining trends are possible and descriptions are deterministic', async () => {
  const news = [
    article('recent-1', 2, 'RAG update'),
    article('previous-1', 8, 'RAG update'),
    article('previous-2', 10, 'RAG update'),
    article('previous-3', 12, 'RAG update'),
    article('baseline', 20, 'Robotics benchmark')
  ];

  const first = await TrendAnalyzer.analyzeTrends(news, NOW);
  const second = await TrendAnalyzer.analyzeTrends(news, NOW);
  const rag = first.topKeywords.find((item) => item.keyword === 'RAG');

  assert.equal(rag.trend, 'declining');
  assert.equal(rag.growth, -67);
  assert.deepEqual(first.decliningTrends, second.decliningTrends);
});

test('trend direction stays unclassified until the previous seven-day baseline exists', async () => {
  const news = [
    article('recent-1', 1, 'AI Agent update'),
    article('recent-2', 3, 'AI Agent update')
  ];

  const result = await TrendAnalyzer.analyzeTrends(news, NOW);
  const agent = result.topKeywords.find((item) => item.keyword === 'AI Agent');

  assert.equal(result.comparison.status, 'insufficient_history');
  assert.equal(agent.trend, 'insufficient');
  assert.equal(agent.growth, null);
});
