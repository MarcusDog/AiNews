const ContentService = require('./ContentService');
const { buildDiversitySnapshot, classifyEvidenceType } = require('../utils/analytics');

const QUERY_STOP_WORDS = [
  '请你', '请问', '帮我', '给我', '分析', '总结', '介绍', '一下', '最近', '最新', '今天',
  '新闻', '资讯', '趋势', '如何', '什么', '哪些', '这个', '一个', '关于', '网站', '整个'
];

class AgentContextService {
  extractQueryTerms(message = '') {
    const text = String(message).toLowerCase();
    const latin = text.match(/[a-z][a-z0-9+._-]{1,}/g) || [];
    let chinese = text.replace(/[a-z0-9+._-]+/gi, ' ');
    QUERY_STOP_WORDS.forEach((word) => { chinese = chinese.replaceAll(word, ' '); });
    const chunks = chinese.match(/[\u3400-\u9fff]{2,}/g) || [];
    const bigrams = chunks.flatMap((chunk) => {
      if (chunk.length <= 4) return [chunk];
      return Array.from({ length: chunk.length - 1 }, (_, index) => chunk.slice(index, index + 2));
    });
    return [...new Set([...latin, ...chunks, ...bigrams])].filter((term) => term.length >= 2).slice(0, 16);
  }

  relevanceScore(article, terms) {
    if (!terms.length) return 0;
    const title = String(article.title || '').toLowerCase();
    const description = String(article.description || '').toLowerCase();
    return terms.reduce((score, term) => score + (title.includes(term) ? 5 : 0) + (description.includes(term) ? 2 : 0), 0);
  }

  selectEvidence(message, articles = [], limit = 8) {
    const terms = this.extractQueryTerms(message);
    const scored = articles
      .filter((article) => article?.url)
      .map((article) => ({ article, score: this.relevanceScore(article, terms) }))
      .sort((a, b) => b.score - a.score || new Date(b.article.publishedAt || 0) - new Date(a.article.publishedAt || 0));
    const relevant = scored.some((item) => item.score > 0)
      ? scored.filter((item) => item.score > 0).map((item) => item.article)
      : scored.map((item) => item.article).slice(0, 40);
    return ContentService.selectDiverseEvidence(relevant, { topic: '', limit });
  }

  toSource(article, index) {
    const evidenceType = classifyEvidenceType(article);
    return {
      citationId: `S${index + 1}`,
      id: article.id,
      title: article.title || '未命名资讯',
      summary: String(article.description || '').slice(0, 600),
      source: article.source || '未知来源',
      url: article.url,
      publishedAt: article.publishedAt || null,
      category: article.category || null,
      evidenceType,
      region: article.region === 'cn' ? 'cn' : 'global',
      claimBoundary: ContentService.evidenceBoundary(evidenceType)
    };
  }

  async build(message) {
    const NewsService = require('./NewsService');
    const TrendAnalyzer = require('./TrendAnalyzer');
    const [news, stats, siteDiversity] = await Promise.all([
      NewsService.getAnalysisNews(500),
      NewsService.getStatistics(),
      NewsService.getDiversityAnalysis('agent')
    ]);
    const selected = this.selectEvidence(message, news.data, 8);
    const articleSources = selected.map((article, index) => this.toSource(article, index));
    const sourceIdByUrl = new Map(articleSources.map((source) => [source.url, source.citationId]));
    const trendData = await TrendAnalyzer.analyzeTrends(news.data);
    const terms = this.extractQueryTerms(message);
    const relevantTrends = (trendData.topKeywords || [])
      .filter((trend) => !terms.length || terms.some((term) => trend.keyword.toLowerCase().includes(term) || term.includes(trend.keyword.toLowerCase())))
      .slice(0, 5)
      .map((trend) => ({
        keyword: trend.keyword,
        recentCount: trend.recentCount,
        previousCount: trend.previousCount,
        growth: trend.growth,
        trend: trend.trend,
        sourceIds: (trend.sources || []).map((source) => sourceIdByUrl.get(source.url)).filter(Boolean)
      }))
      .filter((trend) => trend.sourceIds.length);
    const evidenceDiversity = buildDiversitySnapshot(selected);
    const internalSources = [
      {
        citationId: `S${articleSources.length + 1}`,
        title: 'AI News 站内资讯统计',
        summary: `当前资讯库共 ${stats.total || 0} 条，今日新增 ${stats.today || 0} 条。`,
        source: 'AI News 站内数据',
        url: '/api/analytics/stats',
        publishedAt: new Date().toISOString(),
        category: 'analytics',
        evidenceType: 'internal-data',
        region: 'site',
        claimBoundary: '只描述本站当前聚合结果，不代表整个行业的总体分布。'
      },
      {
        citationId: `S${articleSources.length + 2}`,
        title: 'AI News 信息茧房分析',
        summary: `当前多样性评分 ${siteDiversity.diversityScore || 0}/100，风险等级 ${siteDiversity.riskLevel || 'unknown'}。`,
        source: 'AI News 站内分析',
        url: '/api/analytics/diversity',
        publishedAt: new Date().toISOString(),
        category: 'analytics',
        evidenceType: 'internal-analysis',
        region: 'site',
        claimBoundary: '评分仅适用于本站已收录样本，并受抓取覆盖和样本窗口影响。'
      },
      {
        citationId: `S${articleSources.length + 3}`,
        title: 'AI News 等长窗口趋势分析',
        summary: `站内趋势使用最近 7 天与此前 7 天的等长窗口；当前基线状态为 ${trendData.comparison?.status || 'unknown'}。`,
        source: 'AI News 站内分析',
        url: '/api/analytics/smart-trends',
        publishedAt: new Date().toISOString(),
        category: 'analytics',
        evidenceType: 'internal-analysis',
        region: 'site',
        claimBoundary: '趋势只反映本站收录量变化；历史不足时不得解释为行业增长。'
      }
    ];
    const sources = [...articleSources, ...internalSources];

    return {
      generatedAt: new Date().toISOString(),
      site: {
        total: stats.total || 0,
        today: stats.today || 0,
        diversityScore: siteDiversity.diversityScore || 0,
        riskLevel: siteDiversity.riskLevel || 'unknown',
        analyzedScope: siteDiversity.analyzedScope || null,
        statsCitationId: internalSources[0].citationId,
        diversityCitationId: internalSources[1].citationId,
        trendCitationId: internalSources[2].citationId
      },
      sources,
      trends: relevantTrends,
      blindSpots: evidenceDiversity.blindSpots || [],
      retrieval: {
        queryTerms: terms,
        analyzedArticles: news.data.length,
        selectedSources: articleSources.length,
        availableCitations: sources.length,
        citationCoverage: sources.every((source) => Boolean(source.url))
      }
    };
  }
}

module.exports = {
  AgentContextService,
  agentContextService: new AgentContextService()
};
