const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CreatorStore = require('../services/creators/creator-store');
const SubscriptionService = require('../services/creators/subscription-service');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-subscriptions-'));
  const store = new CreatorStore({ dbPath: path.join(directory, 'creator.db') }).initialize();
  const service = new SubscriptionService({ store, now: () => '2026-08-29T12:00:00.000Z' });
  return { store, service, close: () => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

test('subscriptions persist filters, delivery mode and quiet hours without exposing endpoint secrets', () => {
  const item = fixture();
  try {
    const endpoint = item.service.createEndpoint('user-a', {
      id: 'endpoint-a', type: 'webhook', destination: 'https://hooks.example.com/aya', secretRef: 'env:AYA_WEBHOOK_SECRET'
    });
    const subscription = item.service.createSubscription('user-a', {
      id: 'subscription-a', name: 'AI 高热跨平台', deliveryMode: 'immediate', endpointIds: ['endpoint-a'],
      filters: { verticals: ['ai-tech'], platforms: ['youtube'], creators: ['creator-a'], eventTypes: ['post.hot'], minimumScore: 75 },
      quietHours: { timezone: 'Asia/Shanghai', start: '23:00', end: '07:00' }
    });
    assert.equal(endpoint.secretRef, undefined);
    assert.equal(subscription.deliveryMode, 'immediate');
    assert.deepEqual(subscription.endpointIds, ['endpoint-a']);
    assert.deepEqual(item.service.listSubscriptions('user-a').map((entry) => entry.id), ['subscription-a']);
  } finally { item.close(); }
});

test('endpoint ownership and disabled rules fail closed', () => {
  const item = fixture();
  try {
    item.service.createEndpoint('user-b', { id: 'endpoint-b', type: 'in_app', destination: 'user-b' });
    assert.throws(() => item.service.createSubscription('user-a', {
      id: 'bad-subscription', name: '越权', deliveryMode: 'immediate', endpointIds: ['endpoint-b'], filters: {}
    }), /endpoint_not_owned/);

    item.service.createEndpoint('user-a', { id: 'endpoint-a', type: 'in_app', destination: 'user-a' });
    item.service.createSubscription('user-a', {
      id: 'disabled-subscription', name: '停用规则', deliveryMode: 'immediate', endpointIds: ['endpoint-a'],
      filters: { verticals: ['ai-tech'] }, enabled: false
    });
    assert.deepEqual(item.service.matchEvent({ eventType: 'post.published', verticalId: 'ai-tech', score: 90 }), []);
  } finally { item.close(); }
});

test('matching applies vertical, platform, creator, event and minimum-score filters', () => {
  const item = fixture();
  try {
    item.service.createEndpoint('user-a', { id: 'endpoint-a', type: 'in_app', destination: 'user-a' });
    item.service.createSubscription('user-a', {
      id: 'subscription-a', name: '精准热点', deliveryMode: 'immediate', endpointIds: ['endpoint-a'],
      filters: {
        verticals: ['ai-tech'], platforms: ['youtube'], creators: ['creator-a'],
        eventTypes: ['post.hot'], minimumScore: 75
      }
    });
    const base = { eventType: 'post.hot', verticalId: 'ai-tech', platform: 'youtube', creatorId: 'creator-a', score: 88 };
    const matched = item.service.matchEvent(base, '2026-08-29T16:00:00.000Z');
    assert.deepEqual(matched.map((entry) => entry.subscriptionId), ['subscription-a']);
    assert.equal(matched[0].nextAttemptAt, '2026-08-29T16:00:00.000Z');
    assert.deepEqual(item.service.matchEvent({ ...base, verticalId: 'beauty' }), []);
    assert.deepEqual(item.service.matchEvent({ ...base, platform: 'x' }), []);
    assert.deepEqual(item.service.matchEvent({ ...base, creatorId: 'creator-b' }), []);
    assert.deepEqual(item.service.matchEvent({ ...base, eventType: 'topic.cross_platform' }), []);
    assert.deepEqual(item.service.matchEvent({ ...base, score: 74 }), []);
  } finally { item.close(); }
});

test('quiet hours defer immediate delivery and digest mode schedules the next digest', () => {
  const item = fixture();
  try {
    item.service.createEndpoint('user-a', { id: 'endpoint-a', type: 'in_app', destination: 'user-a' });
    item.service.createSubscription('user-a', {
      id: 'quiet', name: '静默', deliveryMode: 'immediate', endpointIds: ['endpoint-a'], filters: {},
      quietHours: { timezone: 'Asia/Shanghai', start: '19:00', end: '21:00' }
    });
    item.service.createSubscription('user-a', {
      id: 'digest', name: '日报', deliveryMode: 'digest', endpointIds: ['endpoint-a'], filters: {},
      quietHours: { timezone: 'Asia/Shanghai', digestAt: '08:00' }
    });
    const matches = item.service.matchEvent({ eventType: 'post.published' }, '2026-08-29T12:00:00.000Z');
    assert.equal(matches.find((entry) => entry.subscriptionId === 'quiet').nextAttemptAt, '2026-08-29T13:00:00.000Z');
    assert.equal(matches.find((entry) => entry.subscriptionId === 'digest').nextAttemptAt, '2026-08-30T00:00:00.000Z');
  } finally { item.close(); }
});
