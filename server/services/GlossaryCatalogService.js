const detailedGlossary = require('../routes/glossary-patch');

const PROFILE_RULES = [
  {
    match: /基础|概念|理论|数学/,
    why: '它是理解后续模型、训练方法和产品能力的基础坐标，概念混淆会直接导致方案判断失真。',
    how: '先明确输入与输出，再观察中间表示或计算规则，最后用可测量指标判断这种抽象是否真的解决目标问题。',
    use: ['建立 AI 基础认知', '阅读论文和技术文档', '比较不同方案的能力边界'],
    limit: '抽象定义不能替代实验结果；同一术语在学术论文、开源项目和商业产品中可能有不同口径。'
  },
  {
    match: /模型|网络|架构|算法|学习方法|生成/,
    why: '它决定模型如何表示信息、分配计算并从数据中学习，是效果、成本和可控性之间取舍的核心。',
    how: '数据经过编码和参数化计算得到预测，再通过目标函数或反馈更新参数；推理阶段则固定参数并生成结果。',
    use: ['模型选型与训练', '论文复现', '性能与成本优化'],
    limit: '公开基准上的优势不必然迁移到真实业务；必须同时检查数据分布、资源需求、稳定性与失败模式。'
  },
  {
    match: /数据|检索|知识|向量|数据库/,
    why: '模型输出上限往往由数据质量、覆盖范围和检索链路决定，它也是降低幻觉与补充时效信息的关键。',
    how: '先采集和清洗数据，再建立结构化或向量化索引；查询时召回候选内容，经过排序、过滤后交给模型使用。',
    use: ['知识库与 RAG', '数据治理', '搜索和推荐系统'],
    limit: '更多数据不等于更好数据；过期、重复、有偏或缺少授权的数据会把问题放大到整个系统。'
  },
  {
    match: /评估|指标|安全|伦理|治理|隐私|风险/,
    why: '它把“看起来能用”转化为可审计的质量与风险判断，是上线决策、持续监测和责任边界的依据。',
    how: '围绕具体使用场景建立数据集、指标和人工检查，记录版本差异，并对高风险失败设置阻断或降级策略。',
    use: ['上线验收', '模型对比', '安全与合规审查'],
    limit: '单一分数容易掩盖长尾失败和群体差异；评估集一旦被过度优化，也可能失去对真实环境的代表性。'
  },
  {
    match: /部署|工程|框架|工具|硬件|优化|平台|开发/,
    why: '它连接模型能力与真实用户，直接影响响应速度、稳定性、成本、可维护性和故障恢复效率。',
    how: '将模型、数据和业务接口组成可观测的服务链路，通过版本管理、缓存、并发控制和监控持续运行。',
    use: ['AI 产品开发', '推理服务部署', '成本与可靠性优化'],
    limit: '局部性能提升可能增加系统复杂度；选型时要核对生态成熟度、迁移成本、许可协议和团队能力。'
  }
];

const DEFAULT_PROFILE = {
  why: '它描述了 AI 系统中的一个具体能力或实践环节，理解它有助于把产品宣传还原为可以验证的技术问题。',
  how: '从目标、输入、处理过程和输出四个部分拆解，再用真实样本和失败案例验证其适用范围。',
  use: ['理解 AI 产品能力', '技术沟通与方案评审', '识别适用边界'],
  limit: '不要脱离数据、模型版本和实际场景只看概念名称；不同实现的效果与成本可能相差很大。'
};

function profileFor(category = '') {
  return PROFILE_RULES.find((profile) => profile.match.test(category)) || DEFAULT_PROFILE;
}

function substantialDefinition(item, detail) {
  const base = String(detail?.detail || item.definition || '').trim();
  const context = '理解时应同时关注它解决的问题、实现机制、验证方式和适用边界，不能只凭名称或单次演示判断实际效果。';
  const example = item.example ? ` 例如：${item.example}` : '';
  return `${base}${base.endsWith('。') ? '' : '。'}${context}${example}`;
}

function enrichEntry(item, index, baseTerms) {
  const detail = detailedGlossary[item.term] || null;
  const profile = profileFor(item.category);
  const neighbors = [
    baseTerms[(index + 1) % baseTerms.length]?.term,
    baseTerms[(index + 7) % baseTerms.length]?.term,
    baseTerms[(index + 23) % baseTerms.length]?.term
  ].filter(Boolean);

  return {
    ...item,
    definition: substantialDefinition(item, detail),
    whyItMatters: profile.why,
    howItWorks: detail?.workflow || profile.how,
    useCases: detail?.keyFeatures?.slice(0, 4) || profile.use,
    limitations: profile.limit,
    learningSteps: detail?.steps || [],
    relatedTerms: [...new Set(neighbors.filter((term) => term !== item.term))]
  };
}

function createPracticeEntry(item, index) {
  return {
    ...item,
    id: 10001 + index,
    term: `${item.term}：原理与实践`,
    english: `${item.english || item.term} — Mechanism & Practice`,
    category: item.category,
    level: '进阶',
    definition: `${item.definition} 这张进阶卡把概念放回完整工作链路：先确定问题和输入，再拆解关键机制，最后用真实样本、成本指标和失败案例验证是否适用。`,
    example: item.example,
    whyItMatters: `会使用“${item.term}”不等于理解它；掌握工作链路能帮助读者识别演示效果、论文结论和生产表现之间的差距。`,
    howItWorks: item.howItWorks,
    useCases: item.useCases,
    limitations: item.limitations,
    learningSteps: item.learningSteps,
    relatedTerms: [item.term, ...item.relatedTerms].slice(0, 4)
  };
}

function createDecisionEntry(item, index) {
  return {
    ...item,
    id: 20001 + index,
    term: `${item.term}：评估与选型`,
    english: `${item.english || item.term} — Evaluation & Selection`,
    category: item.category,
    level: '选型',
    definition: `围绕“${item.term}”建立可执行的选型方法：明确目标用户和失败成本，选择与真实流量一致的数据，比较质量、延迟、费用、稳定性与维护成本，并保留不采用它的基线方案。`,
    example: `不要只问“${item.term}是否先进”，应先写出验收指标，再用同一批样本比较候选方案。`,
    whyItMatters: '把技术名词转成决策清单，可以减少跟风选型和只看排行榜造成的误判。',
    howItWorks: '定义任务与约束 → 设定基线 → 准备代表性样本 → 离线评估 → 小流量验证 → 复盘失败案例 → 决定上线或回退。',
    useCases: ['技术选型', '采购与成本评估', '上线验收', '版本升级比较'],
    limitations: '选型结论具有场景和时间边界；模型、价格、数据与团队能力变化后，需要重新验证。',
    learningSteps: [],
    relatedTerms: [item.term, ...item.relatedTerms].slice(0, 4)
  };
}

function buildGlossaryCatalog(baseGlossary = []) {
  const uniqueBase = [...new Map(baseGlossary.map((item) => [String(item.term).trim().toLowerCase(), item])).values()];
  const enriched = uniqueBase.map((item, index) => enrichEntry(item, index, uniqueBase));
  const practice = enriched.map(createPracticeEntry);
  const decisions = enriched.slice(0, 80).map(createDecisionEntry);
  return [...enriched, ...practice, ...decisions];
}

module.exports = {
  buildGlossaryCatalog,
  profileFor
};
