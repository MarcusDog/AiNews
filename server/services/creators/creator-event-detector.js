const crypto = require('node:crypto');

const SCORE_THRESHOLDS = Object.freeze([60, 75, 90]);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function eventId(event) {
  const identity = [
    event.eventType, event.entityType, event.entityId,
    event.formulaVersion || 'unversioned', event.transitionBucket
  ].join('|');
  return `creator-event_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

function makeEvent(input, event) {
  const after = input.after || {};
  const normalized = {
    eventType: event.eventType,
    entityType: event.entityType || input.entityType,
    entityId: event.entityId || input.entityId,
    verticalId: event.verticalId ?? after.verticalId ?? after.vertical_id ?? null,
    platform: event.platform ?? after.platform ?? null,
    creatorId: event.creatorId ?? after.creatorId ?? after.creator_id ?? null,
    score: Number.isFinite(Number(event.score ?? after.score ?? after.hotness))
      ? Number(event.score ?? after.score ?? after.hotness)
      : null,
    formulaVersion: event.formulaVersion || after.formulaVersion || after.formula_version || input.stateVersion,
    transitionBucket: event.transitionBucket,
    occurredAt: event.occurredAt || input.occurredAt || input.stateVersion || new Date().toISOString(),
    payload: { ...(event.payload || {}) }
  };
  if (normalized.creatorId) normalized.payload.creatorId = normalized.creatorId;
  normalized.id = event.id || eventId(normalized);
  return normalized;
}

function detectCreatorEvents(input = {}) {
  const before = input.before;
  const after = input.after;
  if (!after) return [];
  const events = [];
  if (input.entityType === 'account' && input.producer === 'collector') {
    const existingIds = new Set(before?.existingIds || []);
    for (const post of after.posts || []) {
      if (existingIds.has(post.id) || post.historical === true) continue;
      events.push(makeEvent({ ...input, entityType: 'post', entityId: post.id, after: post }, {
        eventType: 'post.published', entityType: 'post', entityId: post.id, transitionBucket: 'inserted'
      }));
    }
    return events;
  }
  if (input.entityType === 'post' && input.producer === 'collector' && !before && after.historical !== true) {
    events.push(makeEvent(input, { eventType: 'post.published', transitionBucket: 'inserted' }));
  }
  if (input.entityType === 'post' && input.producer === 'hotness') {
    const previousScore = number(before?.score);
    const currentScore = number(after?.score);
    for (const threshold of SCORE_THRESHOLDS) {
      if (previousScore < threshold && currentScore >= threshold) {
        events.push(makeEvent(input, {
          eventType: 'post.hot', transitionBucket: `score:${threshold}`,
          payload: { previousScore, currentScore }
        }));
      }
    }
  }
  if (input.entityType === 'topic') {
    const beforeCreators = number(before?.creatorCount ?? before?.creator_count);
    const afterCreators = number(after?.creatorCount ?? after?.creator_count);
    const beforePlatforms = number(before?.platformCount ?? before?.platform_count);
    const afterPlatforms = number(after?.platformCount ?? after?.platform_count);
    if (beforeCreators < 3 && afterCreators >= 3) {
      events.push(makeEvent(input, { eventType: 'topic.multi_creator', transitionBucket: 'creators:3' }));
    }
    if ((beforeCreators < 3 || beforePlatforms < 2) && afterCreators >= 3 && afterPlatforms >= 2) {
      events.push(makeEvent(input, { eventType: 'topic.cross_platform', transitionBucket: 'creators:3-platforms:2' }));
    }
  }
  return events;
}

module.exports = { SCORE_THRESHOLDS, detectCreatorEvents, eventId };
