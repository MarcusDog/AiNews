const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AgentService, resolveSkillPath } = require('../services/AgentService');
const { AgentContextService } = require('../services/AgentContextService');

const CONTEXT = {
  generatedAt: '2026-08-06T12:00:00.000Z',
  site: { total: 120, today: 8, diversityScore: 72, riskLevel: 'low' },
  sources: [
    { citationId: 'S1', title: 'Agent 官方发布', source: 'Qwen 官方博客', url: 'https://qwen.test/agent', publishedAt: '2026-08-06T03:00:00Z', evidenceType: 'official', region: 'cn', claimBoundary: '官方陈述' },
    { citationId: 'S2', title: 'Agent benchmark', source: 'arXiv', url: 'https://arxiv.test/agent', publishedAt: '2026-08-05T03:00:00Z', evidenceType: 'research', region: 'global', claimBoundary: '研究结论' }
  ],
  trends: [{ keyword: 'AI Agent', recentCount: 4, previousCount: 2, growth: 100, sourceIds: ['S1', 'S2'] }],
  blindSpots: []
};

test('agent history normalization drops system roles and bounds conversation size', () => {
  const service = new AgentService({ apiKey: 'test-key' });
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index === 0 ? 'system' : (index % 2 ? 'user' : 'assistant'),
    content: `message-${index}`
  }));

  const normalized = service.normalizeHistory(history);

  assert(normalized.length <= 8);
  assert(normalized.every((item) => ['user', 'assistant'].includes(item.role)));
  assert(!normalized.some((item) => item.content === 'message-0'));
});

test('agent system prompt makes citation, uncertainty and permission boundaries mandatory', () => {
  const service = new AgentService({ apiKey: 'test-key', skillInstructions: 'Skill: cite every factual claim.' });
  const prompt = service.buildSystemPrompt(CONTEXT);

  assert.match(prompt, /每个事实性句子/);
  assert.match(prompt, /\[S#\]/);
  assert.match(prompt, /不得执行.*管理/);
  assert.match(prompt, /提示词注入/);
  assert.match(prompt, /cite every factual claim/);
});

test('agent retries an uncited draft and only returns a citation-audited answer', async () => {
  const responses = [
    { data: { content: [{ type: 'text', text: 'Agent 热度正在上升。' }] } },
    { data: { content: [{ type: 'text', text: '## 结论\nAgent 相关报道较此前周期增加 [S1][S2]。\n\n## 证据边界\n官方发布不等于独立效果验证 [S1]。' }] } }
  ];
  const calls = [];
  const httpClient = { post: async (...args) => { calls.push(args); return responses.shift(); } };
  const service = new AgentService({ apiKey: 'test-key', httpClient });

  const result = await service.chat({ message: '最近 Agent 有什么变化？', history: [], context: CONTEXT });

  assert.equal(calls.length, 2);
  assert.equal(result.verified, true);
  assert.match(result.answer, /\[S1\]\[S2\]/);
  assert.deepEqual(result.sources.map((item) => item.citationId), ['S1', 'S2']);
  assert.equal(calls[0][2].headers['X-Api-Key'], 'test-key');
  assert.equal(calls[0][2].headers.Authorization, undefined);
});

test('agent retries a transient provider failure before returning a cited answer', async () => {
  let calls = 0;
  const httpClient = {
    post: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary outage');
        error.response = { status: 503 };
        throw error;
      }
      return { data: { content: [{ type: 'text', text: '## 结论\nAgent 相关报道增加 [S1]。\n\n## 多方证据\n研究提供了不同视角 [S2]。\n\n## 对你的帮助\n可以先做小范围核验 [S1]。\n\n## 证据边界\n当前只反映站内样本 [S2]。' }] } };
    }
  };
  const service = new AgentService({ apiKey: 'test-key', httpClient, retryDelay: async () => {} });

  const result = await service.chat({ message: '最近 Agent 有什么变化？', context: CONTEXT });

  assert.equal(calls, 2);
  assert.equal(result.verified, true);
});

