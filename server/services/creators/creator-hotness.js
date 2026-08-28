const FORMULA_VERSION = 'creator-hotness-v1';

const METRIC_WEIGHTS = Object.freeze({
  views: 0.1,
  likes: 1,
  comments: 2,
  shares: 3,
  bookmarks: 2
});

const COMPONENT_WEIGHTS = Object.freeze({
  engagementVelocity: 0.25,
  engagementAcceleration: 0.15,
  creatorRelativePerformance: 0.20,
  independentCreatorAdoption: 0.15,
  crossPlatformSpread: 0.10,
  freshness: 0.10,
  evidenceCompleteness: 0.05
});

function finite(value) {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number)
    ? null
    : number;
}

function engagement(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  let total = 0;
  let known = 0;
  for (const [field, weight] of Object.entries(METRIC_WEIGHTS)) {
    const value = finite(snapshot[field]);
    if (value === null) continue;
    total += Math.max(value, 0) * weight;
    known += 1;
  }
  return known ? total : null;
}

function round(value, places = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const power = 10 ** places;
  return Math.round(value * power) / power;
}

function velocityAt(sorted, latest, minutes, nowMs) {
  const boundary = nowMs - minutes * 60 * 1000;
  const older = [...sorted].reverse().find((item) => Date.parse(item.capturedAt) <= boundary);
  if (!older) return null;
  const currentValue = engagement(latest);
  const olderValue = engagement(older);
  const hours = (Date.parse(latest.capturedAt) - Date.parse(older.capturedAt)) / 3_600_000;
  if (currentValue === null || olderValue === null || hours <= 0) return null;
  return round((currentValue - olderValue) / hours);
}

function calculateVelocities(snapshots = [], now = Date.now()) {
  const sorted = snapshots
    .filter((item) => Number.isFinite(Date.parse(item?.capturedAt)))
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  if (!sorted.length) {
    return { velocity15: null, velocity60: null, velocity180: null, acceleration: null };
  }
  const latest = sorted[sorted.length - 1];
  const nowMs = Date.parse(now);
  const velocity15 = velocityAt(sorted, latest, 15, nowMs);
  const velocity60 = velocityAt(sorted, latest, 60, nowMs);
  const velocity180 = velocityAt(sorted, latest, 180, nowMs);
  const acceleration = velocity15 === null || velocity60 === null ? null : round(velocity15 - velocity60);
  return { velocity15, velocity60, velocity180, acceleration };
}

function percentile(value, population = []) {
  if (value === null || value === undefined) return null;
  const finitePopulation = population.map(finite).filter((item) => item !== null).sort((a, b) => a - b);
  if (!finitePopulation.length) return null;
  const atOrBelow = finitePopulation.filter((item) => item <= value).length;
  return round((atOrBelow / finitePopulation.length) * 100);
}

function median(values = []) {
  const sorted = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(Math.max(value, minimum), maximum);
}

function component(raw, weight) {
  const safeRaw = raw === null ? 0 : clamp(raw);
  return { raw: raw === null ? null : round(safeRaw), weight, weighted: round(safeRaw * weight) };
}

function ageBucket(ageHours) {
  if (!Number.isFinite(ageHours)) return 'unknown';
  if (ageHours <= 6) return '0-6h';
  if (ageHours <= 24) return '6-24h';
  return '24h+';
}

function selectPeerCohort(samples = [], currentPost = {}, currentAgeHours) {
  const verticalIds = new Set(currentPost.verticalIds || []);
  const bucket = ageBucket(currentAgeHours);
  return samples.filter((sample) => {
    if (sample?.platform !== currentPost.platform) return false;
    if (ageBucket(Number(sample.ageHours)) !== bucket) return false;
    if (verticalIds.size && !verticalIds.has(sample.verticalId)) return false;
    return true;
  });
}

