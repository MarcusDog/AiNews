const DEFAULT_STALE_AFTER_HOURS = 36;

function parseTimestamp(value) {
  if (!value) return null;
  const source = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(source)
    ? `${source.replace(' ', 'T')}Z`
    : source;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getSourceHealthStatus(source = {}, now = new Date(), staleAfterHours = DEFAULT_STALE_AFTER_HOURS) {
  if (source.configured_enabled === false || source.is_active === 0 || source.is_active === false) return 'inactive';
  const failures = Number(source.fail_count) || 0;
  if (failures >= 5) return 'error';
  if (failures > 0 || source.is_healthy === false) return 'delayed';

  const lastSuccess = parseTimestamp(source.last_success);
  if (!lastSuccess) return 'pending';
  const ageHours = (now.getTime() - lastSuccess.getTime()) / 3600000;
  return ageHours > staleAfterHours ? 'delayed' : 'healthy';
}

function toPublicSource(source, options = {}) {
  const now = options.now || new Date();
  return {
    id: source.id || null,
    name: source.name || '未命名来源',
    url: source.url || null,
    category: source.category || null,
    language: source.language || null,
    sourceGroup: source.source_group || 'other',
    sourceGroupLabel: source.source_group_label || '其他',
    enabled: source.configured_enabled !== false,
    status: getSourceHealthStatus(source, now, options.staleAfterHours),
    failureCount: Number(source.fail_count) || 0,
    articleCount: Number(source.article_count) || 0,
    lastFetchAt: source.last_fetch || null,
    lastSuccessAt: source.last_success || null
  };
}

function buildSourceHealthSnapshot(sources = [], options = {}) {
  const now = options.now || new Date();
  const publicSources = (Array.isArray(sources) ? sources : []).map((source) => toPublicSource(source, { ...options, now }));
  const summary = { total: publicSources.length, healthy: 0, delayed: 0, error: 0, pending: 0, inactive: 0 };
  publicSources.forEach((source) => {
    if (Object.prototype.hasOwnProperty.call(summary, source.status)) summary[source.status] += 1;
  });
  return { generatedAt: now.toISOString(), summary, sources: publicSources };
}

module.exports = {
  buildSourceHealthSnapshot,
  getSourceHealthStatus,
  parseTimestamp,
  toPublicSource
};
