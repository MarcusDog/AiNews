const crypto = require('node:crypto');
const { normalizeCreatorProfile } = require('../signals/opportunity-engine');

const AUDIENCES = {
  beauty: '关注成分、效果与避坑的美妆消费者和内容创作者',
  fashion: '寻找可复用搭配灵感与趋势判断的穿搭受众',
  'ai-tech': '希望快速理解并实际验证 AI 产品的用户与科技创作者',
  entertainment: '关注作品、明星动态与大众讨论的娱乐内容受众'
};

const FORMATS = {
  'short-video': '60–90 秒竖屏短视频',
  'tool-review': '可复现实测与对比评测',
  'news-commentary': '事实与观点分栏的热点快评',
  'deep-dive': '带时间线、反例与限制的深度长文',
  general: '图文或视频通用选题稿'
};

function validSources(evidence = []) {
  return evidence.flatMap((item) => {
    try {
      const url = new URL(item.url);
      if (url.protocol !== 'https:') return [];
      return [{ postId: item.postId || null, creatorId: item.creatorId || null, title: item.title || null, url: url.toString() }];
    } catch {
      return [];
    }
  });
}

function genericSubject(title) {
  return /^(ai|人工智能).*(改变|取代|影响).*(人类|世界).*[吗？?]?$/i.test(String(title || '').trim());
}

function buildContentIdea(topic = {}, options = {}) {
  const profile = normalizeCreatorProfile(options.profile || 'general');
  if (!profile) throw new TypeError(`unsupported creator profile: ${options.profile}`);
  const sources = validSources(topic.evidence || topic.adoptionSequence?.map((item) => ({
    postId: item.postId, creatorId: item.creatorId, url: item.evidenceUrl
  })) || []);
  const subject = String(topic.title || '').trim();
  const supportedCreators = new Set(sources.map((source) => source.creatorId).filter(Boolean)).size;
  if (!subject || genericSubject(subject) || sources.length === 0) {
    return {
      status: 'rejected', reason: 'generic_or_unsupported_subject', profile,
      verticalId: topic.verticalId || null, subject: subject || null,
      whyNow: '没有可核验的近期创作者证据。', targetAudience: AUDIENCES[topic.verticalId] || '内容受众',
      format: FORMATS[profile], hook: '该问题目前缺少具体事件与原始来源。', outline: [], sources,
      uncertainty: '无法确认具体对象与发生时间，不能生成事实型选题。', disclosureRisks: ['不要把抽象问题包装成热点。']
    };
  }
  const isTrend = sources.length >= 2 && supportedCreators >= 2 && Number(topic.creatorCount || supportedCreators) >= 2;
  const status = isTrend ? 'ready' : 'insufficient_evidence';
  const whyNow = isTrend
    ? `${topic.creatorCount || supportedCreators} 位独立创作者在 ${topic.platformCount || 1} 个平台于近期发布可核验内容，最高热度 ${topic.maxHotness ?? '待计算'}。`
    : '当前只有单一来源或单一创作者证据，只能作为个案线索，不能证明趋势。';
  const hookPrefix = isTrend ? '为什么多位创作者突然同时关注' : '一位创作者刚刚提出';
  const outlineByProfile = {
    'short-video': ['3 秒展示具体对象与结果', '用两条原帖说明为什么现在', '给出结论、限制与行动建议'],
    'tool-review': ['入口与真实任务', '至少两位创作者结果对照', '适用人群、失败条件与成本'],
    'news-commentary': ['已确认发生了什么', '不同创作者如何判断', '我的观点、反例与不确定性'],
    'deep-dive': ['事件时间线与首发者', '多平台跟进与数据变化', '机制、反例、风险与后续观察'],
    general: ['具体事件与为什么现在', '证据一致点与冲突点', '面向受众的可执行结论']
  };
  return {
    id: `idea_${crypto.createHash('sha256').update(`${topic.id}|${profile}`).digest('hex').slice(0, 24)}`,
    topicId: topic.id,
    status,
    profile,
    verticalId: topic.verticalId,
    subject,
    whyNow,
    targetAudience: AUDIENCES[topic.verticalId] || '希望获取可靠热点与创作灵感的内容受众',
    format: FORMATS[profile],
    hook: `${hookPrefix}「${subject}」？先看原帖证据，再判断它是否值得跟进。`,
    outline: outlineByProfile[profile],
    sources,
    uncertainty: isTrend
      ? '热度与采用只代表已监测观察名单；未覆盖平台、删除内容和不可见互动仍可能改变判断。'
      : '单一来源不能证明趋势；补充第二位独立创作者或另一平台证据后再发布趋势结论。',
    disclosureRisks: [
      '商业合作、广告或转载关系必须披露。',
      '指标为抓取时快照，发布前应重新打开原帖核对。'
    ],
    score: Number(topic.maxHotness) || null,
    formulaVersion: 'creator-idea-v1'
  };
}

module.exports = { buildContentIdea, AUDIENCES, FORMATS };
