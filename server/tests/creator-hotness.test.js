const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const {
  FORMULA_VERSION,
  calculateVelocities,
  scoreCreatorPost
} = require('../services/creators/creator-hotness');

const NOW = '2026-08-29T12:00:00.000Z';

function metrics(capturedAt, likes, overrides = {}) {
  return {
    capturedAt, views: null, likes, comments: 0, shares: 0, bookmarks: 0,
    platformRank: null, followersAtCapture: null, ...overrides
  };
}

function post(overrides = {}) {
  return {
    id: 'post-1', accountId: 'account-1', platform: 'youtube',
    publishedAt: '2026-08-29T09:00:00.000Z', collectedAt: '2026-08-29T09:05:00.000Z',
    sourceConfidence: 'official', provenanceUrl: 'https://youtube.com/watch?v=one',
    metadata: {}, sharedFrom: null, ...overrides
  };
}

function snapshots() {
  return [
    metrics('2026-08-29T09:00:00.000Z', 0),
    metrics('2026-08-29T11:00:00.000Z', 50),
    metrics('2026-08-29T11:45:00.000Z', 200),
    metrics('2026-08-29T12:00:00.000Z', 230)
  ];
}

test('calculates 15, 60 and 180 minute engagement velocities plus acceleration', () => {
  const result = calculateVelocities(snapshots(), NOW);
  assert.equal(result.velocity15, 120);
  assert.equal(result.velocity60, 180);
  assert.equal(result.velocity180, 76.666667);
  assert.equal(result.acceleration, -60);
});

test('hotness persists formula inputs and weighted components sum exactly to the unrounded score', () => {
  const result = scoreCreatorPost({
    post: post(), snapshots: snapshots(), now: NOW,
    peers: { velocities: [20, 50, 100, 180, 300], accelerations: [-100, -60, 0, 100, 900] },
    creator30DayEngagements: [50, 80, 100, 120, 140],
    independentCreatorCount: 3, platformCount: 2
  });
  assert.equal(result.formulaVersion, FORMULA_VERSION);
  assert.equal(result.formulaVersion, 'creator-hotness-v1');
  const positive = Object.values(result.components).reduce((sum, value) => sum + value.weighted, 0);
  const penalties = Object.values(result.penalties).reduce((sum, value) => sum + value, 0);
  assert.equal(result.unroundedScore, positive - penalties);
  assert.equal(result.inputs.creatorMedianEngagement, 100);
  assert.equal(result.inputs.creatorRelativeRatio, 2.3);
  assert.equal(result.confidence, 'high');
});

test('creator-relative scoring gives small creators the same lift for the same baseline multiple', () => {
  const common = {
    now: NOW,
    peers: { velocities: [1, 2, 3], accelerations: [0, 1, 2] },
    independentCreatorCount: 1,
    platformCount: 1
  };
  const small = scoreCreatorPost({
    ...common, post: post(), snapshots: [metrics('2026-08-29T09:00:00.000Z', 0), metrics(NOW, 200, { followersAtCapture: 1_000 })],
    creator30DayEngagements: [80, 100, 120]
  });
  const large = scoreCreatorPost({
    ...common, post: post(), snapshots: [metrics('2026-08-29T09:00:00.000Z', 0), metrics(NOW, 20_000, { followersAtCapture: 1_000_000 })],
    creator30DayEngagements: [8_000, 10_000, 12_000]
  });
  assert.equal(small.inputs.creatorRelativeRatio, 2);
  assert.equal(large.inputs.creatorRelativeRatio, 2);
  assert.equal(small.components.creatorRelativePerformance.raw, large.components.creatorRelativePerformance.raw);
});

test('peer percentiles use only the same platform, vertical and publication-age bucket', () => {
  const result = scoreCreatorPost({
    post: post({ verticalIds: ['ai-tech'] }), snapshots: snapshots(), now: NOW,
    peerSamples: [
      { platform: 'youtube', verticalId: 'ai-tech', ageHours: 3, velocity: 100, acceleration: -100 },
      { platform: 'youtube', verticalId: 'ai-tech', ageHours: 5, velocity: 200, acceleration: 0 },
      { platform: 'x', verticalId: 'ai-tech', ageHours: 3, velocity: 10000, acceleration: 10000 },
      { platform: 'youtube', verticalId: 'beauty', ageHours: 3, velocity: 10000, acceleration: 10000 },
      { platform: 'youtube', verticalId: 'ai-tech', ageHours: 30, velocity: 10000, acceleration: 10000 }
    ],
    creator30DayEngagements: [100]
  });
  assert.equal(result.inputs.velocityPercentile, 50);
  assert.equal(result.inputs.peerScope.sampleCount, 2);
  assert.deepEqual(result.inputs.peerScope, {
    platform: 'youtube', verticalIds: ['ai-tech'], ageBucket: '0-6h', sampleCount: 2
  });
});

