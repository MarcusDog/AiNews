const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSourceHealthSnapshot, getSourceHealthStatus, parseTimestamp } = require('../utils/source-health');

const NOW = new Date('2026-08-26T12:00:00.000Z');

test('source health status is derived from configured and recorded fetch state', () => {
  assert.equal(getSourceHealthStatus({ configured_enabled: false }, NOW), 'inactive');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 5, last_success: '2026-08-26T10:00:00Z' }, NOW), 'error');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 2, last_success: '2026-08-26T10:00:00Z' }, NOW), 'delayed');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 0, last_success: null }, NOW), 'pending');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 0, last_success: '2026-08-26T10:00:00Z' }, NOW), 'healthy');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 0, last_success: '2026-08-26T12:04:00Z' }, NOW), 'healthy');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 0, last_success: '2026-08-26T12:06:00Z' }, NOW), 'delayed');
  assert.equal(getSourceHealthStatus({ configured_enabled: true, is_active: true, fail_count: 0, last_success: '2026-08-27T12:00:00Z' }, NOW), 'delayed');
});

test('stale last success is delayed even when the collector has not recorded failures', () => {
  assert.equal(getSourceHealthStatus({
    configured_enabled: true,
    is_active: true,
    fail_count: 0,
    last_success: '2026-08-24T10:00:00Z'
  }, NOW), 'delayed');
});

test('public source health snapshot strips internal error details and returns real totals', () => {
  const snapshot = buildSourceHealthSnapshot([
    {
      name: 'Official Feed',
      url: 'https://example.com/feed.xml',
      category: 'AI新闻',
      language: 'en',
      source_group: 'product',
      source_group_label: '产品与官方',
      configured_enabled: true,
      is_active: 1,
      fail_count: 0,
      article_count: 12,
      last_fetch: '2026-08-26T11:00:00Z',
      last_success: '2026-08-26T11:00:00Z',
      error_message: 'private upstream detail'
    },
    {
      name: 'Paused Feed',
      url: 'https://example.com/paused.xml',
      configured_enabled: false,
      is_active: 0,
      fail_count: 0,
      article_count: 0
    }
  ], { now: NOW });

  assert.deepEqual(snapshot.summary, { total: 2, healthy: 1, delayed: 0, error: 0, pending: 0, inactive: 1 });
  assert.equal(snapshot.sources[0].articleCount, 12);
  assert.equal(snapshot.sources[0].status, 'healthy');
  assert.equal('errorMessage' in snapshot.sources[0], false);
  assert.equal(snapshot.generatedAt, NOW.toISOString());
});


test('health timestamps reject impossible calendar dates instead of rolling into a healthy day', () => {
  assert.equal(parseTimestamp('2026-02-30 10:00:00'), null);
  assert.equal(parseTimestamp('2026-02-30T10:00:00Z'), null);
  assert.equal(parseTimestamp('2026-02-29T10:00:00+08:00'), null);
  assert.equal(parseTimestamp('2024-02-29 10:00:00').toISOString(), '2024-02-29T10:00:00.000Z');
  assert.equal(getSourceHealthStatus({
    configured_enabled: true, is_active: true, fail_count: 0,
    last_success: '2026-02-30T10:00:00Z'
  }, new Date('2026-03-02T10:30:00Z')), 'pending');
});


test('source health rejects ambiguous date-only and locale-dependent timestamps', () => {
  for (const value of ['2026-08-26', '08/26/2026 10:00:00', 'Aug 26 2026', 'not-a-time']) {
    assert.equal(parseTimestamp(value), null, `unexpectedly accepted ${value}`);
  }
  assert.equal(parseTimestamp('2026-08-26T10:00:00Z').toISOString(), '2026-08-26T10:00:00.000Z');
  assert.equal(parseTimestamp('2026-08-26 10:00:00').toISOString(), '2026-08-26T10:00:00.000Z');
});
