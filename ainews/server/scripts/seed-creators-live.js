#!/usr/bin/env node
/**
 * Seed into the LIVE ainews.db at /root/website/Ainews/data/ainews.db
 * (the one ainews-server actually opens).
 *
 * Same pipeline as seed-creators.js, but uses the live db path directly.
 */

process.chdir('/root/website/Ainews/server');
const path = require('node:path');
const crypto = require('node:crypto');

const LIVE_DB = '/root/website/Ainews/data/ainews.db';
const CreatorStore = require('../services/creators/creator-store');

const store = new CreatorStore({ dbPath: LIVE_DB });
store.initialize();

const TARGETS = [
  { repo: 'huggingface/transformers', displayName: 'Hugging Face Transformers', kind: 'project', vertical: 'ai-tech' },
  { repo: 'openai/whisper', displayName: 'OpenAI Whisper', kind: 'project', vertical: 'ai-tech' },
  { repo: 'ollama/ollama', displayName: 'Ollama', kind: 'project', vertical: 'ai-tech' },
  { repo: 'langchain-ai/langchain', displayName: 'LangChain', kind: 'project', vertical: 'ai-tech' },
  { repo: 'karpathy/nanoGPT', displayName: 'Andrej Karpathy / nanoGPT', kind: 'project', vertical: 'ai-tech' },
  { repo: 'anthropics/anthropic-sdk-python', displayName: 'Anthropic Python SDK', kind: 'project', vertical: 'ai-tech' }
];

const VERTICALS = [
  { id: 'ai-tech', name: 'AI 科技', version: 'creator-hotness-v1', enabled: 1,
    keywords: ['AI','agent','LLM','transformer','GPT','Claude','Whisper','Ollama','LangChain','open source model','machine learning','sdk'],
    negativeKeywords: ['crypto','nft'] },
  { id: 'beauty', name: '美妆', version: 'creator-hotness-v1', enabled: 1, keywords: ['skincare','makeup','beauty'], negativeKeywords: [] },
  { id: 'fashion', name: '穿搭', version: 'creator-hotness-v1', enabled: 1, keywords: ['fashion','outfit','style'], negativeKeywords: [] },
  { id: 'entertainment', name: '娱乐', version: 'creator-hotness-v1', enabled: 1, keywords: ['movie','music','celebrity'], negativeKeywords: [] }
];

const now = () => new Date().toISOString();
const shaId = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);

function checkpoint(label) {
  const cp = store.db.pragma('wal_checkpoint(FULL)');
  console.log(`  [checkpoint ${label}] busy=${cp[0]?.busy} log=${cp[0]?.log} checkpointed=${cp[0]?.checkpointed}`);
}

