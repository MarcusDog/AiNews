const test = require('node:test');
const assert = require('node:assert/strict');

const schedules = require('../config/schedules');

test('news update schedule keeps 8am full refresh and 2-hour interval updates', () => {
  assert.equal(schedules.newsSchedules.dailyMorning, '0 8 * * *');
  assert.equal(schedules.newsSchedules.recurring, '0 */2 * * *');
  assert.equal(schedules.newsSchedules.diversityAudit, '30 8 * * *');
  assert.equal(schedules.newsSchedules.timezone, 'Asia/Shanghai');
});

test('news retention covers both trend windows plus recovery margin', () => {
  assert(schedules.newsSchedules.retentionDays >= 30);
});
