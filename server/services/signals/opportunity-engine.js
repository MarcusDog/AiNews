const OPPORTUNITY_FORMULA_VERSION = 'opportunity-v1';

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(value, max));
}

function sumMetric(signals, key) {
  return signals.reduce((sum, signal) => {
    const value = signal?.metrics?.[key];
    return sum + (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  }, 0);
}

function buildAngles(title, kinds) {
  const isDemo = kinds.some((kind) => ['repository', 'video', 'demo', 'space'].includes(kind));
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
    {
      audience: 'creator',
      title: isDemo ? `实测「${title}」：做一次可复现的演示与判断` : `拆解「${title}」：证据、争议与内容切口`,
      angle: isDemo
        ? '用原始链接完成安装或演示，记录成功条件、限制和真实体验。'
        : '从证据强弱、受众关联和反共识问题形成可验证的内容结构。'
    }
  ];
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
  const penalty = sourceCount <= 1 || platformCount <= 1 ? 0.85 : 1;
  const scoreBeforePenalty = trendContribution + utility + demo + novelty + discussion;
  const creatorScore = Math.round(clamp(scoreBeforePenalty * penalty));
  const riskNotes = [];
  if (sourceCount <= 1 && platformCount <= 1) riskNotes.push('当前只有单一来源和单一平台证据，发布前应补充独立来源。');
  else if (sourceCount <= 1) riskNotes.push('当前只有单一来源证据，发布前应完成交叉核查。');
  else if (platformCount <= 1) riskNotes.push('当前证据集中在单一平台，热度可能受平台偏差影响。');

  return {
    formulaVersion: OPPORTUNITY_FORMULA_VERSION,
    creatorScore,
    penalty,
    scoreBreakdown: {
      trendContribution: Number(trendContribution.toFixed(2)),
      utility,
      demo,
      novelty,
      discussion: Number(discussion.toFixed(2)),
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
    angles: buildAngles(String(topic.title || '未命名主题'), kinds),
    riskNotes
  };
}

module.exports = {
  OPPORTUNITY_FORMULA_VERSION,
  buildOpportunity
};
