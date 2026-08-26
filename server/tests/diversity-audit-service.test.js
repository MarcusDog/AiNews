const test = require('node:test');
const assert = require('node:assert/strict');

const { DiversityAuditService } = require('../services/DiversityAuditService');

const CONTEXT = {
  generatedAt: '2026-08-08T00:00:00.000Z',
  site: { diversityScore: 76, riskLevel: 'low', diversityCitationId: 'S3' },
  blindSpots: [{ code: 'missing_counterpoint', message: '缺少反方视角' }],
  sources: [
    { citationId: 'S1', title: '国内官方发布', source: '官方 A', url: 'https://a.test', region: 'cn', evidenceType: 'official' },
    { citationId: 'S2', title: '海外研究', source: '研究 B', url: 'https://b.test', region: 'global', evidenceType: 'research' },
    { citationId: 'S3', title: '站内信息茧房分析', source: 'AI News', url: '/api/analytics/diversity', region: 'site', evidenceType: 'internal-analysis' }
  ]
};

test('daily diversity audit asks the model for a cited review and persists it', async () => {
  let saved;
  const service = new DiversityAuditService({
    contextService: { build: async () => CONTEXT },
    agentService: {
      getStatus: () => ({ enabled: true, model: 'MiniMax-M2.5' }),
      generateDiversityReview: async () => ({
        verified: true,
        content: '## 今日判断\n来源覆盖较均衡 [S1][S2]。\n\n## 缺口\n仍缺少反方视角 [S3]。\n\n## 明日补充\n增加独立评测 [S2]。\n\n## 证据边界\n仅代表站内样本 [S3]。',
        sources: CONTEXT.sources,
        model: 'MiniMax-M2.5'
      })
    },
    databaseService: {
      initialize: async () => {},
      saveDiversityAudit: async (audit) => { saved = audit; },
      getLatestDiversityAudit: async () => saved || null
    },
    now: () => new Date('2026-08-08T03:00:00.000Z')
  });

  const result = await service.runDailyAudit();

  assert.equal(result.status, 'verified');
  assert.equal(saved.auditDate, '2026-08-08');
  assert.equal(saved.model, 'MiniMax-M2.5');
  assert.equal(saved.sources.length, 3);
});

test('daily diversity audit exposes a safe pending snapshot when the model key is absent', async () => {
  let saved;
  const service = new DiversityAuditService({
    contextService: { build: async () => CONTEXT },
    agentService: { getStatus: () => ({ enabled: false, model: 'MiniMax-M2.5' }) },
    databaseService: {
      initialize: async () => {},
      saveDiversityAudit: async (audit) => { saved = audit; },
      getLatestDiversityAudit: async () => saved || null
    },
    now: () => new Date('2026-08-08T03:00:00.000Z')
  });

  const result = await service.runDailyAudit();

  assert.equal(result.status, 'needs_key');
  assert.equal(result.score, 76);
  assert.match(result.summary, /等待每日模型复核/);
});
