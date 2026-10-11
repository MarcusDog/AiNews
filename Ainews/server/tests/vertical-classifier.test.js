const test = require('node:test');
const assert = require('node:assert/strict');
const { CREATOR_VERTICALS } = require('../config/creatorVerticals');
const { classifyCreatorPost } = require('../services/creators/vertical-classifier');

function classify(title, options = {}) {
  return classifyCreatorPost({ title, text: options.text || '', language: options.language || 'zh-CN' }, {
    verticals: CREATOR_VERTICALS,
    creatorVerticalIds: options.creatorVerticalIds || []
  });
}

test('game skin context does not become beauty despite the ambiguous word 皮肤', () => {
  const result = classify('新英雄皮肤上线，游戏玩家实测', { creatorVerticalIds: ['beauty'] });
  assert.notEqual(result.verticalId, 'beauty');
  assert(result.reasons.some((reason) => reason.startsWith('negative:')));
});

test('skincare and multilingual makeup evidence classify as beauty', () => {
  assert.equal(classify('敏感皮肤防晒成分实测').verticalId, 'beauty');
  assert.equal(classify('New skincare serum and makeup routine').verticalId, 'beauty');
});

test('celebrity styling is fashion while unrelated celebrity gossip is entertainment', () => {
  assert.equal(classify('明星红毯穿搭与造型解析').verticalId, 'fashion');
  assert.equal(classify('演员恋情曝光引发热议', { creatorVerticalIds: ['fashion'] }).verticalId, 'entertainment');
});

test('AI product evidence beats generic technology language', () => {
  assert.equal(classify('OpenAI launches a new coding agent tool').verticalId, 'ai-tech');
  assert.equal(classify('新款智能冰箱技术升级').verticalId, 'uncategorized');
});

test('creator seed is only a prior and cannot override contradictory post evidence', () => {
  const result = classify('电影票房榜单与主演表现盘点', { creatorVerticalIds: ['ai-tech'] });
  assert.equal(result.verticalId, 'entertainment');
  assert(!result.reasons.includes('creator-seed:ai-tech'));
  assert.equal(result.version, 'vertical-v1');
  assert.equal(typeof result.score, 'number');
});
