const crypto = require('node:crypto');
const { buildOpportunity } = require('./opportunity-engine');

const TREND_FORMULA_VERSION = 'trend-v1';
const TRUST_WEIGHTS = {
  official: 1,
  community_api: 0.75,
  public_feed: 0.6,
  bridge: 0.4
};

const ENTITY_ALIASES = [
  ['openai', /\bopenai\b|\bchatgpt\b|\bgpt[-\s]?\d[\w.-]*/gi],
  ['anthropic', /\banthropic\b|\bclaude\b/gi],
  ['google-gemini', /\bgemini\b|\bdeepmind\b|google\s+ai/gi],
  ['deepseek', /\bdeepseek\b|深度求索/gi],
  ['qwen', /\bqwen\b|通义千问|通义/gi],
  ['zhipu', /\bzhipu\b|\bglm[-\s]?\w*\b|智谱/gi],
  ['kimi', /\bkimi\b|月之暗面|moonshot\s+ai/gi],
  ['huggingface', /hugging\s*face/gi],
  ['cursor', /\bcursor\b/gi],
  ['perplexity', /\bperplexity\b/gi]
];

const STOP_WORDS = new Set([
  'ai', 'the', 'a', 'an', 'and', 'or', 'for', 'with', 'to', 'of', 'in', 'on',
  'is', 'are', 'new', 'official', '正式', '一个', '这个', '以及', '关于', '人工智能'
]);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(value, max));
}

function round2(value) {
  return Number(value.toFixed(2));
}

function normalizeEventText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/gpt[-\s]?(\d[\w.]*)/g, ' gpt$1 ')
    .replace(/(正式)?发布|推出|上线|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)/g, ' launch ')
    .replace(/更新|升级|update(?:s|d|ing)?/g, ' update ')
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .trim();
}

function tokensFor(value) {
  const normalized = normalizeEventText(value);
  const latin = normalized.match(/[a-z][a-z0-9.]{1,}/g) || [];
  const chineseChunks = normalized.match(/[\u3400-\u9fff]{2,8}/g) || [];
  return new Set([...latin, ...chineseChunks].filter((token) => !STOP_WORDS.has(token)));
}

function extractStrongEntities(value) {
  const text = String(value || '');
  const entities = new Set();
  for (const [name, pattern] of ENTITY_ALIASES) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) entities.add(name);
  }
  for (const match of text.toLowerCase().matchAll(/\b(?:gpt|llama|gemma|qwen|glm|deepseek)[-\s]?\d[\w.-]*/g)) {
    entities.add(match[0].replace(/[\s-]/g, ''));
  }
  return entities;
}

