const EVIDENCE_LABELS = {
  official: '官方一手',
  research: '研究论文',
  media: '媒体报道',
  engineering: '工程社区'
};

function parseBoundedInteger(value, { fallback, min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function formatDateInTimeZone(date, timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildDailyTrendSeries({ daily = [], dailyCategory = [], days = 7, today = new Date(), timeZone = 'Asia/Shanghai' }) {
  const safeDays = parseBoundedInteger(days, { fallback: 7, min: 1, max: 30 });
  const dateCounts = new Map(daily.map((row) => [row.date, Number(row.count || 0)]));
  const categoryCounts = new Map();

  dailyCategory.forEach((row) => {
    if (!categoryCounts.has(row.date)) categoryCounts.set(row.date, {});
    categoryCounts.get(row.date)[row.category || '未分类'] = Number(row.count || 0);
  });

  const localToday = formatDateInTimeZone(today, timeZone);
  const [year, month, day] = localToday.split('-').map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  const fullDays = [];

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor - offset * 86400000).toISOString().slice(0, 10);
    fullDays.push({
      date,
      count: dateCounts.get(date) || 0,
      categories: categoryCounts.get(date) || {}
    });
  }

  const first = fullDays[0]?.count || 0;
  const last = fullDays.at(-1)?.count || 0;
  const changeRate = first > 0 ? Math.round(((last - first) / first) * 100) : (last > 0 ? 100 : 0);

  return {
    daily: fullDays,
    total: fullDays.reduce((sum, row) => sum + row.count, 0),
    average: fullDays.length ? Math.round((fullDays.reduce((sum, row) => sum + row.count, 0) / fullDays.length) * 10) / 10 : 0,
    changeRate,
    timeZone
  };
}

function classifyEvidenceType(article = {}) {
  const source = String(article.source || '').toLowerCase();
  if (/官方|openai news|deepmind|microsoft research|apple machine learning|qwen|deepseek|paddle|modelscope|hugging face|pytorch|tensorflow/.test(source)) {
    return 'official';
  }
  if (article.sourceGroup === 'research' || /arxiv|paper|research|论文|大学|实验室/.test(source)) return 'research';
  if (article.sourceGroup === 'investment' || /techcrunch|venturebeat|the verge|technology review|量子位|媒体|新闻/.test(source)) return 'media';
  return 'engineering';
}

function distribution(items, keySelector, labelSelector = (key) => key) {
  const map = new Map();
  items.forEach((item) => {
    const key = keySelector(item) || 'unknown';
    const entry = map.get(key) || { key, name: labelSelector(key), count: 0, sampleUrl: item.url || null };
    entry.count += 1;
    if (!entry.sampleUrl && item.url) entry.sampleUrl = item.url;
    map.set(key, entry);
  });
  const total = items.length || 1;
  return [...map.values()]
    .map((entry) => ({ ...entry, percentage: Math.round((entry.count / total) * 100) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function normalizedEntropy(counts, expectedBuckets) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total || expectedBuckets <= 1) return 0;
  const entropy = counts.reduce((sum, count) => {
    if (!count) return sum;
    const probability = count / total;
    return sum - probability * Math.log2(probability);
  }, 0);
  return Math.min(1, entropy / Math.log2(expectedBuckets));
}

function buildDiversitySnapshot(articles = []) {
  if (!articles.length) {
    return {
      status: 'insufficient_data', diversityScore: 0, riskLevel: 'high', riskMessage: '暂无足够数据',
      dimensions: [], categoryDistribution: [], sourceDistribution: [], regionDistribution: [],
      evidenceDistribution: [], blindSpots: [], recommendations: ['等待更多不同来源的资讯后再分析']
    };
  }

  const enriched = articles.map((article) => ({
    ...article,
    region: article.region === 'cn' ? 'cn' : 'global',
    evidenceType: classifyEvidenceType(article)
  }));
  const sourceDistribution = distribution(enriched, (item) => item.source || '未知来源');
  const regionDistribution = distribution(enriched, (item) => item.region, (key) => key === 'cn' ? '国内' : '国际');
  const evidenceDistribution = distribution(enriched, (item) => item.evidenceType, (key) => EVIDENCE_LABELS[key] || key);
  const categoryDistribution = distribution(enriched, (item) => item.category || '未分类');
  const sourceTarget = Math.max(2, Math.min(8, enriched.length));

  const dimensions = [
    { id: 'source', label: '来源分散度', weight: 0.3, score: Math.round(normalizedEntropy(sourceDistribution.map((row) => row.count), sourceTarget) * 100), coverage: sourceDistribution.length, target: sourceTarget },
    { id: 'region', label: '国内外覆盖', weight: 0.25, score: Math.round(normalizedEntropy(regionDistribution.map((row) => row.count), 2) * 100), coverage: regionDistribution.length, target: 2 },
    { id: 'evidence', label: '证据类型', weight: 0.25, score: Math.round(normalizedEntropy(evidenceDistribution.map((row) => row.count), 4) * 100), coverage: evidenceDistribution.length, target: 4 },
    { id: 'category', label: '内容分类', weight: 0.2, score: Math.round(normalizedEntropy(categoryDistribution.map((row) => row.count), 5) * 100), coverage: categoryDistribution.length, target: 5 }
  ];
  const diversityScore = Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0));
  const riskLevel = diversityScore < 45 ? 'high' : diversityScore < 70 ? 'medium' : 'low';
  const presentRegions = new Set(regionDistribution.map((row) => row.key));
  const presentEvidence = new Set(evidenceDistribution.map((row) => row.key));
  const presentCategories = new Set(categoryDistribution.map((row) => row.key));
  const blindSpots = [];
  const missingRegions = ['cn', 'global'].filter((key) => !presentRegions.has(key));
  const missingEvidence = ['official', 'research', 'media', 'engineering'].filter((key) => !presentEvidence.has(key));
  const missingCategories = ['AI新闻', 'AI框架', '新算法', '新思路', '新工具'].filter((key) => !presentCategories.has(key));
  if (missingRegions.length) blindSpots.push({ id: 'region:missing', dimension: 'region', label: '地区盲区', missing: missingRegions });
  if (missingEvidence.length) blindSpots.push({ id: 'evidence:missing', dimension: 'evidence', label: '证据盲区', missing: missingEvidence });
  if (missingCategories.length) blindSpots.push({ id: 'category:missing', dimension: 'category', label: '分类盲区', missing: missingCategories });

  [
    { dimension: 'source', label: '来源过度集中', rows: sourceDistribution, threshold: 35 },
    { dimension: 'region', label: '地区过度集中', rows: regionDistribution, threshold: 80 },
    { dimension: 'evidence', label: '证据过度集中', rows: evidenceDistribution, threshold: 60 },
    { dimension: 'category', label: '分类过度集中', rows: categoryDistribution, threshold: 60 }
  ].forEach(({ dimension, label, rows, threshold }) => {
    const dominant = rows[0];
    if (dominant?.percentage >= threshold) {
      blindSpots.push({
        id: `${dimension}:concentration`,
        dimension,
        label,
        missing: [],
        dominant: { name: dominant.name, percentage: dominant.percentage }
      });
    }
  });

  const recommendations = blindSpots.map((spot) => {
    if (spot.dominant) return `${spot.label}于“${spot.dominant.name}”(${spot.dominant.percentage}%)，建议优先补充相反或互补视角`;
    if (spot.dimension === 'region') return `补充${spot.missing.includes('cn') ? '国内' : '国际'}来源，避免单一地区叙事`;
    if (spot.dimension === 'evidence') return `补充${spot.missing.map((key) => EVIDENCE_LABELS[key]).join('、')}，对媒体说法进行交叉验证`;
    return `补充${spot.missing.join('、')}分类，扩大议题覆盖`;
  });
  if (!recommendations.length) recommendations.push('四个维度覆盖均衡，继续保留跨来源交叉验证');

  return {
    status: 'ready',
    diversityScore,
    riskLevel,
    riskMessage: riskLevel === 'high' ? '信息茧房风险较高' : riskLevel === 'medium' ? '仍有明显覆盖缺口' : '来源覆盖较为均衡',
    sampleSize: enriched.length,
    dimensions,
    categoryDistribution: categoryDistribution.map(({ key, ...row }) => row),
    sourceDistribution: sourceDistribution.map(({ key, ...row }) => row),
    regionDistribution: regionDistribution.map(({ key, ...row }) => row),
    evidenceDistribution: evidenceDistribution.map(({ key, ...row }) => row),
    blindSpots,
    recommendations,
    methodology: '最近资讯样本；来源30%、地区25%、证据类型25%、分类20%；使用归一化信息熵衡量集中度。'
  };
}

module.exports = {
  EVIDENCE_LABELS,
  buildDailyTrendSeries,
  buildDiversitySnapshot,
  classifyEvidenceType,
  formatDateInTimeZone,
  parseBoundedInteger
};
