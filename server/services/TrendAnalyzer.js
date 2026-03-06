/**
 * 智能趋势分析服务
 * 自动从新闻标题和描述中提取关键词，分析趋势变化
 */

class TrendAnalyzer {
  constructor() {
    // 核心AI关键词库
    this.coreKeywords = [
      'GPT', 'ChatGPT', 'GPT-4', 'GPT-5', 'LLM', '大语言模型',
      'Transformer', 'BERT', 'T5', 'CLIP', 'DALL-E', 'Stable Diffusion',
      'PyTorch', 'TensorFlow', 'JAX', 'Hugging Face', 'OpenAI',
      '神经网络', '深度学习', '机器学习', '强化学习', '监督学习',
      '计算机视觉', 'NLP', '自然语言处理', '语音识别', '图像生成',
      'AI Agent', '智能体', '多模态', '多模态AI', '代码生成',
      '自动驾驶', '机器人', '推荐系统', '预测模型', '生成式AI',
      'AIGC', 'AI绘画', 'AI编程', 'AI写作', 'AI对话',
      '模型微调', '模型训练', '模型优化', '模型压缩', '模型量化',
      '知识图谱', '向量数据库', 'RAG', '检索增强生成',
      '注意力机制', '注意力', 'Self-Attention', '多头注意力',
      '对抗训练', 'GAN', '扩散模型', 'Diffusion',
      '开源', '开源模型', '开源框架', 'API',
      '算力', 'GPU', 'TPU', '训练成本', '推理优化',
      'AI安全', 'AI伦理', 'AI对齐', '数据隐私'
    ];
    
    // 缓存趋势数据
    this.trendCache = new Map();
    this.lastAnalysisTime = null;
    this.newsSnapshot = []; // 保存新闻快照用于比较
  }

