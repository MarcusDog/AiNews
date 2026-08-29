const VERTICAL_VERSION = 'vertical-v1';

const CREATOR_VERTICALS = Object.freeze([
  {
    id: 'beauty',
    name: '美妆',
    enabled: true,
    version: VERTICAL_VERSION,
    keywords: ['护肤', '彩妆', '成分', '防晒', 'skincare', 'makeup', 'beauty'],
    negativeKeywords: ['游戏皮肤', '英雄皮肤', 'game skin'],
    contentTypes: ['video', 'short', 'image', 'article'],
    audienceIntents: ['产品实测', '成分科普', '妆容教程', '新品趋势']
  },
  {
    id: 'fashion',
    name: '穿搭',
    enabled: true,
    version: VERTICAL_VERSION,
    keywords: ['穿搭', '时装', '单品', '秀场', 'fashion', 'outfit', 'style'],
    negativeKeywords: ['程序风格', 'css style', 'coding style'],
    contentTypes: ['video', 'short', 'image', 'article'],
    audienceIntents: ['穿搭灵感', '单品解读', '趋势预测', '场景搭配']
  },
  {
    id: 'ai-tech',
    name: 'AI 科技',
    enabled: true,
    version: VERTICAL_VERSION,
    keywords: ['人工智能', '大模型', '智能体', '开源项目', 'artificial intelligence', 'llm', 'agent'],
    negativeKeywords: ['纯哲学讨论', '无 AI 实体', 'generic technology'],
    contentTypes: ['video', 'short', 'article', 'repository'],
    audienceIntents: ['工具实测', '新闻速解', '开源挖掘', '深度分析']
  },
  {
    id: 'entertainment',
    name: '娱乐',
    enabled: true,
    version: VERTICAL_VERSION,
    keywords: ['电影', '剧集', '综艺', '音乐', 'movie', 'television', 'celebrity'],
    negativeKeywords: ['企业软件发布', '纯代码更新', 'software release'],
    contentTypes: ['video', 'short', 'image', 'article'],
    audienceIntents: ['影视热议', '榜单盘点', '明星动态', '作品解读']
  }
]);

module.exports = {
  VERTICAL_VERSION,
  CREATOR_VERTICALS
};
