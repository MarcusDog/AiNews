/**
 * 基于等长时间窗口的趋势分析。所有展示项都保留可核验的新闻来源。
 */
class TrendAnalyzer {
  constructor() {
    this.coreKeywords = [
      'GPT-5', 'GPT-4', 'ChatGPT', 'GPT', '大语言模型', 'LLM', 'Transformer', 'BERT', 'T5',
      'CLIP', 'DALL-E', 'Stable Diffusion', 'PyTorch', 'TensorFlow', 'JAX', 'Hugging Face',
      'OpenAI', '神经网络', '深度学习', '机器学习', '强化学习', '监督学习', '计算机视觉',
      '自然语言处理', 'NLP', '语音识别', '图像生成', 'AI Agent', '智能体', '多模态AI',
      '多模态', '代码生成', '自动驾驶', '机器人', '推荐系统', '预测模型', '生成式AI', 'AIGC',
      'AI绘画', 'AI编程', 'AI写作', 'AI对话', '模型微调', '模型训练', '模型优化', '模型压缩',
      '模型量化', '知识图谱', '向量数据库', '检索增强生成', 'RAG', 'Self-Attention', '多头注意力',
      '注意力机制', '注意力', '对抗训练', '扩散模型', 'Diffusion', 'GAN', '开源模型', '开源框架',
      '开源', 'API', '算力', 'GPU', 'TPU', '训练成本', '推理优化', 'AI安全', 'AI伦理', 'AI对齐',
      '数据隐私', 'AI'
    ].sort((a, b) => b.length - a.length);
    this.trendCache = new Map();
    this.lastAnalysisTime = null;
    this.newsSnapshot = [];
  }

  extractKeywords(text) {
    if (!text) return [];
    const occupied = [];
    const results = [];

    this.coreKeywords.forEach((keyword) => {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ascii = /^[\x00-\x7F]+$/.test(keyword);
      const pattern = ascii ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
      const regex = new RegExp(pattern, 'gi');
      let match;
      let count = 0;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (!occupied.some(([left, right]) => start < right && end > left)) {
          occupied.push([start, end]);
          count += 1;
        }
        if (match[0].length === 0) regex.lastIndex += 1;
      }
      if (count) results.push({ keyword, count, positions: [] });
    });

