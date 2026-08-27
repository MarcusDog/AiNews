export const normalizeDailySeries = (payload) => (
  Array.isArray(payload?.daily)
    ? payload.daily.map((item) => ({ date: item.date, count: Number(item.count || 0), categories: item.categories || {} }))
    : []
);

export const getBubbleRiskLabel = (level) => ({
  high: '高风险',
  medium: '存在缺口',
  low: '覆盖良好'
}[level] || '待分析');

export const getBlindSpotKey = (spot = {}, index = 0) => (
  spot.id || `${spot.dimension || 'unknown'}:${spot.label || 'blind-spot'}:${index}`
);

export const trendDirectionLabel = (trend) => ({
  surging: '快速升温',
  rising: '升温',
  stable: '平稳',
  declining: '降温',
  insufficient: '历史不足'
}[trend] || '待分析');
