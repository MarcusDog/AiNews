const test = require('node:test');
const assert = require('node:assert/strict');

const schedules = require('../config/schedules');

test('news update schedule keeps 8am full refresh and 2-hour interval updates', () => {
  assert.equal(schedules.newsSchedules.dailyMorning, '0 8 * * *');
  assert.equal(schedules.newsSchedules.recurring, '0 */2 * * *');
  assert.equal(schedules.newsSchedules.diversityAudit, '30 8 * * *');
  assert.equal(schedules.newsSchedules.signalRecurring, '*/30 * * * *');
  assert.equal(schedules.newsSchedules.timezone, 'Asia/Shanghai');
});

test('signal refresh cadence is bounded and explicit', () => {
  assert.equal(schedules.newsSchedules.signalRecurring, '*/30 * * * *');
  assert.equal(schedules.newsSchedules.signalWindowHours, 72);
});

test('creator acquisition, reconciliation and metric refresh schedules are explicit', () => {
  assert.equal(schedules.newsSchedules.creatorIncremental, '*/10 * * * *');
  assert.equal(schedules.newsSchedules.creatorReconciliation, '43 3 * * *');
  assert.equal(schedules.newsSchedules.creatorMetricRefresh, '7,27,47 * * * *');
});

test('news retention covers both trend windows plus recovery margin', () => {
  assert(schedules.newsSchedules.retentionDays >= 30);
});
