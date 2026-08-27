const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOpportunity, isCreatorOpportunity } = require('../services/signals/opportunity-engine');

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

test('opportunity-v2 preserves the base creator formula for cross-platform project evidence', () => {
  const result = buildOpportunity(topic(), { now: '2026-08-27T12:00:00.000Z' });
  assert.equal(result.formulaVersion, 'opportunity-v2');
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

test('creator eligibility rejects generic philosophical discussion and paper-only tool pitches', () => {
  const philosophy = topic({
    title: 'What enables consciousness in humans?', summary: null, trendScore: 70,
    signals: [{ sourceId: 'reddit-artificial', platform: 'reddit', kind: 'discussion', title: 'What enables consciousness in humans?', metrics: { comments: 120 } }]
  });
  const paper = topic({
    title: 'Autonomous geospatial prediction via embeddings', summary: 'A field robotics paper', trendScore: 70,
    signals: [{ sourceId: 'arxiv', platform: 'news', kind: 'paper', title: 'Autonomous geospatial prediction via embeddings', metrics: {} }]
  });

  assert.equal(isCreatorOpportunity(philosophy, { profile: 'general', now: '2026-08-27T12:00:00.000Z' }), false);
  assert.equal(isCreatorOpportunity(paper, { profile: 'tool-review', now: '2026-08-27T12:00:00.000Z' }), false);
});

test('creator profiles produce a named profile angle and profile-specific ranking contribution', () => {
  const shortVideo = buildOpportunity(topic(), { profile: 'short-video', now: '2026-08-27T12:00:00.000Z' });
  const deepDive = buildOpportunity(topic(), { profile: 'deep-dive', now: '2026-08-27T12:00:00.000Z' });

  assert.equal(shortVideo.formulaVersion, 'opportunity-v2');
  assert.equal(shortVideo.profile, 'short-video');
  assert.equal(deepDive.profile, 'deep-dive');
  assert.notEqual(shortVideo.scoreBreakdown.profileContribution, deepDive.scoreBreakdown.profileContribution);
  assert(shortVideo.angles.some((angle) => angle.audience === 'creator' && angle.title.includes('短视频')));
  assert(deepDive.angles.some((angle) => angle.audience === 'creator' && angle.title.includes('深度')));
});