async function fetchReleases(repo, perPage = 4) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=${perPage}`, {
      headers: { 'User-Agent': 'ainews-creator-seeder', 'Accept': 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

function scoreFor(release) {
  const ageHours = Math.max(1, (Date.now() - new Date(release.published_at).getTime()) / 3_600_000);
  const freshness = Math.max(0, 30 - ageHours / 4);
  const downloads = Math.min(35, (release.assets || []).reduce((s, a) => s + (a.download_count || 0), 0) / 100);
  const project = 18;
  const trust = 10;
  const engagement = Math.min(20, Math.log10(1 + (release.assets || []).length) * 8);
  const momentum = Math.min(15, (release.body?.length || 0) > 200 ? 12 : 6);
  const diversity = 5;
  const unroundedScore = freshness + downloads + project + trust + engagement + momentum + diversity + 5;
  const score = Math.max(60, Math.min(99, Math.round(unroundedScore)));
  return {
    formulaVersion: 'creator-hotness-v1',
    score,
    unroundedScore,
    confidence: ageHours < 48 ? 'high' : ageHours < 168 ? 'medium' : 'low',
    inputs: { ageHours, assetCount: (release.assets || []).length },
    components: { freshness, downloads, project, trust, engagement, momentum, diversity },
    penalties: {}
  };
}

function classifyVertical(release) {
  const text = `${release.name || ''} ${release.body || ''}`.toLowerCase();
  for (const v of VERTICALS) {
    if (!v.enabled) continue;
    if (v.negativeKeywords.some((kw) => text.includes(kw.toLowerCase()))) continue;
    if (v.keywords.some((kw) => text.includes(kw.toLowerCase()))) return v.id;
  }
  return 'ai-tech';
}

async function main() {
  const t0 = Date.now();
  console.log(`[${now()}] creator seed LIVE start → ${LIVE_DB}`);

  for (const t of ['creator_topic_posts','creator_topics','creator_post_verticals',
    'creator_post_scores','creator_post_metrics','creator_posts','creator_cursors',
    'creator_runs','creator_events','creator_accounts','creator_vertical_memberships',
    'creators','creator_verticals']) {
    store.db.prepare(`DELETE FROM ${t}`).run();
  }
  checkpoint('clear');

  for (const v of VERTICALS) {
    store.db.prepare(`
      INSERT INTO creator_verticals (id, name, version, enabled, keywords_json, negative_keywords_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, version=excluded.version, enabled=excluded.enabled,
        keywords_json=excluded.keywords_json, negative_keywords_json=excluded.negative_keywords_json, updated_at=excluded.updated_at
    `).run(v.id, v.name, v.version, v.enabled, JSON.stringify(v.keywords), JSON.stringify(v.negativeKeywords), now(), now());
  }
  console.log(`  ✓ ${VERTICALS.length} verticals`);
  checkpoint('verticals');

  const creators = TARGETS.map((t) => ({
    id: `creator_${shaId(t.repo)}`,
    displayName: t.displayName,
    kind: t.kind,
    reviewStatus: 'verified',
    reviewedAt: now(),
    verticalIds: [t.vertical]
  }));
  store.upsertCreators(creators);
  console.log(`  ✓ ${creators.length} creators (verified)`);
  checkpoint('creators');

  const accounts = TARGETS.map((t) => ({
    id: `acct_${shaId(t.repo, 'github')}`,
    creatorId: `creator_${shaId(t.repo)}`,
    platform: 'github',
    externalAccountId: t.repo,
    handle: t.repo.split('/')[1],
    profileUrl: `https://github.com/${t.repo}`,
    region: 'global',
    sourceTier: 'L1',
    enabled: 1,
    lastVerifiedAt: now(),
    authState: 'unconfigured',
    backfillState: 'complete',
    oldestFetchedAt: now(),
    newestFetchedAt: now(),
    lastReconciledAt: now(),
    historyLimitReason: null,
    nextRunAt: now()
  }));
  store.upsertAccounts(accounts);
  console.log(`  ✓ ${accounts.length} GitHub accounts`);
  checkpoint('accounts');

  let totalPosts = 0, totalScores = 0;
  for (const target of TARGETS) {
    const accountId = `acct_${shaId(target.repo, 'github')}`;
    const releases = await fetchReleases(target.repo, 4);
    if (!releases.length) { console.log(`  ! ${target.repo} → 0 releases`); continue; }

    const posts = releases.map((r) => ({
      id: `post_${shaId(r.html_url || String(r.id))}`,
      externalPostId: String(r.id),
      url: r.html_url,
      title: r.name || r.tag_name,
      text: (r.body || '').slice(0, 5000),
      contentType: 'release',
      publishedAt: r.published_at,
      collectedAt: now(),
      sourceConfidence: 'verified',
      provenanceUrl: r.html_url,
      language: 'en',
      platform: 'github'
    }));

    try {
      const result = store.commitPage({ accountId, posts, cursorKind: 'incremental', collectedAt: now() });
      totalPosts += result.inserted + result.updated;

      let scores = 0;
      for (const post of posts) {
        const release = releases.find((r) => String(r.id) === post.externalPostId);
        const score = scoreFor(release);
        // Direct insert (recordHotnessScore requires creator-event-detector module)
        try {
          store.db.prepare(`
            INSERT INTO creator_post_scores
              (post_id, captured_at, formula_version, score, unrounded_score, confidence,
               inputs_json, components_json, penalties_json, created_at)
            VALUES (?, ?, 'creator-hotness-v1', ?, ?, ?, ?, ?, '{}', ?)
          `).run(post.id, now(), score.score, score.unroundedScore, score.confidence,
            JSON.stringify(score.inputs), JSON.stringify(score.components), now());
          scores++; totalScores++;
        } catch (_) {}
        try {
          store.db.prepare(`INSERT OR IGNORE INTO creator_post_verticals (post_id, vertical_id, created_at) VALUES (?, ?, ?)`)
            .run(post.id, classifyVertical(release), now());
        } catch (_) {}
      }

      store.db.prepare(`
        INSERT INTO creator_cursors (account_id, cursor_kind, cursor, exhausted, updated_at)
        VALUES (?, 'incremental', ?, 1, ?)
        ON CONFLICT(account_id, cursor_kind) DO UPDATE SET cursor=excluded.cursor, exhausted=excluded.exhausted, updated_at=excluded.updated_at
      `).run(accountId, String(releases[0].id), now());

      console.log(`  ✓ ${target.repo}: ${posts.length} posts / ${scores} scores`);
    } catch (e) {
      console.error(`  ✗ ${target.repo}: ${e.message}`);
    }
  }
  checkpoint('posts');

  // cross-creator topics
  const TOPICS = [
    { id: 'topic_llm_release_race', title: '开源大模型版本竞赛', kws: ['agent','llm','llama','claude','whisper','gpt'], minCreators: 2 },
    { id: 'topic_agent_sdk_release', title: 'Agent 框架与 SDK 发布', kws: ['agent','sdk','framework','tool'], minCreators: 2 }
  ];
  const allPosts = store.db.prepare(`
    SELECT p.id, p.title, p.text, a.creator_id FROM creator_posts p
    JOIN creator_accounts a ON a.id = p.account_id WHERE p.deleted_at IS NULL
  `).all();

  let totalTopics = 0;
  for (const topic of TOPICS) {
    const matched = [];
    const creatorsInTopic = new Set();
    for (const row of allPosts) {
      const text = `${row.title} ${row.text || ''}`.toLowerCase();
      const hits = topic.kws.filter((kw) => text.includes(kw)).length;
      if (hits >= 1) { matched.push(row); creatorsInTopic.add(row.creator_id); }
    }
    if (creatorsInTopic.size < topic.minCreators) continue;

    store.db.prepare(`
      INSERT INTO creator_topics (id, vertical_id, title, summary, first_seen_at, latest_seen_at,
        hotness, formula_version, creator_count, platform_count, payload_json, created_at, updated_at)
      VALUES (?, 'ai-tech', ?, ?, ?, ?, ?, 'creator-topic-v1', ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, summary=excluded.summary,
        first_seen_at=excluded.first_seen_at, latest_seen_at=excluded.latest_seen_at,
        hotness=excluded.hotness, creator_count=excluded.creator_count,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).run(topic.id, topic.title, topic.title, now(), now(),
      Math.min(99, 70 + creatorsInTopic.size * 4), creatorsInTopic.size,
      JSON.stringify({ anchor: topic.title }), now(), now());
    for (const row of matched) {
      store.db.prepare(`INSERT OR IGNORE INTO creator_topic_posts (topic_id, post_id, adopted_at) VALUES (?, ?, ?)`)
        .run(topic.id, row.id, now());
    }
    console.log(`  ✓ topic ${topic.id}: ${matched.length} posts / ${creatorsInTopic.size} creators`);
    totalTopics++;
  }
  checkpoint('topics');

  // append creator_events for /api/creators/v1/changes
  let seq = (store.db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM creator_events').get().m) + 1;
  const insEv = store.db.prepare(`
    INSERT INTO creator_events (seq, id, event_type, entity_type, entity_id, vertical_id, platform, score, formula_version, transition_bucket, payload_json, occurred_at, created_at)
    VALUES (?, ?, 'post_scored', 'post', ?, 'ai-tech', 'github', ?, 'creator-hotness-v1', 'seeded', ?, ?, ?)
  `);
  let totalEvents = 0;
  for (const p of allPosts) {
    const score = store.db.prepare('SELECT score FROM creator_post_scores WHERE post_id = ? ORDER BY captured_at DESC LIMIT 1').get(p.id);
    if (!score) continue;
    insEv.run(seq++, `event_${seq}`, p.id, score.score,
      JSON.stringify({ source: 'seed', formula: 'creator-hotness-v1' }), now(), now());
    totalEvents++;
  }
  checkpoint('events');

  console.log(`\n[${now()}] seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const v = {
    verticals: store.db.prepare('SELECT COUNT(*) AS n FROM creator_verticals').get().n,
    creators: store.db.prepare('SELECT COUNT(*) AS n FROM creators').get().n,
    accounts: store.db.prepare('SELECT COUNT(*) AS n FROM creator_accounts').get().n,
    posts: store.db.prepare('SELECT COUNT(*) AS n FROM creator_posts').get().n,
    scores: store.db.prepare('SELECT COUNT(*) AS n FROM creator_post_scores').get().n,
    topics: store.db.prepare('SELECT COUNT(*) AS n FROM creator_topics').get().n,
    events: store.db.prepare('SELECT COUNT(*) AS n FROM creator_events').get().n
  };
  for (const [k, val] of Object.entries(v)) console.log(`  ${k}: ${val}`);
}

main().catch((e) => { console.error('seed fatal:', e); process.exit(1); });