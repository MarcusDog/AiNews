const test = require('node:test');
const assert = require('node:assert/strict');

const ContentService = require('../services/ContentService');

const NEWS = [
  { id: 'official', title: 'Agent 官方发布', description: 'Agent 发布说明', source: 'Qwen 官方博客', url: 'https://qwen.test/agent', publishedAt: '2026-08-06T03:00:00Z', category: 'AI新闻', region: 'cn', sourceGroup: 'product' },
  { id: 'paper', title: 'Agent benchmark paper', description: 'Agent evaluation research', source: 'arXiv Artificial Intelligence', url: 'https://arxiv.test/agent', publishedAt: '2026-08-05T03:00:00Z', category: '新算法', region: 'global', sourceGroup: 'research' },
  { id: 'media', title: 'Agent adoption report', description: 'Agent industry coverage', source: 'MIT Technology Review AI', url: 'https://media.test/agent', publishedAt: '2026-08-04T03:00:00Z', category: 'AI新闻', region: 'global', sourceGroup: 'investment' },
  { id: 'same-source', title: 'Agent second media story', description: 'Agent follow up', source: 'MIT Technology Review AI', url: 'https://media.test/agent-2', publishedAt: '2026-08-03T03:00:00Z', category: 'AI新闻', region: 'global', sourceGroup: 'investment' }
];

test('content brief selects a diverse evidence pack and every claim has a citation', () => {
  const brief = ContentService.buildBriefFromArticles(NEWS, {
    topic: 'Agent',
    audience: '小型电商商家',
    goal: '降低客服成本',
    format: 'short-video',
    limit: 3
  });

  assert.equal(brief.evidence.length, 3);
  assert.deepEqual(new Set(brief.evidence.map((item) => item.evidenceType)), new Set(['official', 'research', 'media']));
  assert(brief.evidence.every((item, index) => item.citationId === `S${index + 1}` && item.url));
  assert(brief.outputGuide.sections.every((section) => section.citationRequired === true));
  assert.match(brief.prompt, /\[S1\]/);
  assert.match(brief.prompt, /不得把媒体转述写成已证实事实/);
  assert.equal(brief.diversity.regions, 2);
});

test('content brief reports insufficient evidence instead of inventing an answer', () => {
  const brief = ContentService.buildBriefFromArticles([], { topic: '不存在的话题', format: 'article' });

  assert.equal(brief.status, 'insufficient_evidence');
  assert.deepEqual(brief.evidence, []);
  assert.match(brief.notice, /没有足够来源/);
});

test('multi-word topics do not match unrelated stories through the generic AI token alone', () => {
  const selected = ContentService.selectDiverseEvidence([
    ...NEWS,
    { id: 'weather', title: 'AI weather forecasting', description: 'A new forecast model', source: 'Weather Lab', url: 'https://weather.test/model', publishedAt: '2026-08-06T06:00:00Z', region: 'global', sourceGroup: 'product' }
  ], { topic: 'AI Agent', limit: 8 });

  assert(selected.some((item) => item.id === 'official'));
  assert(!selected.some((item) => item.id === 'weather'));
});