test('missing metrics remain null and lower confidence instead of becoming zero evidence', () => {
  const result = scoreCreatorPost({
    post: post({ sourceConfidence: 'bridge' }),
    snapshots: [{ capturedAt: NOW, views: null, likes: null, comments: null, shares: null, bookmarks: null }],
    now: NOW, peers: {}, creator30DayEngagements: []
  });
  assert.equal(result.inputs.velocities.velocity15, null);
  assert.equal(result.inputs.currentEngagement, null);
  assert.equal(result.confidence, 'low');
  assert(result.penalties.missingEvidence > 0);
  assert(result.penalties.lowConfidenceSource > 0);
});

test('advertisements, reshares and old-post replay receive explicit independent penalties', () => {
  const result = scoreCreatorPost({
    post: post({
      publishedAt: '2026-07-01T00:00:00.000Z',
      collectedAt: NOW,
      metadata: { isSponsored: true },
      sharedFrom: { platform: 'x', externalAccountId: 'other', externalPostId: 'old' }
    }),
    snapshots: snapshots(), now: NOW,
    peers: { velocities: [10, 50], accelerations: [0, 10] }, creator30DayEngagements: [100]
  });
  assert(result.penalties.advertisement > 0);
  assert(result.penalties.reshare > 0);
  assert(result.penalties.oldPostReplay > 0);
});

function storeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-hotness-store-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  store.syncVerticals([{ id: 'ai-tech', name: 'AI 科技', version: 'v1', keywords: [], negativeKeywords: [], createdAt: NOW }]);
  store.upsertCreators([{ id: 'creator-1', displayName: 'Creator', reviewStatus: 'verified', reviewedAt: NOW, verticalIds: ['ai-tech'] }]);
  store.upsertAccounts([{
    id: 'account-1', creatorId: 'creator-1', platform: 'youtube', externalAccountId: 'UC_one',
    profileUrl: 'https://youtube.com/channel/UC_one', region: 'global', sourceTier: 'L1', enabled: true,
    lastVerifiedAt: NOW, authState: 'not_required'
  }]);
  return { directory, store, close() { store.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

function storedPost(overrides = {}) {
  return {
    id: 'post-1', accountId: 'account-1', platform: 'youtube', externalPostId: 'video-1',
    url: 'https://youtube.com/watch?v=one', title: 'Post', text: 'Text', contentType: 'video',
    publishedAt: '2026-08-20T00:00:00.000Z', collectedAt: NOW, language: 'en',
    verticalIds: ['ai-tech'], sourceConfidence: 'official', provenanceUrl: 'https://youtube.com/watch?v=one',
    ...overrides
  };
}

test('store persists reproducible scores and compacts snapshots to 72-hour fine plus 180-day daily retention', () => {
  const current = storeFixture();
  try {
    const captured = [
      '2026-08-29T11:00:00.000Z',
      '2026-08-25T08:00:00.000Z', '2026-08-25T20:00:00.000Z',
      '2026-04-01T08:00:00.000Z', '2026-04-01T20:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    ];
    captured.forEach((capturedAt, index) => current.store.commitPage({
      accountId: 'account-1', posts: [storedPost({
        collectedAt: capturedAt,
        metrics: metrics(capturedAt, index + 1)
      })], nextCursor: null, exhausted: true, collectedAt: capturedAt
    }));
    const score = scoreCreatorPost({
      post: post(), snapshots: snapshots(), now: NOW,
      peers: { velocities: [10], accelerations: [5] }, creator30DayEngagements: [100]
    });
    current.store.recordHotnessScore('post-1', score, NOW);
    const compacted = current.store.compactMetricSnapshots({ now: NOW, fineHours: 72, dailyDays: 180 });
    assert.equal(compacted.deleted, 3);
    assert.deepEqual(
      current.store.db.prepare('SELECT captured_at FROM creator_post_metrics ORDER BY captured_at').all().map((row) => row.captured_at),
      ['2026-04-01T20:00:00.000Z', '2026-08-25T20:00:00.000Z', '2026-08-29T11:00:00.000Z']
    );
    const persisted = current.store.getLatestHotnessScore('post-1');
    assert.equal(persisted.formulaVersion, FORMULA_VERSION);
    assert.equal(persisted.inputs.creatorMedianEngagement, 100);
    assert.equal(persisted.components.engagementVelocity.weight, 0.25);
  } finally {
    current.close();
  }
});