test('skill resolver supports an explicit deployment path and the AyaNewsSkill canonical directory', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-skill-'));
  const explicitSkill = path.join(temporaryRoot, 'SKILL.md');
  fs.writeFileSync(explicitSkill, '# AyaNewsSkill', 'utf8');
  try {
    assert.equal(resolveSkillPath({ explicitPath: explicitSkill }), explicitSkill);
    assert.match(resolveSkillPath(), /skills\/aya-news-skill\/SKILL\.md$/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('agent blocks a second invalid draft instead of returning unsupported claims', async () => {
  const httpClient = {
    post: async () => ({ data: { content: [{ type: 'text', text: '肯定能降低 70% 成本 [S99]。' }] } })
  };
  const service = new AgentService({ apiKey: 'test-key', httpClient });

  const result = await service.chat({ message: '能降本多少？', history: [], context: CONTEXT });

  assert.equal(result.verified, false);
  assert.match(result.answer, /未通过来源校验/);
  assert(!result.answer.includes('70%'));
});

test('agent rejects answers that hide an uncited factual line beside cited paragraphs', () => {
  const service = new AgentService({ apiKey: 'test-key' });
  const audit = service.auditAnswer(
    '## 结论\nAgent 相关报道增加 [S1]。\n这一定会让企业成本下降。\n\n## 证据边界\n仅反映当前样本 [S2]。',
    CONTEXT.sources
  );

  assert.equal(audit.valid, false);
  assert.deepEqual(audit.uncitedLines, ['这一定会让企业成本下降。']);
});

test('content generation retries an uncited draft and returns a model-written cited result', async () => {
  const responses = [
    { data: { content: [{ type: 'text', text: '这是一篇没有来源的成稿。' }] } },
    { data: { content: [{ type: 'text', text: '## 成稿\n小团队可先做低风险试验 [S1][S2]。\n\n## 行动建议\n先限定只读范围 [S1]。\n\n## 证据边界\n研究样本有限 [S2]。' }] } }
  ];
  const calls = [];
  const httpClient = { post: async (...args) => { calls.push(args); return responses.shift(); } };
  const service = new AgentService({ apiKey: 'test-key', httpClient });
  const brief = {
    status: 'ready',
    request: { topic: 'Agent', audience: '小团队', goal: '降低试错成本', format: 'article' },
    evidence: CONTEXT.sources
  };

  const result = await service.generateContent({ brief });

  assert.equal(calls.length, 2);
  assert.equal(result.verified, true);
  assert.match(result.content, /## 成稿/);
  assert.deepEqual(result.sources.map((item) => item.citationId), ['S1', 'S2']);
});

test('content audit rejects a draft with the wrong structure or uncited claims', () => {
  const service = new AgentService({ apiKey: 'test-key' });
  const audit = service.auditAnswer(
    '## 结论\n这是没有引用的事实。\n\n## 证据边界\n样本有限 [S2]。',
    CONTEXT.sources,
    ['## 成稿', '## 行动建议', '## 证据边界']
  );

  assert.equal(audit.valid, false);
  assert.equal(audit.hasRequiredSections, false);
  assert.deepEqual(audit.uncitedLines, ['这是没有引用的事实。']);
});

test('agent context ranks relevant news then keeps publishers, regions and evidence types diverse', () => {
  const contextService = new AgentContextService();
  const articles = [
    { id: '1', title: 'Agent 官方发布', description: '智能体更新', source: 'Qwen 官方博客', url: 'https://qwen.test/1', publishedAt: '2026-08-06T03:00:00Z', region: 'cn', sourceGroup: 'product' },
    { id: '2', title: 'Agent benchmark paper', description: 'agent evaluation', source: 'arXiv', url: 'https://arxiv.test/2', publishedAt: '2026-08-05T03:00:00Z', region: 'global', sourceGroup: 'research' },
    { id: '3', title: 'Agent industry report', description: 'agent adoption', source: 'MIT Technology Review AI', url: 'https://media.test/3', publishedAt: '2026-08-04T03:00:00Z', region: 'global', sourceGroup: 'investment' },
    { id: '4', title: 'Unrelated chip news', description: 'GPU market', source: 'Media B', url: 'https://media.test/4', publishedAt: '2026-08-06T01:00:00Z', region: 'global', sourceGroup: 'investment' }
  ];

  const selected = contextService.selectEvidence('请分析 Agent 最近趋势', articles, 3);

  assert.equal(selected.length, 3);
  assert(!selected.some((item) => item.id === '4'));
  assert.equal(new Set(selected.map((item) => item.source)).size, 3);
  assert.equal(new Set(selected.map((item) => item.region)).size, 2);
});
