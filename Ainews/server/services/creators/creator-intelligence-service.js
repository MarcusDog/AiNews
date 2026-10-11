const {
  calculateVelocities,
  engagement,
  scoreCreatorPost
} = require('./creator-hotness');
const { buildCreatorTopics, persistCreatorTopics } = require('./creator-topic-engine');
const { classifyCreatorPost } = require('./vertical-classifier');

function latest(items = []) {
  return [...items].sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)).at(-1) || null;
}

class CreatorIntelligenceService {
  constructor(options = {}) {
    if (!options.store?.db) throw new TypeError('initialized CreatorStore is required');
    this.store = options.store;
    this.now = options.now || (() => new Date().toISOString());
    this.lookbackDays = Math.min(Math.max(Number(options.lookbackDays || 30), 3), 180);
    this.topicWindowHours = Math.min(Math.max(Number(options.topicWindowHours || 72), 24), 720);
    this.maximumPosts = Math.min(Math.max(Number(options.maximumPosts || 5000), 100), 50_000);
  }

  loadPosts() {
    const cutoff = new Date(Date.parse(this.now()) - this.lookbackDays * 86_400_000).toISOString();
    const rows = this.store.db.prepare(`
      SELECT p.*, a.creator_id, c.display_name AS creator_name, c.kind AS creator_kind
      FROM creator_posts p
      JOIN creator_accounts a ON a.id = p.account_id
      JOIN creators c ON c.id = a.creator_id
      WHERE p.deleted_at IS NULL AND p.published_at >= ?
      ORDER BY p.published_at DESC, p.id
      LIMIT ?
    `).all(cutoff, this.maximumPosts);
    const metrics = this.store.db.prepare(`
      SELECT captured_at, views, likes, comments, shares, bookmarks,
             platform_rank, followers_at_capture
      FROM creator_post_metrics
      WHERE post_id = ?
      ORDER BY captured_at, id
    `);
    const creatorVerticals = this.store.db.prepare(
      'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
    );
    return rows.map((row) => {
      const post = this.store.mapPost(row);
      return {
        ...post,
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        creatorKind: row.creator_kind,
        verticalId: post.verticalIds[0] || null,
        creatorVerticalIds: creatorVerticals.all(row.creator_id).map((item) => item.vertical_id),
        metadata: {},
        sharedFrom: null,
        snapshots: metrics.all(post.id).map((item) => ({
          capturedAt: item.captured_at,
          views: item.views,
          likes: item.likes,
          comments: item.comments,
          shares: item.shares,
          bookmarks: item.bookmarks,
          platformRank: item.platform_rank,
          followersAtCapture: item.followers_at_capture
        }))
      };
    });
  }

  process() {
    const now = this.now();
    const posts = this.loadPosts();
    if (!posts.length) return { scoredPosts: 0, topics: 0, uncategorizedPosts: 0, generatedAt: now };
    const nowMs = Date.parse(now);
    let uncategorizedPosts = 0;
    for (const post of posts) {
      const classification = classifyCreatorPost(post, { creatorVerticalIds: post.creatorVerticalIds });
      const hasContradiction = classification.reasons.some((reason) => reason.startsWith('negative:'));
      const specialistPrior = ['media', 'brand', 'organization'].includes(post.creatorKind)
        && post.creatorVerticalIds.length === 1
        && !hasContradiction
        ? post.creatorVerticalIds[0]
        : null;
      const verticalIds = classification.verticalId !== 'uncategorized'
        ? [classification.verticalId]
        : specialistPrior ? [specialistPrior] : [];
      if (!verticalIds.length) uncategorizedPosts += 1;
      this.store.replacePostVerticals(post.id, verticalIds, now);
      post.verticalIds = verticalIds;
      post.verticalId = verticalIds[0] || null;
      post.classification = classification;
    }
    const topicCutoff = nowMs - this.topicWindowHours * 3_600_000;
    const recentPosts = posts.filter((post) => post.verticalId && Date.parse(post.publishedAt) >= topicCutoff);
    const draftTopics = buildCreatorTopics(recentPosts.map((post) => ({ ...post, hotness: 0 })));
    const adoptionByPost = new Map();
    for (const topic of draftTopics) {
      for (const postId of topic.postIds) {
        adoptionByPost.set(postId, {
          independentCreatorCount: topic.creatorCount,
          platformCount: topic.platformCount
        });
      }
    }

    const calculated = posts.map((post) => {
      const velocities = calculateVelocities(post.snapshots, now);
      return {
        post,
        ageHours: Math.max(0, (nowMs - Date.parse(post.publishedAt)) / 3_600_000),
        velocity: velocities.velocity60 ?? velocities.velocity15 ?? velocities.velocity180,
        acceleration: velocities.acceleration,
        currentEngagement: engagement(latest(post.snapshots))
      };
    });
    const creatorBaselines = new Map();
    for (const item of calculated) {
      if (item.currentEngagement === null) continue;
      if (!creatorBaselines.has(item.post.creatorId)) creatorBaselines.set(item.post.creatorId, []);
      creatorBaselines.get(item.post.creatorId).push(item.currentEngagement);
    }
    const peerSamples = calculated.map((item) => ({
      platform: item.post.platform,
      verticalId: item.post.verticalId,
      ageHours: item.ageHours,
      velocity: item.velocity,
      acceleration: item.acceleration
    }));
    const scoreByPost = new Map();
    for (const item of calculated) {
      const adoption = adoptionByPost.get(item.post.id) || {};
      const score = scoreCreatorPost({
        post: item.post,
        snapshots: item.post.snapshots,
        now,
        peerSamples,
        creator30DayEngagements: creatorBaselines.get(item.post.creatorId) || [],
        independentCreatorCount: adoption.independentCreatorCount || 1,
        platformCount: adoption.platformCount || 1
      });
      this.store.recordHotnessScore(item.post.id, score, now);
      scoreByPost.set(item.post.id, score.score);
    }
    const topics = buildCreatorTopics(recentPosts.map((post) => ({
      ...post,
      hotness: scoreByPost.get(post.id) || 0
    })));
    const currentTopicIds = new Set(topics.map((topic) => topic.id));
    const staleTopics = this.store.db.prepare(
      'SELECT id FROM creator_topics WHERE latest_seen_at >= ?'
    ).all(new Date(topicCutoff).toISOString());
    const deleteTopic = this.store.db.prepare('DELETE FROM creator_topics WHERE id = ?');
    this.store.db.transaction(() => {
      for (const topic of staleTopics) if (!currentTopicIds.has(topic.id)) deleteTopic.run(topic.id);
    })();
    persistCreatorTopics(this.store, topics, now);
    return { scoredPosts: posts.length, topics: topics.length, uncategorizedPosts, generatedAt: now };
  }
}

module.exports = CreatorIntelligenceService;
