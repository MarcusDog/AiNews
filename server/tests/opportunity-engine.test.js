const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOpportunity } = require('../services/signals/opportunity-engine');

function topic(overrides = {}) {
  return {
    title: 'Acme AI 工具发布',
    summary: '包含安装教程与真实用例',
    trendScore: 80,
    firstSeenAt: '2026-08-27T06:00:00.000Z',
    signals: [{
      sourceId: 'github', platform: 'github', kind: 'repository',
      title: 'Acme AI 工具发布', summary: '安装教程',
      metrics: { comments: 9, replies: 0, shares: 0 }
    }, {
      sourceId: 'youtube', platform: 'youtube', kind: 'video',
      title: 'Acme demo', summary: '', metrics: {}
    }],
    ...overrides
  };
}

test('opportunity-v1 follows frozen creator formula for cross-platform project evidence', () => {
  const result = buildOpportunity(topic(), { now: '2026-08-27T12:00:00.000Z' });
  assert.equal(result.formulaVersion, 'opportunity-v1');
  assert.equal(result.scoreBreakdown.trendContribution, 44);
  assert.equal(result.scoreBreakdown.utility, 15);
  assert.equal(result.scoreBreakdown.demo, 10);
  assert.equal(result.scoreBreakdown.novelty, 10);
  assert.equal(result.scoreBreakdown.discussion, 2);
  assert.equal(result.penalty, 1);
  assert.equal(result.creatorScore, 81);
  assert.equal(result.rawInputs.sourceCount, 2);
  assert.equal(result.rawInputs.platformCount, 2);
});

test('single-source topics receive an explicit evidence penalty and risk note', () => {
  const result = buildOpportunity(topic({ signals: [topic().signals[0]] }), {
    now: '2026-08-27T12:00:00.000Z'
  });
  assert.equal(result.penalty, 0.85);
  assert(result.riskNotes.some((note) => note.includes('单一')));
  assert(result.creatorScore < 81);
});

test('angles are deterministic for beginner, general and creator audiences without added claims', () => {
  const result = buildOpportunity(topic(), { now: '2026-08-27T12:00:00.000Z' });
  assert.deepEqual(result.angles.map((angle) => angle.audience), ['beginner', 'general', 'creator']);
  assert(result.angles.every((angle) => angle.title.includes('Acme AI 工具发布')));
  assert(result.angles.every((angle) => !/百万|第一|颠覆|爆火/.test(angle.title)));
});

test('news-only older evidence receives no invented utility or demo capability', () => {
  const result = buildOpportunity(topic({
    title: 'AI 政策更新', summary: null, firstSeenAt: '2026-08-24T00:00:00.000Z', trendScore: 20,
    signals: [{ sourceId: 'news', platform: 'news', kind: 'news', title: 'AI 政策更新', metrics: {} }]
  }), { now: '2026-08-27T12:00:00.000Z' });
  assert.equal(result.scoreBreakdown.utility, 0);
  assert.equal(result.scoreBreakdown.demo, 2);
  assert.equal(result.scoreBreakdown.novelty, 2);
  assert.equal(result.rawInputs.discussion, 0);
});
