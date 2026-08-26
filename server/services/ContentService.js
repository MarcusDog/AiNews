const { classifyEvidenceType } = require('../utils/analytics');

const EVIDENCE_PRIORITY = { official: 0, research: 1, media: 2, engineering: 3 };
const FORMAT_SECTIONS = {
  'short-video': ['痛点开场', '发生了什么', '证据与边界', '可执行建议'],
  article: ['读者问题', '核心结论', '多方证据', '反方与限制', '行动清单'],
  newsletter: ['本期判断', '三条信号', '不同视角', '本周行动'],
  xiaohongshu: ['问题钩子', '关键发现', '避坑提醒', '步骤清单']
};

class ContentService {
  matchesTopic(article, topic) {
    if (!topic) return true;
    const normalizedTopic = String(topic).toLowerCase().trim();
    const terms = normalizedTopic.split(/[\s,，、]+/).filter(Boolean);
    const text = `${article.title || ''} ${article.description || ''} ${article.category || ''}`.toLowerCase();
    if (text.includes(normalizedTopic)) return true;
    const broadTerms = new Set(['ai', '人工智能', 'artificial', 'intelligence']);
    const focusedTerms = terms.length > 1 ? terms.filter((term) => !broadTerms.has(term)) : terms;
    const requiredTerms = focusedTerms.length ? focusedTerms : terms;
    return requiredTerms.every((term) => text.includes(term));
  }

  selectDiverseEvidence(articles, { topic = '', limit = 6 } = {}) {
    const candidates = articles
      .filter((article) => article.url && this.matchesTopic(article, topic))
      .map((article) => ({ ...article, evidenceType: classifyEvidenceType(article) }))
      .sort((a, b) => EVIDENCE_PRIORITY[a.evidenceType] - EVIDENCE_PRIORITY[b.evidenceType] || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    const selected = [];
    const usedIds = new Set();
    const types = ['official', 'research', 'media', 'engineering'];

    types.forEach((type) => {
      const candidate = candidates.find((item) => item.evidenceType === type && !usedIds.has(item.id || item.url));
      if (candidate && selected.length < limit) {
        selected.push(candidate);
        usedIds.add(candidate.id || candidate.url);
      }
    });
    candidates.forEach((candidate) => {
      if (selected.length >= limit) return;
      const id = candidate.id || candidate.url;
      if (!usedIds.has(id) && selected.filter((item) => item.source === candidate.source).length < 2) {
        selected.push(candidate);
        usedIds.add(id);
      }
    });
    return selected.slice(0, limit);
  }

  evidenceBoundary(type) {
    return {
      official: '官方一手信息；产品效果仍需独立验证',
      research: '研究或论文；结论受样本、方法与复现条件限制',
      media: '媒体报道；关键数字应回查一手材料',
      engineering: '工程或社区实践；个案经验不等于普遍结论'
    }[type];
  }

  buildBriefFromArticles(articles, options = {}) {
    const topic = String(options.topic || '').trim();
    const audience = String(options.audience || '希望解决实际问题的读者').trim();
    const goal = String(options.goal || '理解影响并采取行动').trim();
    const format = FORMAT_SECTIONS[options.format] ? options.format : 'article';
    const limit = Math.min(Math.max(Number.parseInt(options.limit, 10) || 6, 3), 8);
    const selected = this.selectDiverseEvidence(articles, { topic, limit });
    const evidence = selected.map((article, index) => ({
      citationId: `S${index + 1}`,
      id: article.id,
      title: article.title,
      summary: article.description || '',
      source: article.source || '未知来源',
      url: article.url,
      publishedAt: article.publishedAt || null,
      category: article.category || null,
      region: article.region === 'cn' ? 'cn' : 'global',
      evidenceType: article.evidenceType,
      claimBoundary: this.evidenceBoundary(article.evidenceType)
    }));
    const outputGuide = {
      format,
      sections: FORMAT_SECTIONS[format].map((title) => ({ title, citationRequired: true })),
      rule: '每个事实性判断后标注 [S#]；无法由来源支持的内容必须写成推测或删除。'
    };
    const citations = evidence.map((item) => `[${item.citationId}] ${item.title}｜${item.source}｜${item.url}`).join('\n');
    const prompt = [
      `请面向“${audience}”，围绕“${topic || '当前 AI 动态'}”解决“${goal}”这一问题，输出${format}。`,
      '只使用下列证据；每个事实、数字和归因后都标注对应 [S#]。',
      '区分官方陈述、论文结论、媒体转述与作者推断；不得把媒体转述写成已证实事实。',
      '主动呈现国内外、官方/研究/媒体等不同视角；若证据冲突，说明冲突与不确定性。',
      '结尾给出低成本、可验证、对读者有帮助的行动建议。',
      citations || '[无可用来源：停止生成事实性回答]'
    ].join('\n\n');
    const regions = new Set(evidence.map((item) => item.region));
    const types = new Set(evidence.map((item) => item.evidenceType));
    const sources = new Set(evidence.map((item) => item.source));

    return {
      status: evidence.length >= 2 ? 'ready' : 'insufficient_evidence',
      generatedAt: new Date().toISOString(),
      request: { topic, audience, goal, format },
      angle: evidence.length ? `从${audience}的实际问题出发，用多源证据解释“${topic || 'AI 动态'}”并给出可验证行动` : null,
      evidence,
      diversity: { sources: sources.size, regions: regions.size, evidenceTypes: types.size },
      outputGuide,
      prompt,
      citationPolicy: '逐条引用；优先一手资料；至少两类证据；来源不足时不生成确定性结论。',
      notice: evidence.length >= 2 ? '证据包已就绪；发布前仍应打开原文核对关键数字与上下文。' : '没有足够来源支持可靠回答，请扩大时间范围或更换关键词。'
    };
  }
}

module.exports = new ContentService();