function jaccard(left, right) {
  const a = left instanceof Set ? left : new Set(left || []);
  const b = right instanceof Set ? right : new Set(right || []);
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function intersection(left, right) {
  return [...left].filter((item) => right.has(item));
}

function pairReasons(left, right) {
  const reasons = [];
  if (left.repoFullName && right.repoFullName && left.repoFullName.toLowerCase() === right.repoFullName.toLowerCase()) {
    reasons.push('shared_repository');
  }
  if (left.canonicalUrl && right.canonicalUrl && left.canonicalUrl === right.canonicalUrl) reasons.push('shared_url');
  const entities = intersection(
    extractStrongEntities(`${left.title} ${left.summary || ''} ${(left.tags || []).join(' ')}`),
    extractStrongEntities(`${right.title} ${right.summary || ''} ${(right.tags || []).join(' ')}`)
  );
  const similarity = jaccard(tokensFor(left.title), tokensFor(right.title));
  if (entities.length && similarity >= 0.28) {
    reasons.push(...entities.map((entity) => `entity:${entity}`));
    reasons.push(`title_similarity:${similarity.toFixed(2)}`);
  }
  return reasons;
}

function topicAnchor(signals) {
  const repos = signals.map((item) => item.repoFullName?.toLowerCase()).filter(Boolean).sort();
  if (repos.length) return `repo:${repos[0]}`;
  const urlCounts = new Map();
  for (const signal of signals) {
    if (signal.canonicalUrl) urlCounts.set(signal.canonicalUrl, (urlCounts.get(signal.canonicalUrl) || 0) + 1);
  }
  if (urlCounts.size) {
    const url = [...urlCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return `url:${url}`;
  }
  const earliest = [...signals].sort((a, b) =>
    new Date(a.publishedAt) - new Date(b.publishedAt) || String(a.id).localeCompare(String(b.id))
  )[0];
  return `signal:${earliest.fingerprint || earliest.id}`;
}

function topicIdForAnchor(anchor) {
  return crypto.createHash('sha256').update(`aya-topic-v1:${anchor}`).digest('hex').slice(0, 24);
}

function sumMetric(signals, key) {
  return signals.reduce((sum, signal) => {
    const value = signal?.metrics?.[key];
    return sum + (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  }, 0);
}

function scoreTrend(signals = [], options = {}) {
  const now = new Date(options.now || new Date());
  const sorted = [...signals].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || String(a.id).localeCompare(String(b.id)));
  const ages = sorted.map((signal) => Math.max(0, (now - new Date(signal.publishedAt)) / 3600000));
  const newestAge = ages.length ? Math.min(...ages) : Infinity;
  const freshness = newestAge <= 6 ? 25 : newestAge <= 24 ? 20 : newestAge <= 48 ? 12 : newestAge <= 72 ? 6 : 0;
  const metricKeys = ['likes', 'comments', 'replies', 'shares', 'reposts', 'views', 'stars', 'forks', 'openIssues', 'points'];
  const metrics = Object.fromEntries(metricKeys.filter((key) =>
    signals.some((signal) => signal?.metrics?.[key] !== null && signal?.metrics?.[key] !== undefined)
  ).map((key) => [key, sumMetric(signals, key)]));
  const metric = (key) => metrics[key] || 0;
  const engagementInput = metric('likes') + 3 * metric('comments') + 4 * metric('shares') +
    0.01 * metric('views') + 3 * metric('stars') + 5 * metric('forks') + 2 * metric('points');
  const engagement = Math.min(25, 5 * Math.log10(1 + engagementInput));
  const currentSignals = sorted.filter((_, index) => ages[index] <= 24);
  const previousSignals = sorted.filter((_, index) => ages[index] > 24 && ages[index] <= 48);
  const current = currentSignals.length;
  const previous = previousSignals.length;
  let momentum = current > 0 && previous === 0
    ? 16
    : clamp(10 + 5 * (current - previous) / Math.max(1, previous), 0, 20);
  const previousPlatforms = new Set(previousSignals.map((signal) => signal.platform));
  const currentPlatforms = new Set(currentSignals.map((signal) => signal.platform));
  const allPlatforms = new Set(sorted.map((signal) => signal.platform).filter(Boolean));
  const addedPlatform = allPlatforms.size >= 2 && [...currentPlatforms].some((platform) => !previousPlatforms.has(platform));
  if (addedPlatform) momentum = Math.min(20, momentum + 4);
  const diversity = Math.min(15, 5 * allPlatforms.size);
  const trustValues = signals.map((signal) => TRUST_WEIGHTS[signal.sourceTrustClass] || 0);
  const trust = trustValues.length ? 10 * trustValues.reduce((sum, value) => sum + value, 0) / trustValues.length : 0;
  const repositorySignals = signals.filter((signal) => signal.kind === 'repository' || signal.repoFullName);
  const projectRaw = repositorySignals.length ? 1 + metric('stars') + 3 * metric('forks') + metric('openIssues') : 1;
  const project = repositorySignals.length ? Math.min(5, 1.25 * Math.log10(projectRaw)) : 0;
  const trendScore = Math.round(clamp(freshness + engagement + momentum + diversity + trust + project));
  const firstSeenAt = options.firstSeenAt || sorted.at(-1)?.firstSeenAt || sorted.at(-1)?.publishedAt || now.toISOString();
  const firstSeenAge = Math.max(0, (now - new Date(firstSeenAt)) / 3600000);
  const prior = options.previousSnapshot?.formulaVersion === TREND_FORMULA_VERSION ? options.previousSnapshot : null;
  const scoreDelta = prior ? trendScore - Number(prior.trendScore || 0) : null;
  const growth = previous === 0 ? (current > 0 ? Infinity : 0) : (current - previous) / previous;
  let trendDirection = 'steady';
  if (firstSeenAge <= 24 && previous === 0) trendDirection = 'new';
  else if ((growth >= 0.5 && current >= 2) || (scoreDelta !== null && scoreDelta >= 10)) trendDirection = 'rising';
  else if (growth <= -0.5 || (scoreDelta !== null && scoreDelta <= -10)) trendDirection = 'cooling';

  return {
    formulaVersion: TREND_FORMULA_VERSION,
    trendScore,
    trendDirection,
    evidenceStrength: new Set(signals.map((signal) => signal.sourceId)).size <= 1
      ? 'single-source'
      : allPlatforms.size >= 2 ? 'cross-platform' : 'multi-source',
    scoreBreakdown: {
      freshness,
      engagement: round2(engagement),
      momentum: round2(momentum),
      diversity,
      trust: round2(trust),
      project: round2(project)
    },
    rawInputs: {
      newestAgeHours: Number.isFinite(newestAge) ? round2(newestAge) : null,
      windowCounts: { current24h: current, previous24h: previous, total72h: sorted.length },
      platformCount: allPlatforms.size,
      sourceCount: new Set(signals.map((signal) => signal.sourceId).filter(Boolean)).size,
      trustWeights: trustValues,
      metrics,
      engagementInput: round2(engagementInput),
      projectInput: projectRaw
    },
    whatChanged: {
      previousComparableScore: prior ? Number(prior.trendScore || 0) : null,
      scoreDelta,
      signalGrowth: Number.isFinite(growth) ? round2(growth) : 'new_from_zero',
      addedPlatform
    }
  };
}

function connectedComponents(signals) {
  const parent = signals.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };
  const reasonMap = new Map();
  for (let left = 0; left < signals.length; left += 1) {
    for (let right = left + 1; right < signals.length; right += 1) {
      const reasons = pairReasons(signals[left], signals[right]);
      if (reasons.length) {
        union(left, right);
        reasonMap.set(`${left}:${right}`, reasons);
      }
    }
  }
  const groups = new Map();
  signals.forEach((signal, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ signal, index });
  });
  return [...groups.values()].map((entries) => {
    const indices = new Set(entries.map((entry) => entry.index));
    const reasons = new Set();
    for (const [pair, values] of reasonMap) {
      const [left, right] = pair.split(':').map(Number);
      if (indices.has(left) && indices.has(right)) values.forEach((value) => reasons.add(value));
    }
    return { signals: entries.map((entry) => entry.signal), reasons: [...reasons].sort() };
  });
}

