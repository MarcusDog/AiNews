import {
  getBubbleRiskLabel,
  getBlindSpotKey,
  normalizeDailySeries,
  trendDirectionLabel
} from './analytics';

test('normalizes a seven-day series without fake history data', () => {
  expect(normalizeDailySeries({ daily: [{ date: '2026-08-05', count: 2 }] })).toEqual([
    { date: '2026-08-05', count: 2, categories: {} }
  ]);
  expect(normalizeDailySeries(null)).toEqual([]);
});

test('uses the API blind-spot id so coverage and concentration rows never share a React key', () => {
  expect(getBlindSpotKey({ id: 'category:missing', dimension: 'category' }, 0)).toBe('category:missing');
  expect(getBlindSpotKey({ dimension: 'category', label: '分类过度集中' }, 1)).toBe('category:分类过度集中:1');
});

test('maps API risk and trend semantics to truthful Chinese labels', () => {
  expect(getBubbleRiskLabel('high')).toBe('高风险');
  expect(getBubbleRiskLabel('low')).toBe('覆盖良好');
  expect(trendDirectionLabel('declining')).toBe('降温');
  expect(trendDirectionLabel('surging')).toBe('快速升温');
  expect(trendDirectionLabel('insufficient')).toBe('历史不足');
});
