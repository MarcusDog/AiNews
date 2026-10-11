const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContentIdea } = require('../services/creators/content-idea-engine');
const ContentService = require('../services/ContentService');

const profiles = ['short-video', 'tool-review', 'news-commentary', 'deep-dive', 'general'];
const verticals = ['beauty', 'fashion', 'ai-tech', 'entertainment'];

function topic(verticalId = 'ai-tech', overrides = {}) {
  return {
    id: `topic-${verticalId}`,
    verticalId,
    title: verticalId === 'beauty' ? '三位成分博主同时实测新型防晒剂'
      : verticalId === 'fashion' ? '四位穿搭博主集中讨论薄底鞋回潮'
        : verticalId === 'entertainment' ? '三位影评人同步解析新片票房逆袭'
          : '三位开发者实测 OpenAI 新编程 Agent',
    creatorCount: 3,
    platformCount: 2,
    maxHotness: 82,
    firstSeenAt: '2026-08-29T01:00:00.000Z',
    latestSeenAt: '2026-08-29T05:00:00.000Z',
    evidence: [
      { postId: 'p1', url: 'https://youtube.example/p1', creatorId: 'c1', title: '第一份实测' },
      { postId: 'p2', url: 'https://x.example/p2', creatorId: 'c2', title: '第二份实测' },
      { postId: 'p3', url: 'https://youtube.example/p3', creatorId: 'c3', title: '第三份实测' }
    ],
    ...overrides
  };
}

test('all four verticals and five existing creator profiles produce complete evidence-backed ideas', () => {
  for (const verticalId of verticals) {
    for (const profile of profiles) {
      const idea = buildContentIdea(topic(verticalId), { profile });
      assert.equal(idea.status, 'ready', `${verticalId}/${profile}`);
      assert.equal(idea.profile, profile);
      assert.equal(idea.verticalId, verticalId);
      for (const field of ['subject', 'whyNow', 'targetAudience', 'format', 'hook', 'uncertainty']) {
        assert.equal(typeof idea[field], 'string', `${verticalId}/${profile}/${field}`);
        assert(idea[field].length > 5, `${verticalId}/${profile}/${field}`);
      }
      assert(idea.outline.length >= 3);
      assert(idea.sources.length >= 2);
      assert(idea.sources.every((source) => source.url.startsWith('https://')));
      assert(Array.isArray(idea.disclosureRisks));
    }
  }
});

test('single-source evidence is not presented as a trend', () => {
  const idea = buildContentIdea(topic('ai-tech', {
    creatorCount: 1, platformCount: 1,
    evidence: [{ postId: 'p1', url: 'https://youtube.example/p1', creatorId: 'c1' }]
  }), { profile: 'news-commentary' });
  assert.equal(idea.status, 'insufficient_evidence');
  assert.match(idea.uncertainty, /单一来源|不能证明趋势/);
  assert(!/全网趋势|都在讨论/.test(idea.hook));
});

test('generic humanities questions without a concrete subject are rejected', () => {
  const idea = buildContentIdea(topic('ai-tech', {
    title: 'AI 会改变人类吗？', creatorCount: 0, platformCount: 0, evidence: []
  }), { profile: 'general' });
  assert.equal(idea.status, 'rejected');
  assert.equal(idea.reason, 'generic_or_unsupported_subject');
});

test('tool-review remains valid and review is not introduced as an alias', () => {
  assert.equal(buildContentIdea(topic(), { profile: 'tool-review' }).profile, 'tool-review');
  assert.throws(() => buildContentIdea(topic(), { profile: 'review' }), /unsupported creator profile/);
});

test('ContentService loads a Creator Topic evidence pack without changing Signal brief behavior', () => {
  const creatorStore = { db: { prepare(sql) {
    if (sql.includes('FROM creator_topics')) return { get: () => ({
      id: 'topic-ai-tech', vertical_id: 'ai-tech', title: '三位开发者实测 OpenAI 新编程 Agent',
      creator_count: 3, platform_count: 2, hotness: 82,
      first_seen_at: '2026-08-29T01:00:00.000Z', latest_seen_at: '2026-08-29T05:00:00.000Z',
      payload_json: '{"snapshotVersion":"creator-topic-v1"}'
    }) };
    return { all: () => [
      { id: 'p1', creator_id: 'c1', title: '实测一', url: 'https://youtube.example/p1', source_confidence: 'official' },
      { id: 'p2', creator_id: 'c2', title: '实测二', url: 'https://x.example/p2', source_confidence: 'public' }
    ] };
  } } };
  const brief = ContentService.buildBriefFromCreatorTopic('topic-ai-tech', {
    creatorStore, profile: 'tool-review'
  });
  assert.equal(brief.status, 'ready');
  assert.equal(brief.idea.profile, 'tool-review');
  assert.equal(brief.idea.status, 'ready');
  assert.equal(brief.evidence.length, 2);
  assert.match(brief.evidenceBoundary, /观察名单/);
});