function chooseRepresentative(signals) {
  return [...signals].sort((left, right) => {
    const leftScore = sumMetric([left], 'stars') + sumMetric([left], 'points') + sumMetric([left], 'likes') + sumMetric([left], 'comments');
    const rightScore = sumMetric([right], 'stars') + sumMetric([right], 'points') + sumMetric([right], 'likes') + sumMetric([right], 'comments');
    return rightScore - leftScore || new Date(right.publishedAt) - new Date(left.publishedAt) || String(left.id).localeCompare(String(right.id));
  })[0];
}

function overlapMatch(cluster, existing) {
  const clusterIds = new Set(cluster.signals.map((signal) => signal.id));
  const existingIds = new Set(existing.signalIds || []);
  const overlap = jaccard(clusterIds, existingIds);
  const clusterEntities = new Set(cluster.signals.flatMap((signal) => [...extractStrongEntities(`${signal.title} ${signal.summary || ''}`)]));
  const existingEntities = extractStrongEntities(`${existing.title || ''} ${existing.summary || ''}`);
  return { overlap, strongEntity: intersection(clusterEntities, existingEntities).length > 0 };
}

function assignStableIds(clusters, existingTopics) {
  const matchesByCluster = clusters.map((cluster) => existingTopics.map((existing) => {
    if (cluster.anchor === existing.anchor) return { existing, exact: true, overlap: 1 };
    const match = overlapMatch(cluster, existing);
    return { existing, exact: false, ...match };
  }).filter((match) => match.exact || (match.overlap >= 0.55 && match.strongEntity)));

  for (const existing of existingTopics) {
    const claims = matchesByCluster.map((matches, index) => ({
      index,
      match: matches.find((candidate) => candidate.existing.id === existing.id)
    })).filter((claim) => claim.match);
    if (claims.length <= 1) continue;
    claims.sort((left, right) => Number(right.match.exact) - Number(left.match.exact) || right.match.overlap - left.match.overlap ||
      clusters[left.index].anchor.localeCompare(clusters[right.index].anchor));
    for (const claim of claims.slice(1)) {
      matchesByCluster[claim.index] = matchesByCluster[claim.index].filter((candidate) => candidate.existing.id !== existing.id);
    }
  }

  const aliases = [];
  clusters.forEach((cluster, index) => {
    const matches = matchesByCluster[index].map((match) => match.existing).sort((a, b) => a.id.localeCompare(b.id));
    cluster.id = matches[0]?.id || topicIdForAnchor(cluster.anchor);
    for (const losing of matches.slice(1)) {
      aliases.push({ aliasId: losing.id, canonicalId: cluster.id, reason: 'merge' });
    }
  });
  return aliases.sort((a, b) => a.aliasId.localeCompare(b.aliasId));
}

