const crypto = require('node:crypto');

function safeError(error) {
  return String(error?.message || error || 'unknown_error').slice(0, 500);
}

function countStatuses(items) {
  return (Array.isArray(items) ? items : []).reduce((counts, item) => {
    const key = String(item?.status || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

class DailyRefreshService {
  constructor(options = {}) {
    if (!options.newsService || !options.signalService || !options.creatorService) {
      throw new TypeError('newsService, signalService and creatorService are required');
    }
    this.newsService = options.newsService;
    this.signalService = options.signalService;
    this.creatorService = options.creatorService;
    this.creatorStore = options.creatorStore || null;
    this.now = options.now || (() => new Date().toISOString());
    this.running = false;
    this.lastRun = null;
  }

  async stage(name, operation, summarize = (value) => value) {
    const startedAt = this.now();
    try {
      const value = await operation();
      return { status: 'success', startedAt, finishedAt: this.now(), ...summarize(value) };
    } catch (error) {
      return { status: 'failure', startedAt, finishedAt: this.now(), error: safeError(error) };
    }
  }

  creatorTopicCount() {
    try {
      return Number(this.creatorStore?.db?.prepare(
        'SELECT COUNT(*) AS count FROM creator_topics'
      ).get()?.count || 0);
    } catch {
      return 0;
    }
  }

  readiness() {
    let signalOpportunities = 0;
    try {
      signalOpportunities = this.signalService.listCreatorOpportunities({
        windowHours: 72, limit: 100, offset: 0, profile: 'tool-review'
      }).length;
    } catch {
      signalOpportunities = 0;
    }
    const creatorTopics = this.creatorTopicCount();
    return {
      status: signalOpportunities > 0 || creatorTopics > 0 ? 'ready' : 'empty',
      signalOpportunities,
      creatorTopics
    };
  }

  async run(options = {}) {
    if (this.running) return { status: 'skipped', reason: 'refresh_in_progress' };
    this.running = true;
    const report = {
      runId: crypto.randomUUID(),
      reason: String(options.reason || 'scheduled').slice(0, 80),
      startedAt: this.now(),
      stages: {}
    };
    try {
      report.stages.news = await this.stage('news',
        () => this.newsService.updateAllNews(),
        (value = {}) => ({
          totalSaved: Number(value.totalSaved || 0),
          successfulSources: (value.rss || []).length + (value.api || []).length,
          errorCount: (value.errors || []).length,
          skipped: Boolean(value.skipped),
          ...(value.reason ? { reason: String(value.reason).slice(0, 160) } : {})
        }));
      if (report.stages.news.errorCount > 0) report.stages.news.status = 'degraded';

      report.stages.signals = await this.stage('signals',
        () => this.signalService.refreshAll({
          refreshLegacy: false,
          sourceLimit: options.signalSourceLimit,
          windowHours: Number(options.windowHours || 72)
        }),
        (value = {}) => ({
          collectionStatus: value.collection?.status || 'unknown',
          received: Number(value.collection?.received || 0),
          saved: Number(value.collection?.saved || 0),
          errorCount: (value.collection?.errors || []).length,
          topicCount: Number(value.rebuild?.topicCount || 0)
        }));
      if (report.stages.signals.errorCount > 0 || report.stages.signals.collectionStatus !== 'success') {
        report.stages.signals.status = 'degraded';
      }

      report.stages.creators = options.includeCreators === false
        ? { status: 'skipped', reason: 'not_requested' }
        : await this.stage('creators',
          () => this.creatorService.tick(),
          (value = {}) => ({
            collectionStatus: value.status || 'unknown',
            incrementalAccounts: Array.isArray(value.incremental) ? value.incremental.length : 0,
            incrementalStatusCounts: countStatuses(value.incremental),
            backfillAccounts: Array.isArray(value.backfill) ? value.backfill.length : 0,
            backfillStatusCounts: countStatuses(value.backfill),
            scoredPosts: Number(value.intelligence?.scoredPosts || 0),
            topicCount: Number(value.intelligence?.topics || 0),
            remainingBudget: Number(value.remainingBudget || 0)
          }));

      report.readiness = this.readiness();
      report.finishedAt = this.now();
      const unhealthy = Object.values(report.stages).some((stage) => ['failure', 'degraded'].includes(stage.status));
      report.status = unhealthy || report.readiness.status !== 'ready' ? 'degraded' : 'success';
      this.lastRun = report;
      return report;
    } finally {
      this.running = false;
    }
  }

  getLastRun() {
    return this.lastRun;
  }
}

module.exports = DailyRefreshService;