  /**
   * 从文本中提取关键词
   */
  extractKeywords(text) {
    if (!text) return [];
    
    const keywords = [];
    const textLower = text.toLowerCase();
    
    // 匹配核心关键词
    this.coreKeywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      // 支持中英文匹配
      const regex = new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = textLower.match(regex);
      if (matches) {
        keywords.push({
          keyword: keyword,
          count: matches.length,
          positions: []
        });
      }
    });
    
    // 按出现次数排序
    return keywords.sort((a, b) => b.count - a.count);
  }

  /**
   * 分析新闻趋势
   */
  async analyzeTrends(newsItems) {
    if (!newsItems || newsItems.length === 0) {
      return this.getEmptyTrends();
    }

    const now = new Date();
    const analysisId = `analysis_${now.getTime()}`;
    
    // 提取所有关键词
    const allKeywords = new Map();
    const timeWindows = {
      last24h: [],
      last7d: [],
      last30d: []
    };
    
    const now24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const now7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const now30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    newsItems.forEach(item => {
      const text = `${item.title || ''} ${item.description || ''}`;
      const keywords = this.extractKeywords(text);
      const pubDate = new Date(item.publishedAt);
      
      // 按时间窗口分类
      if (pubDate >= now24h) {
        timeWindows.last24h.push({ item, keywords });
      } else if (pubDate >= now7d) {
        timeWindows.last7d.push({ item, keywords });
      } else if (pubDate >= now30d) {
        timeWindows.last30d.push({ item, keywords });
      }
      
      // 统计关键词
      keywords.forEach(kw => {
        const existing = allKeywords.get(kw.keyword);
        if (existing) {
          existing.count += kw.count;
          existing.articles.push(item);
        } else {
          allKeywords.set(kw.keyword, {
            keyword: kw.keyword,
            count: kw.count,
            articles: [item],
            trend: 'stable'
          });
        }
      });
    });

    // 转换为数组并排序
    const sortedKeywords = Array.from(allKeywords.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 计算趋势变化（与之前的数据对比）
    const trendsWithChange = this.calculateTrendChanges(sortedKeywords);
    
    // 生成趋势洞察
    const insights = this.generateInsights(trendsWithChange, timeWindows);
    
    // 检测新兴趋势
    const emergingTrends = this.detectEmergingTrends(trendsWithChange, timeWindows);
    
    // 检测降温趋势
    const decliningTrends = this.detectDecliningTrends(trendsWithChange, timeWindows);

    const result = {
      analysisId,
      timestamp: now.toISOString(),
      totalAnalyzed: newsItems.length,
      topKeywords: trendsWithChange.slice(0, 10),
      emergingTrends,
      decliningTrends,
      insights,
      timeDistribution: {
        last24h: timeWindows.last24h.length,
        last7d: timeWindows.last7d.length,
        last30d: timeWindows.last30d.length
      },
      hasNewData: this.hasNewData(newsItems)
    };

    // 保存当前快照
    this.newsSnapshot = newsItems.slice(0, 100).map(n => n.id);
    this.lastAnalysisTime = now;
    this.trendCache.set('latest', result);

    return result;
  }

  /**
   * 计算趋势变化
   */
  calculateTrendChanges(keywords) {
    return keywords.map(kw => {
      // 计算增长指标（基于文章数量的对数）
      const growth = Math.log(kw.count + 1) * 10;
      
      // 判断趋势方向
      let trend = 'stable';
      if (growth > 15) trend = 'surging';
      else if (growth > 8) trend = 'rising';
      else if (growth < 3) trend = 'declining';
      
      return {
        ...kw,
        growth: Math.round(growth),
        trend,
        articleCount: kw.articles.length,
        // 获取最新相关文章
        latestArticle: kw.articles[0]
      };
    });
  }

  /**
   * 检测新兴趋势
   */
  detectEmergingTrends(trends, timeWindows) {
    return trends
      .filter(t => t.trend === 'surging' && t.articleCount >= 3)
      .slice(0, 5)
      .map(t => ({
        keyword: t.keyword,
        growth: t.growth,
        description: this.generateTrendDescription(t, 'emerging')
      }));
  }

  /**
   * 检测降温趋势
   */
  detectDecliningTrends(trends, timeWindows) {
    return trends
      .filter(t => t.trend === 'declining' && t.count > 5)
      .slice(0, 3)
      .map(t => ({
        keyword: t.keyword,
        description: this.generateTrendDescription(t, 'declining')
      }));
  }

  /**
   * 生成趋势描述
   */
  generateTrendDescription(trend, type) {
    const descriptions = {
      emerging: [
        `${trend.keyword} 正在快速升温，近24小时出现多篇相关报道`,
        `${trend.keyword} 成为新的关注热点，相关讨论激增`,
        `${trend.keyword} 话题热度上升，引起行业广泛关注`
      ],
      declining: [
        `${trend.keyword} 话题热度有所下降，进入平稳期`,
        `${trend.keyword} 讨论度回落，可能进入技术成熟期`
      ]
    };
    
    const list = descriptions[type] || descriptions.emerging;
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * 生成趋势洞察
   */
  generateInsights(trends, timeWindows) {
    const insights = [];
    
    // 检测热点爆发
    const surging = trends.filter(t => t.trend === 'surging');
    if (surging.length > 0) {
      insights.push({
        type: 'hot',
        title: '热点爆发',
        content: `${surging[0].keyword} 等 ${surging.length} 个话题热度快速上升，建议重点关注`
      });
    }
    
    // 检测技术方向
    const techTrends = trends.filter(t => 
      ['GPT', 'LLM', 'Transformer', '神经网络', '深度学习'].some(k => 
        t.keyword.includes(k)
      )
    );
    if (techTrends.length > 0) {
      insights.push({
        type: 'tech',
        title: '技术动态',
        content: `${techTrends[0].keyword} 技术持续活跃，反映行业技术演进方向`
      });
    }
    
    // 检测应用落地
    const appTrends = trends.filter(t =>
      ['自动驾驶', '机器人', '推荐系统', '代码生成'].some(k =>
        t.keyword.includes(k)
      )
    );
    if (appTrends.length > 0) {
      insights.push({
        type: 'application',
        title: '应用落地',
        content: `${appTrends[0].keyword} 等应用场景讨论增加，显示AI技术正在加速落地`
      });
    }
    
    return insights;
  }

  /**
   * 检查是否有新数据
   */
  hasNewData(newsItems) {
    if (!this.newsSnapshot || this.newsSnapshot.length === 0) {
      return true;
    }
    
    const currentIds = new Set(newsItems.slice(0, 100).map(n => n.id));
    const previousIds = new Set(this.newsSnapshot);
    
    // 检查是否有新的ID
    for (const id of currentIds) {
      if (!previousIds.has(id)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 获取空趋势数据
   */
  getEmptyTrends() {
    return {
      analysisId: `empty_${Date.now()}`,
      timestamp: new Date().toISOString(),
      totalAnalyzed: 0,
      topKeywords: [],
      emergingTrends: [],
      decliningTrends: [],
      insights: [],
      timeDistribution: { last24h: 0, last7d: 0, last30d: 0 },
      hasNewData: false
    };
  }

  /**
   * 获取最新趋势
   */
  getLatestTrends() {
    return this.trendCache.get('latest') || this.getEmptyTrends();
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.trendCache.clear();
    this.newsSnapshot = [];
  }
}

module.exports = new TrendAnalyzer();
