const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const NewsService = require('../services/NewsService');
const ContentService = require('../services/ContentService');
const TrendAnalyzer = require('../services/TrendAnalyzer');
const { agentService } = require('../services/AgentService');
const { parseBoundedInteger } = require('../utils/analytics');
const { buildSourceHealthSnapshot } = require('../utils/source-health');

const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '内容生成请求较多，请稍后再试' }
});

router.get('/capabilities', (req, res) => {
  res.json({
    success: true,
    data: {
      apiVersion: '1.0',
      purpose: '以跨来源证据帮助内容生产与实际问题解决',
      citationPolicy: '所有事实性输出都必须保留原文 URL；来源不足时返回 insufficient_evidence。',
      tools: [
        { name: 'list_latest_news', method: 'GET', path: '/api/content/v1/latest' },
        { name: 'search_news', method: 'GET', path: '/api/content/v1/search?q=' },
        { name: 'get_trending_topics', method: 'GET', path: '/api/content/v1/trends' },
        { name: 'build_content_brief', method: 'GET', path: '/api/content/v1/brief?topic=&audience=&goal=&format=' },
        { name: 'generate_cited_content', method: 'POST', path: '/api/content/v1/generate' },
        { name: 'list_sources', method: 'GET', path: '/api/content/v1/sources' },
        { name: 'get_source_health', method: 'GET', path: '/api/content/v1/source-health' },
        { name: 'list_hot_topics', method: 'GET', path: '/api/signals/v1/topics?window=72h' },
        { name: 'get_topic_evidence', method: 'GET', path: '/api/signals/v1/topics/{id}' },
        { name: 'list_creator_opportunities', method: 'GET', path: '/api/signals/v1/opportunities?window=48h' },
        { name: 'random_creator_opportunity', method: 'GET', path: '/api/signals/v1/opportunities/random?window=72h' },
        { name: 'list_signal_sources', method: 'GET', path: '/api/signals/v1/sources' },
        { name: 'get_topic_changes', method: 'GET', path: '/api/signals/v1/changes?since=0' }
      ]
    }
  });
});

router.get('/latest', async (req, res, next) => {
  try {
    const limit = parseBoundedInteger(req.query.limit, { fallback: 20, min: 1, max: 50 });
    const result = await NewsService.getLatestNews({ page: 1, limit, category: req.query.category });
    res.json({ success: true, data: result.data, meta: { total: result.total, returned: result.data.length, citationField: 'url' } });
  } catch (error) { next(error); }
});

router.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ success: false, error: 'q 不能为空' });
    const limit = parseBoundedInteger(req.query.limit, { fallback: 20, min: 1, max: 50 });
    const result = await NewsService.getLatestNews({ page: 1, limit, search: query, category: req.query.category });
    res.json({ success: true, data: result.data, meta: { query, total: result.total, citationField: 'url' } });
  } catch (error) { next(error); }
});

router.get('/trends', async (req, res, next) => {
  try {
    const news = await NewsService.getAnalysisNews(500);
    const trends = await TrendAnalyzer.analyzeTrends(news.data);
    res.json({ success: true, data: trends });
  } catch (error) { next(error); }
});

router.get('/sources', async (req, res, next) => {
  try {
    const snapshot = buildSourceHealthSnapshot(await NewsService.getAdminSources());
    res.json({
      success: true,
      data: snapshot.sources,
      meta: { generatedAt: snapshot.generatedAt, summary: snapshot.summary }
    });
  } catch (error) { next(error); }
});

router.get('/source-health', async (req, res, next) => {
  try {
    const snapshot = buildSourceHealthSnapshot(await NewsService.getAdminSources());
    res.json({ success: true, data: snapshot });
  } catch (error) { next(error); }
});

router.get('/brief', async (req, res, next) => {
  try {
    const days = parseBoundedInteger(req.query.days, { fallback: 14, min: 1, max: 30 });
    const limit = parseBoundedInteger(req.query.limit, { fallback: 6, min: 3, max: 8 });
    const news = await NewsService.getAnalysisNews(500);
    const cutoff = Date.now() - days * 86400000;
    const recent = news.data.filter((item) => {
      const time = new Date(item.publishedAt).getTime();
      return !Number.isNaN(time) && time >= cutoff;
    });
    const brief = ContentService.buildBriefFromArticles(recent, {
      topic: req.query.topic,
      audience: req.query.audience,
      goal: req.query.goal,
      format: req.query.format,
      limit
    });
    res.status(brief.status === 'ready' ? 200 : 422).json({ success: brief.status === 'ready', data: brief });
  } catch (error) { next(error); }
});

router.post('/generate', generationLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const topic = String(body.topic || '').trim().slice(0, 120);
    if (!topic) return res.status(400).json({ success: false, error: '请填写内容主题' });
    const days = parseBoundedInteger(body.days, { fallback: 14, min: 1, max: 30 });
    const limit = parseBoundedInteger(body.limit, { fallback: 6, min: 3, max: 8 });
    const news = await NewsService.getAnalysisNews(500);
    const cutoff = Date.now() - days * 86400000;
    const recent = news.data.filter((item) => {
      const time = new Date(item.publishedAt).getTime();
      return !Number.isNaN(time) && time >= cutoff;
    });
    const brief = ContentService.buildBriefFromArticles(recent, {
      topic,
      audience: String(body.audience || '').trim().slice(0, 120),
      goal: String(body.goal || '').trim().slice(0, 180),
      format: String(body.format || '').trim().slice(0, 30),
      limit
    });

    if (brief.status !== 'ready') {
      return res.status(422).json({ success: false, data: { brief }, error: brief.notice });
    }
    if (!agentService.getStatus().enabled) {
      return res.status(503).json({
        success: false,
        data: { brief, generation: { status: 'needs_key' } },
        error: '内容模型尚未配置，证据包已保留'
      });
    }

    const generation = await agentService.generateContent({ brief });
    return res.status(generation.verified ? 200 : 502).json({
      success: generation.verified,
      data: { brief, generation }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
