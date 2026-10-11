const DatabaseService = require('./DatabaseService');
const { agentService } = require('./AgentService');
const { agentContextService } = require('./AgentContextService');

class DiversityAuditService {
  constructor(options = {}) {
    this.databaseService = options.databaseService || DatabaseService;
    this.agentService = options.agentService || agentService;
    this.contextService = options.contextService || agentContextService;
    this.now = options.now || (() => new Date());
    this.timeZone = options.timeZone || 'Asia/Shanghai';
  }

  dateKey(date = this.now()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  buildMetrics(context) {
    const externalSources = (context.sources || []).filter((source) => source.region !== 'site');
    return {
      publishers: new Set(externalSources.map((source) => source.source).filter(Boolean)).size,
      regions: new Set(externalSources.map((source) => source.region).filter(Boolean)).size,
      evidenceTypes: new Set(externalSources.map((source) => source.evidenceType).filter(Boolean)).size,
      selectedSources: externalSources.length,
      blindSpots: context.blindSpots || []
    };
  }

  fallbackAudit(context, status) {
    const citationId = context.site?.diversityCitationId
      || context.sources?.find((source) => source.region === 'site')?.citationId;
    const citation = citationId ? ` [${citationId}]` : '';
    const summary = status === 'needs_key'
      ? `模型密钥尚未在服务器配置，当前保留站内多样性评分，等待每日模型复核。${citation}`
      : `本次模型输出未通过引用审查，因此没有展示未经核验的结论；系统将在下一次计划任务重试。${citation}`;
    return {
      status,
      score: Number(context.site?.diversityScore) || 0,
      riskLevel: context.site?.riskLevel || 'unknown',
      model: status === 'needs_key' ? null : this.agentService.getStatus().model,
      summary,
      sources: citationId ? (context.sources || []).filter((source) => source.citationId === citationId) : []
    };
  }

  async runDailyAudit() {
    await this.databaseService.initialize();
    // 每日总览不能按某个查询词筛窄样本；空查询会从最新资讯中直接做多来源抽样。
    const context = await this.contextService.build('');
    const status = this.agentService.getStatus();
    let audit;

    if (!status.enabled) {
      audit = this.fallbackAudit(context, 'needs_key');
    } else {
      const generated = await this.agentService.generateDiversityReview({ context });
      audit = generated.verified
        ? {
          status: 'verified',
          score: Number(context.site?.diversityScore) || 0,
          riskLevel: context.site?.riskLevel || 'unknown',
          model: generated.model || status.model,
          summary: generated.content,
          sources: generated.sources || []
        }
        : this.fallbackAudit(context, 'audit_failed');
    }

    const record = {
      auditDate: this.dateKey(),
      ...audit,
      metrics: this.buildMetrics(context)
    };
    await this.databaseService.saveDiversityAudit(record);
    return this.databaseService.getLatestDiversityAudit();
  }

  async ensureTodayAudit() {
    await this.databaseService.initialize();
    const latest = await this.databaseService.getLatestDiversityAudit();
    const modelNowEnabled = this.agentService.getStatus().enabled;
    if (latest?.auditDate === this.dateKey() && !(latest.status === 'needs_key' && modelNowEnabled)) return latest;
    return this.runDailyAudit();
  }

  async getLatestAudit() {
    await this.databaseService.initialize();
    return this.databaseService.getLatestDiversityAudit();
  }
}

module.exports = {
  DiversityAuditService,
  diversityAuditService: new DiversityAuditService()
};