function buildTopics(inputSignals = [], options = {}) {
  const now = new Date(options.now || new Date());
  const windowHours = Math.max(1, Math.min(Number(options.windowHours) || 72, 720));
  const cutoff = now.getTime() - windowHours * 3600000;
  const signals = [...inputSignals].filter((signal) => {
    const time = new Date(signal.publishedAt).getTime();
    return Number.isFinite(time) && time >= cutoff && time <= now.getTime() + 300000;
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const clusters = connectedComponents(signals).map((component) => ({
    ...component,
    anchor: topicAnchor(component.signals)
  })).sort((a, b) => a.anchor.localeCompare(b.anchor));
  const aliases = assignStableIds(clusters, Array.isArray(options.existingTopics) ? options.existingTopics : []);
  const snapshotMap = options.previousSnapshots instanceof Map
    ? options.previousSnapshots
    : new Map((options.previousSnapshots || []).map((snapshot) => [snapshot.topicId, snapshot]));

  const topics = clusters.map((cluster) => {
    const orderedSignals = [...cluster.signals].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt) || String(a.id).localeCompare(String(b.id)));
    const representative = chooseRepresentative(cluster.signals);
    const firstSeenAt = orderedSignals.map((signal) => signal.firstSeenAt || signal.publishedAt).sort()[0];
    const latestSeenAt = orderedSignals.map((signal) => signal.publishedAt).sort().at(-1);
    const trend = scoreTrend(cluster.signals, {
      now,
      firstSeenAt,
      previousSnapshot: snapshotMap.get(cluster.id)
    });
    const topicBase = {
      id: cluster.id,
      anchor: cluster.anchor,
      title: representative.title,
      summary: representative.summary || null,
      firstSeenAt,
      latestSeenAt,
      trendScore: trend.trendScore,
      trendDirection: trend.trendDirection,
      evidenceStrength: trend.evidenceStrength,
      formulaVersion: trend.formulaVersion,
      scoreBreakdown: { ...trend.scoreBreakdown, rawInputs: trend.rawInputs, whatChanged: trend.whatChanged },
      clusterReasons: cluster.reasons,
      signalIds: orderedSignals.map((signal) => signal.id)
    };
    const opportunity = buildOpportunity({ ...topicBase, signals: cluster.signals }, { now });
    return { ...topicBase, creatorScore: opportunity.creatorScore, opportunity };
  }).sort((a, b) => b.trendScore - a.trendScore || new Date(b.latestSeenAt) - new Date(a.latestSeenAt) || a.id.localeCompare(b.id));

  return { topics, aliases };
}

module.exports = {
  TREND_FORMULA_VERSION,
  TRUST_WEIGHTS,
  buildTopics,
  extractStrongEntities,
  scoreTrend,
  topicIdForAnchor
};
