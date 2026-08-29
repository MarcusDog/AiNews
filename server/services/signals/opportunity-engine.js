const OPPORTUNITY_FORMULA_VERSION = 'opportunity-v2';
const CREATOR_PROFILES = new Set(['general', 'short-video', 'tool-review', 'news-commentary', 'deep-dive']);

function normalizeCreatorProfile(value) {
  const profile = String(value || 'general').trim().toLowerCase();
  return CREATOR_PROFILES.has(profile) ? profile : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(value, max));
}

function sumMetric(signals, key) {
  return signals.reduce((sum, signal) => {
    const value = signal?.metrics?.[key];
    return sum + (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  }, 0);
}

function creatorAngle(title, kinds, profile) {
  const isDemo = kinds.some((kind) => ['repository', 'video', 'demo', 'space'].includes(kind));
  if (profile === 'short-video') return {
    audience: 'creator', title: `AI 短视频｜今天讲「${title}」`,
    angle: isDemo ? '用一个可见的操作结果开场，再说明适用人群、失败条件和原始来源。' : '用“发生了什么—为什么突然被讨论—普通用户要不要在意”完成 60–90 秒口播。'
  };
  if (profile === 'tool-review') return {
    audience: 'creator', title: `AI 工具实测｜「${title}」值不值得用`,
    angle: '从安装或入口、一个真实任务、结果对比和限制四步完成可复现实测。'
  };
  if (profile === 'news-commentary') return {
    audience: 'creator', title: `AI 热点快评｜「${title}」真正影响谁`,
    angle: '把官方事实、社区反馈和个人判断分开，给出明确但可核查的结论。'
  };
  if (profile === 'deep-dive') return {
    audience: 'creator', title: `AI 深度拆解｜「${title}」背后的变化`,
    angle: '补齐时间线、技术或商业背景、多方证据与反例，形成一篇可继续研究的结构。'
  };
  return {
    audience: 'creator', title: `今天可做｜「${title}」的内容机会`,
    angle: isDemo
      ? '用原始链接完成安装或演示，记录成功条件、限制和真实体验。'
      : '从事实、新增讨论、受众影响和待核查问题形成可发布的内容结构。'
  };
}

function buildAngles(title, kinds, profile) {
  return [
    {
      audience: 'beginner',
      title: `「${title}」是什么？给 AI 新手的事实梳理`,
      angle: '从它解决什么问题、证据来自哪里，以及当前仍不确定什么开始。'
    },
    {
      audience: 'general',
      title: `围绕「${title}」：发生了什么，为什么现在值得关注`,
      angle: '按时间线对照多个来源，区分已确认事实、社区反馈与推断。'
    },
    creatorAngle(title, kinds, profile)
  ];
}

function profileContribution(profile, { kinds, sourceCount, platformCount }) {
  const has = (...values) => kinds.some((kind) => values.includes(kind));
  if (profile === 'short-video') return has('video') ? 14 : has('social_post', 'discussion', 'shared_link') ? 10 : 0;
  if (profile === 'tool-review') return has('repository', 'model', 'product', 'tool', 'demo', 'space') ? 13 : -8;
  if (profile === 'news-commentary') return has('news', 'shared_link', 'social_post', 'discussion') ? 10 : 2;
  if (profile === 'deep-dive') return (sourceCount >= 2 ? 5 : 0) + (platformCount >= 2 ? 4 : 0) + (has('paper', 'research') ? 5 : 0);
  return 0;
}

function buildOpportunity(topic = {}, options = {}) {
  const signals = Array.isArray(topic.signals) ? topic.signals : [];
  const now = new Date(options.now || new Date());
  const firstSeen = new Date(topic.firstSeenAt || now);
  const ageHours = Math.max(0, (now.getTime() - firstSeen.getTime()) / 3600000);
  const kinds = [...new Set(signals.map((signal) => String(signal.kind || '').toLowerCase()).filter(Boolean))];
  const text = [topic.title, topic.summary, ...signals.flatMap((signal) => [
    signal.title,
    signal.summary,
    ...(signal.tags || [])
  ])].filter(Boolean).join(' ').toLowerCase();

  const utilityKind = kinds.some((kind) => ['tool', 'repository', 'model', 'product'].includes(kind));
  const hasUseCue = /(安装|部署|教程|指南|用例|案例|实测|how\s*to|tutorial|guide|setup|install|use[ -]?case)/i.test(text);
  const utility = utilityKind ? Math.min(15, 12 + (hasUseCue ? 3 : 0)) : 0;
  const demo = kinds.some((kind) => ['repository', 'video', 'demo', 'space'].includes(kind))
    ? 10
    : kinds.some((kind) => ['product', 'model'].includes(kind)) ? 6 : 2;
  const novelty = ageHours <= 24 ? 10 : ageHours <= 48 ? 6 : 2;
  const discussionRaw = sumMetric(signals, 'comments') + sumMetric(signals, 'replies') + sumMetric(signals, 'shares');
  const discussion = Math.min(10, 2 * Math.log10(1 + discussionRaw));
  const trendScore = clamp(Number(topic.trendScore) || 0);
  const trendContribution = 0.55 * trendScore;
  const sourceCount = new Set(signals.map((signal) => signal.sourceId).filter(Boolean)).size;
  const platformCount = new Set(signals.map((signal) => signal.platform).filter(Boolean)).size;
  const profile = normalizeCreatorProfile(options.profile) || 'general';
  const profileBonus = profileContribution(profile, { kinds, sourceCount, platformCount });
  const penalty = sourceCount <= 1 || platformCount <= 1 ? 0.85 : 1;
  const scoreBeforePenalty = trendContribution + utility + demo + novelty + discussion + profileBonus;
  const creatorScore = Math.round(clamp(scoreBeforePenalty * penalty));
  const riskNotes = [];
  if (sourceCount <= 1 && platformCount <= 1) riskNotes.push('当前只有单一来源和单一平台证据，发布前应补充独立来源。');
  else if (sourceCount <= 1) riskNotes.push('当前只有单一来源证据，发布前应完成交叉核查。');
  else if (platformCount <= 1) riskNotes.push('当前证据集中在单一平台，热度可能受平台偏差影响。');

  return {
    formulaVersion: OPPORTUNITY_FORMULA_VERSION,
    profile,
    creatorScore,
    penalty,
    scoreBreakdown: {
      trendContribution: Number(trendContribution.toFixed(2)),
      utility,
      demo,
      novelty,
      discussion: Number(discussion.toFixed(2)),
      profileContribution: profileBonus,
      scoreBeforePenalty: Number(scoreBeforePenalty.toFixed(2))
    },
    rawInputs: {
      trendScore,
      ageHours: Number(ageHours.toFixed(2)),
      kinds,
      hasUseCue,
      discussion: discussionRaw,
      sourceCount,
      platformCount
    },
    angles: buildAngles(String(topic.title || '未命名主题'), kinds, profile),
    riskNotes
  };
}

function isCreatorOpportunity(topic = {}, options = {}) {
  const profile = normalizeCreatorProfile(options.profile) || 'general';
  const signals = Array.isArray(topic.signals) ? topic.signals : [];
  const kinds = [...new Set(signals.map((signal) => String(signal.kind || '').toLowerCase()).filter(Boolean))];
  const text = [topic.title, topic.summary, ...signals.flatMap((signal) => [signal.title, signal.summary, ...(signal.tags || [])])]
    .filter(Boolean).join(' ');
  const nativeAiArtifact = kinds.some((kind) => ['repository', 'model', 'product', 'tool', 'demo', 'space', 'video'].includes(kind));
  const explicitAi = /(^|[^a-z])ai([^a-z]|$)|\b(llm|openai|chatgpt|claude|anthropic|gemini|deepseek|qwen|glm|hugging\s*face|agentic?)\b|人工智能|大模型|智能体|生成式|通义|智谱|豆包|可灵|即梦/i.test(text);
  if (!nativeAiArtifact && !explicitAi) return false;
  const onlyAcademic = kinds.length > 0 && kinds.every((kind) => ['paper', 'research'].includes(kind));
  if (onlyAcademic && profile !== 'deep-dive') return false;
  const opportunity = topic.opportunity?.profile === profile
    ? topic.opportunity
    : buildOpportunity(topic, options);
  const minimum = profile === 'short-video' ? 42 : profile === 'deep-dive' ? 44 : 45;
  return opportunity.creatorScore >= minimum;
}

module.exports = {
  CREATOR_PROFILES,
  OPPORTUNITY_FORMULA_VERSION,
  buildOpportunity,
  isCreatorOpportunity,
  normalizeCreatorProfile
};