    return results.sort((a, b) => b.count - a.count || b.keyword.length - a.keyword.length);
  }

  toSource(article) {
    return {
      id: article.id,
      title: article.title || '未命名资讯',
      url: article.url || null,
      source: article.source || '未知来源',
      publishedAt: article.publishedAt || null,
      category: article.category || null,
      region: article.region || 'global'
    };
  }

  async analyzeTrends(newsItems, nowInput = new Date()) {
    if (!Array.isArray(newsItems) || newsItems.length === 0) return this.getEmptyTrends(nowInput);
    const now = new Date(nowInput);
    const day = 86400000;
    const validItems = newsItems
      .map((item) => ({ ...item, _date: new Date(item.publishedAt) }))
      .filter((item) => !Number.isNaN(item._date.getTime()) && item._date <= now)
      .sort((a, b) => b._date - a._date);
    const windows = {
      last24h: validItems.filter((item) => now - item._date <= day),
      last7d: validItems.filter((item) => now - item._date <= 7 * day),
      last30d: validItems.filter((item) => now - item._date <= 30 * day)
    };
    const hasComparisonHistory = validItems.some((item) => now - item._date >= 14 * day);
    const keywordMap = new Map();

    validItems.forEach((item) => {
      const age = now - item._date;
      this.extractKeywords(`${item.title || ''} ${item.description || ''}`).forEach((match) => {
        const current = keywordMap.get(match.keyword) || {
          keyword: match.keyword, count: 0, articles: [], recentArticles: [], previousArticles: []
        };
        current.count += match.count;
        current.articles.push(item);
        if (age <= 7 * day) current.recentArticles.push(item);
        else if (age <= 14 * day) current.previousArticles.push(item);
        keywordMap.set(match.keyword, current);
      });
    });

    const trends = [...keywordMap.values()].map((item) => this.calculateTrend(item, hasComparisonHistory))
      .sort((a, b) => b.recentCount - a.recentCount || b.articleCount - a.articleCount || a.keyword.localeCompare(b.keyword))
      .slice(0, 20);
    const result = {
      analysisId: `analysis_${now.getTime()}`,
      timestamp: now.toISOString(),
      totalAnalyzed: validItems.length,
      topKeywords: trends.slice(0, 10),
      emergingTrends: trends.filter((item) => item.trend === 'surging').slice(0, 5).map((item) => ({ keyword: item.keyword, growth: item.growth, description: this.generateTrendDescription(item, 'emerging'), sources: item.sources })),
      decliningTrends: trends.filter((item) => item.trend === 'declining').slice(0, 5).map((item) => ({ keyword: item.keyword, growth: item.growth, description: this.generateTrendDescription(item, 'declining'), sources: item.sources })),
      insights: this.generateInsights(trends),
      timeDistribution: { last24h: windows.last24h.length, last7d: windows.last7d.length, last30d: windows.last30d.length },
      comparison: {
        recent: '最近7天',
        previous: '此前7天',
        method: hasComparisonHistory ? '按相关文章数比较两个完整的等长周期' : '历史数据尚未覆盖完整的此前7天周期',
        status: hasComparisonHistory ? 'ready' : 'insufficient_history'
      },
      hasNewData: this.hasNewData(validItems)
    };
    this.newsSnapshot = validItems.slice(0, 100).map((item) => item.id);
    this.lastAnalysisTime = now;
    this.trendCache.set('latest', result);
    return result;
  }

  calculateTrend(item, hasComparisonHistory = true) {
    const recentCount = item.recentArticles.length;
    const previousCount = item.previousArticles.length;
    const growth = !hasComparisonHistory ? null : previousCount > 0
      ? Math.round(((recentCount - previousCount) / previousCount) * 100)
      : (recentCount > 0 ? 100 : 0);
    let trend = hasComparisonHistory ? 'stable' : 'insufficient';
    if (hasComparisonHistory && growth >= 100 && recentCount >= 3) trend = 'surging';
    else if (growth >= 25) trend = 'rising';
    else if (growth <= -25) trend = 'declining';
    const citedArticles = (item.recentArticles.length ? item.recentArticles : item.articles).slice(0, 3);
    return {
      keyword: item.keyword,
      count: item.count,
      articleCount: item.articles.length,
      recentCount,
      previousCount,
      growth,
      trend,
      latestArticle: this.toSource(item.articles[0]),
      sources: citedArticles.map((article) => this.toSource(article))
    };
  }

  generateTrendDescription(trend, type) {
    if (type === 'declining') return `${trend.keyword} 最近7天较此前7天减少 ${Math.abs(trend.growth)}%，热度正在回落`;
    return `${trend.keyword} 最近7天较此前7天增长 ${trend.growth}%，并有 ${trend.recentCount} 篇相关资讯`;
  }

  generateInsights(trends) {
    const insights = [];
    if (trends[0]?.trend === 'insufficient') {
      return [{
        type: 'insufficient',
        title: '等待历史基线',
        content: '当前数据库尚未覆盖完整的两个7天周期，因此只展示话题数量，不判断升温或降温。',
        sources: trends[0].sources
      }];
    }
    const rising = trends.find((item) => item.trend === 'surging' || item.trend === 'rising');
    const declining = trends.find((item) => item.trend === 'declining');
    if (rising) insights.push({ type: 'hot', title: '升温话题', content: this.generateTrendDescription(rising, 'emerging'), sources: rising.sources });
    if (declining) insights.push({ type: 'cooling', title: '降温话题', content: this.generateTrendDescription(declining, 'declining'), sources: declining.sources });
    if (!insights.length && trends[0]) insights.push({ type: 'stable', title: '持续关注', content: `${trends[0].keyword} 在最近两个7天周期内保持相对稳定`, sources: trends[0].sources });
    return insights;
  }

  hasNewData(newsItems) {
    if (!this.newsSnapshot.length) return true;
    const previous = new Set(this.newsSnapshot);
    return newsItems.slice(0, 100).some((item) => !previous.has(item.id));
  }

  getEmptyTrends(nowInput = new Date()) {
    const now = new Date(nowInput);
    return {
      analysisId: `empty_${now.getTime()}`, timestamp: now.toISOString(), totalAnalyzed: 0,
      topKeywords: [], emergingTrends: [], decliningTrends: [], insights: [],
      timeDistribution: { last24h: 0, last7d: 0, last30d: 0 },
      comparison: { recent: '最近7天', previous: '此前7天', method: '历史数据不足', status: 'insufficient_history' },
      hasNewData: false
    };
  }

  getLatestTrends() { return this.trendCache.get('latest') || this.getEmptyTrends(); }
  clearCache() { this.trendCache.clear(); this.newsSnapshot = []; }
}

module.exports = new TrendAnalyzer();
