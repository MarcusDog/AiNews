const { VERTICAL_VERSION, CREATOR_VERTICALS } = require('../../config/creatorVerticals');

const EXTRA_KEYWORDS = Object.freeze({
  beauty: ['皮肤', '敏感肌', 'serum', 'cosmetic'],
  fashion: ['红毯', '造型', '搭配', '服装', 'styling'],
  'ai-tech': ['openai', 'anthropic', '模型', 'ai ', ' ai', 'coding', 'copilot', 'gpt'],
  entertainment: ['演员', '明星', '主演', '票房', '恋情', '娱乐', '演唱会', 'drama']
});

const CONTEXT_NEGATIVES = Object.freeze({
  beauty: ['英雄皮肤', '游戏皮肤', '玩家', '手游', 'game skin'],
  fashion: ['程序风格', '代码风格', 'css style', 'coding style'],
  'ai-tech': ['智能冰箱', '智能家电', '纯哲学', 'generic technology'],
  entertainment: ['企业软件发布', '纯代码更新', 'software release']
});

function occurrences(text, phrases = []) {
  return [...new Set(phrases.map((item) => String(item).toLowerCase()).filter((item) => item && text.includes(item)))];
}

function classifyCreatorPost(post = {}, options = {}) {
  const verticals = options.verticals || CREATOR_VERTICALS;
  const creatorPriors = new Set(options.creatorVerticalIds || []);
  const text = `${post.title || ''} ${post.text || ''}`.normalize('NFKC').toLowerCase();
  const candidates = verticals.filter((vertical) => vertical.enabled !== false).map((vertical) => {
    const positives = occurrences(text, [...vertical.keywords, ...(EXTRA_KEYWORDS[vertical.id] || [])]);
    const negatives = occurrences(text, [...vertical.negativeKeywords, ...(CONTEXT_NEGATIVES[vertical.id] || [])]);
    const contradictory = negatives.length > 0;
    const seed = creatorPriors.has(vertical.id) && !contradictory && positives.length > 0 ? 0.15 : 0;
    const score = Math.max(0, Math.min(0.99, positives.length * 0.35 + seed - negatives.length * 0.8));
    return {
      verticalId: vertical.id,
      score: Math.round(score * 100) / 100,
      reasons: [
        ...positives.map((keyword) => `keyword:${keyword}`),
        ...(seed ? [`creator-seed:${vertical.id}`] : []),
        ...negatives.map((keyword) => `negative:${keyword}`)
      ],
      contradictory
    };
  }).sort((left, right) => right.score - left.score || left.verticalId.localeCompare(right.verticalId));
  const winner = candidates[0] || { verticalId: 'uncategorized', score: 0, reasons: [] };
  if (winner.score < 0.65) {
    const negativeReasons = candidates.flatMap((candidate) => candidate.reasons.filter((reason) => reason.startsWith('negative:')));
    return {
      verticalId: 'uncategorized',
      score: winner.score,
      version: VERTICAL_VERSION,
      reasons: [...new Set([...winner.reasons, ...negativeReasons])],
      reviewRequired: true,
      candidates
    };
  }
  return {
    verticalId: winner.verticalId,
    score: winner.score,
    version: VERTICAL_VERSION,
    reasons: winner.reasons,
    reviewRequired: winner.score < 0.8,
    candidates
  };
}

module.exports = {
  classifyCreatorPost,
  EXTRA_KEYWORDS,
  CONTEXT_NEGATIVES
};