function scoreCreatorPost(input = {}) {
  const currentPost = input.post || {};
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots : [];
  const latest = snapshots
    .filter((item) => Number.isFinite(Date.parse(item?.capturedAt)))
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt))
    .at(-1) || null;
  const currentEngagement = engagement(latest);
  const velocities = calculateVelocities(snapshots, input.now || Date.now());
  const primaryVelocity = velocities.velocity60 ?? velocities.velocity15 ?? velocities.velocity180;
  const ageHours = Math.max(0, (Date.parse(input.now || Date.now()) - Date.parse(currentPost.publishedAt)) / 3_600_000);
  const cohort = selectPeerCohort(input.peerSamples || [], currentPost, ageHours);
  const peerVelocities = input.peerSamples
    ? cohort.map((sample) => sample.velocity)
    : input.peers?.velocities || [];
  const peerAccelerations = input.peerSamples
    ? cohort.map((sample) => sample.acceleration)
    : input.peers?.accelerations || [];
  const velocityPercentile = percentile(primaryVelocity, peerVelocities);
  const accelerationPercentile = percentile(velocities.acceleration, peerAccelerations);
  const creatorMedianEngagement = median(input.creator30DayEngagements || []);
  const creatorRelativeRatio = currentEngagement === null || !creatorMedianEngagement
    ? null
    : round(currentEngagement / creatorMedianEngagement);
  const metricKnown = latest
    ? Object.keys(METRIC_WEIGHTS).filter((field) => finite(latest[field]) !== null).length
    : 0;
  const evidenceRatio = round((metricKnown + (currentPost.provenanceUrl ? 1 : 0)) / 6);
  const freshness = Number.isFinite(ageHours) ? clamp(100 * (1 - ageHours / 72)) : null;
  const components = {
    engagementVelocity: component(velocityPercentile, COMPONENT_WEIGHTS.engagementVelocity),
    engagementAcceleration: component(accelerationPercentile, COMPONENT_WEIGHTS.engagementAcceleration),
    creatorRelativePerformance: component(
      creatorRelativeRatio === null ? null : (creatorRelativeRatio / 3) * 100,
      COMPONENT_WEIGHTS.creatorRelativePerformance
    ),
    independentCreatorAdoption: component(
      clamp((Number(input.independentCreatorCount || 0) / 5) * 100),
      COMPONENT_WEIGHTS.independentCreatorAdoption
    ),
    crossPlatformSpread: component(
      clamp((Number(input.platformCount || 0) / 3) * 100),
      COMPONENT_WEIGHTS.crossPlatformSpread
    ),
    freshness: component(freshness, COMPONENT_WEIGHTS.freshness),
    evidenceCompleteness: component(evidenceRatio * 100, COMPONENT_WEIGHTS.evidenceCompleteness)
  };

  const collectedDelayDays = (
    Date.parse(currentPost.collectedAt) - Date.parse(currentPost.publishedAt)
  ) / 86_400_000;
  const penalties = {
    advertisement: currentPost.metadata?.isSponsored ? 20 : 0,
    reshare: currentPost.sharedFrom ? 10 : 0,
    oldPostReplay: Number.isFinite(collectedDelayDays) && collectedDelayDays > 7 ? 20 : 0,
    missingEvidence: evidenceRatio < 0.5 ? round((0.5 - evidenceRatio) * 30) : 0,
    lowConfidenceSource: currentPost.sourceConfidence === 'bridge' ? 8 : 0
  };
  const positive = Object.values(components).reduce((sum, item) => sum + item.weighted, 0);
  const penaltyTotal = Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const unroundedScore = positive - penaltyTotal;
  const highConfidence = snapshots.length >= 3
    && velocityPercentile !== null
    && creatorMedianEngagement !== null
    && evidenceRatio >= 0.5;
  return {
    formulaVersion: FORMULA_VERSION,
    score: round(clamp(unroundedScore), 2),
    unroundedScore,
    confidence: highConfidence ? 'high' : evidenceRatio >= 0.34 ? 'medium' : 'low',
    inputs: {
      velocities,
      currentEngagement,
      velocityPercentile,
      accelerationPercentile,
      creatorMedianEngagement,
      creatorRelativeRatio,
      independentCreatorCount: Number(input.independentCreatorCount || 0),
      platformCount: Number(input.platformCount || 0),
      evidenceRatio,
      ageHours: round(ageHours),
      peerScope: {
        platform: currentPost.platform || null,
        verticalIds: [...(currentPost.verticalIds || [])],
        ageBucket: ageBucket(ageHours),
        sampleCount: input.peerSamples ? cohort.length : peerVelocities.length
      }
    },
    components,
    penalties
  };
}

module.exports = {
  FORMULA_VERSION,
  COMPONENT_WEIGHTS,
  engagement,
  calculateVelocities,
  percentile,
  ageBucket,
  selectPeerCohort,
  scoreCreatorPost
};
