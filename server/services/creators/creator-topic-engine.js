const crypto = require('node:crypto');
const { detectCreatorEvents } = require('./creator-event-detector');

const SNAPSHOT_VERSION = 'creator-topic-v1';
const STOP_WORDS = new Set(['the', 'and', 'with', 'from', 'new', '发布', '全新', '产品']);

function tokensFor(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  const latin = text.match(/[a-z][a-z0-9.-]{1,}/g) || [];
  const chinese = text.match(/[\u3400-\u9fff]{2,8}/g) || [];
  return new Set([...latin, ...chinese].filter((token) => !STOP_WORDS.has(token)));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function validEvidenceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function related(left, right) {
  if (left.verticalId && right.verticalId && left.verticalId !== right.verticalId) return false;
  const leftTitle = String(left.title || '').normalize('NFKC').trim().toLowerCase();
  const rightTitle = String(right.title || '').normalize('NFKC').trim().toLowerCase();
  if (leftTitle && leftTitle === rightTitle) return true;
  return jaccard(tokensFor(`${left.title} ${left.text || ''}`), tokensFor(`${right.title} ${right.text || ''}`)) >= 0.45;
}

function components(posts) {
  const remaining = new Set(posts.map((_, index) => index));
  const groups = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const queue = [first];
    const group = [];
    while (queue.length) {
      const index = queue.shift();
      group.push(posts[index]);
      for (const candidate of [...remaining]) {
        if (!related(posts[index], posts[candidate])) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    groups.push(group);
  }
  return groups;
}

function topicId(posts) {
  const anchor = [...tokensFor(posts.map((post) => post.title).join(' '))].sort().slice(0, 12).join('|')
    || posts.map((post) => post.id).sort().join('|');
  return `creator-topic_${crypto.createHash('sha256').update(anchor).digest('hex').slice(0, 32)}`;
}

function buildTopic(posts) {
  const ordered = [...posts].sort((left, right) => (
    Date.parse(left.publishedAt) - Date.parse(right.publishedAt) || String(left.id).localeCompare(String(right.id))
  ));
  const adoptionByKey = new Map();
  for (const item of ordered) {
    const evidenceUrl = validEvidenceUrl(item.url);
    if (!evidenceUrl || !item.creatorId || !item.platform) continue;
    const key = item.syndicationNetworkId ? `syndication:${item.syndicationNetworkId}` : `creator:${item.creatorId}`;
    if (!adoptionByKey.has(key)) adoptionByKey.set(key, {
      creatorId: item.creatorId,
      platform: item.platform,
      postId: item.id,
      adoptedAt: item.publishedAt,
      evidenceUrl,
      syndicationNetworkId: item.syndicationNetworkId || null
    });
  }
  const adoptionSequence = [...adoptionByKey.values()].sort((left, right) => Date.parse(left.adoptedAt) - Date.parse(right.adoptedAt));
  const firstAt = Date.parse(ordered[0]?.publishedAt);
  const counts6h = adoptionSequence.filter((item) => Date.parse(item.adoptedAt) - firstAt <= 6 * 3_600_000).length;
  const counts24h = adoptionSequence.filter((item) => Date.parse(item.adoptedAt) - firstAt <= 24 * 3_600_000).length;
  const platformCount = new Set(ordered.map((item) => item.platform)).size;
  const creatorCount = adoptionSequence.length;
  const maxHotness = Math.max(...ordered.map((item) => Number(item.hotness) || 0), 0);
  return {
    id: topicId(ordered),
    title: ordered[0]?.title || '',
    verticalId: ordered[0]?.verticalId || null,
    firstSeenAt: ordered[0]?.publishedAt || null,
    latestSeenAt: ordered.at(-1)?.publishedAt || null,
    creatorCount,
    platformCount,
    maxHotness,
    firstAdopter: adoptionSequence[0] || null,
    adoptionSequence,
    evidence: adoptionSequence.map((item) => ({ postId: item.postId, url: item.evidenceUrl })),
    postIds: ordered.map((item) => item.id),
    signals: {
      singleCreatorBreakout: creatorCount === 1 && maxHotness >= 75,
      multiCreatorAdoption: counts6h >= 3 || counts24h >= 5,
      crossPlatformSpread: creatorCount >= 3 && platformCount >= 2 && counts24h >= 3
    },
    snapshotVersion: SNAPSHOT_VERSION
  };
}

function persistCreatorTopics(store, topics = [], capturedAt = new Date().toISOString()) {
  if (!store?.db) throw new TypeError('initialized CreatorStore is required');
  const upsert = store.db.prepare(`
    INSERT INTO creator_topics (
      id, vertical_id, title, summary, first_seen_at, latest_seen_at, hotness,
      formula_version, creator_count, platform_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      vertical_id=excluded.vertical_id, title=excluded.title, summary=excluded.summary,
      first_seen_at=excluded.first_seen_at, latest_seen_at=excluded.latest_seen_at,
      hotness=excluded.hotness, formula_version=excluded.formula_version,
      creator_count=excluded.creator_count, platform_count=excluded.platform_count,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at
  `);
  const clear = store.db.prepare('DELETE FROM creator_topic_posts WHERE topic_id = ?');
  const link = store.db.prepare(`
    INSERT INTO creator_topic_posts (topic_id, post_id, adopted_at) VALUES (?, ?, ?)
  `);
  const snapshot = store.db.prepare(`
    INSERT INTO creator_topic_snapshots (topic_id, captured_at, payload_json) VALUES (?, ?, ?)
  `);
  const transaction = store.db.transaction(() => {
    for (const topic of topics) {
      const payload = {
        snapshotVersion: topic.snapshotVersion,
        firstAdopter: topic.firstAdopter,
        adoptionSequence: topic.adoptionSequence,
        evidence: topic.evidence,
        signals: topic.signals
      };
      store.applyCreatorStateChange({
        producer: 'topic-engine', entityType: 'topic', entityId: topic.id,
        stateVersion: topic.snapshotVersion, occurredAt: capturedAt,
        applyState: () => {
          const before = store.getCreatorTopic(topic.id);
          upsert.run(
            topic.id, topic.verticalId, topic.title, null, topic.firstSeenAt, topic.latestSeenAt,
            topic.maxHotness, topic.snapshotVersion, topic.creatorCount, topic.platformCount,
            JSON.stringify(payload), capturedAt, capturedAt
          );
          clear.run(topic.id);
          for (const postId of topic.postIds) {
            const adoption = topic.adoptionSequence.find((item) => item.postId === postId);
            link.run(topic.id, postId, adoption?.adoptedAt || topic.firstSeenAt);
          }
          snapshot.run(topic.id, capturedAt, JSON.stringify(payload));
          return { before, after: store.getCreatorTopic(topic.id) };
        },
        detectEvents: detectCreatorEvents
      });
    }
  });
  transaction();
  return topics.length;
}

function buildCreatorTopics(posts = []) {
  const usable = posts.filter((post) => post?.id && post?.creatorId && validEvidenceUrl(post.url)
    && Number.isFinite(Date.parse(post.publishedAt)));
  return components(usable).map(buildTopic).sort((left, right) => (
    Date.parse(right.latestSeenAt) - Date.parse(left.latestSeenAt) || left.id.localeCompare(right.id)
  ));
}

module.exports = {
  SNAPSHOT_VERSION,
  tokensFor,
  related,
  buildCreatorTopics,
  persistCreatorTopics
};
