const express = require('express');
const router = express.Router();
const NewsService = require('../services/NewsService');
const TrendAnalyzer = require('../services/TrendAnalyzer');
const DatabaseService = require('../services/DatabaseService');
const { buildDailyTrendSeries, parseBoundedInteger } = require('../utils/analytics');
const { diversityAuditService } = require('../services/DiversityAuditService');

// 获取统计数据
router.get('/stats', async (req, res) => {
  try {
    const stats = await NewsService.getStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取热门话题
router.get('/trending', async (req, res) => {
  try {
    const limit = parseBoundedInteger(req.query.limit, { fallback: 10, min: 1, max: 30 });
    const trending = await NewsService.getTrendingTopics(limit);
    res.json({
      success: true,
      data: trending
    });
  } catch (error) {
    console.error('获取热门话题失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取内容质量分析
router.get('/quality', async (req, res) => {
  try {
    const quality = await NewsService.getQualityAnalysis();
    res.json({
      success: true,
      data: quality
    });
  } catch (error) {
    console.error('获取质量分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 信息茧房检测 - 内容多样性分析
router.get('/diversity', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    const diversity = await NewsService.getDiversityAnalysis(userId);
    res.json({
      success: true,
      data: diversity
    });
  } catch (error) {
    console.error('获取多样性分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 每日模型复核后的信息茧房反馈；只读，不会由前台触发模型调用。
router.get('/diversity-review', async (req, res) => {
  try {
    const review = await diversityAuditService.getLatestAudit();
    res.json({
      success: true,
      data: review || {
        status: 'scheduled',
        summary: '每日来源多样性复核将在新闻刷新后生成。',
        sources: [],
        metrics: {}
      }
    });
  } catch (error) {
    console.error('获取每日信息茧房复核失败:', error);
    res.status(500).json({ success: false, error: '暂时无法读取每日复核' });
  }
});

// AI发展趋势分析（多视角）
router.get('/trends', async (req, res) => {
  try {
    const trends = await NewsService.getTrendAnalysis();
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('获取趋势分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 智能关键词趋势分析（自动分析新闻内容）
router.get('/smart-trends', async (req, res) => {
  try {
    // 获取最近的新闻数据进行分析
    const newsData = await NewsService.getAnalysisNews(500);
    
    const trends = await TrendAnalyzer.analyzeTrends(newsData.data);
    
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('智能趋势分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 强制重新分析趋势
router.post('/smart-trends/refresh', async (req, res) => {
  try {
    TrendAnalyzer.clearCache();
    const newsData = await NewsService.getAnalysisNews(500);
    
    const trends = await TrendAnalyzer.analyzeTrends(newsData.data);
    
    res.json({
      success: true,
      data: trends,
      message: '趋势分析已刷新'
    });
  } catch (error) {
    console.error('刷新趋势分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 近N天每日新闻趋势（真实数据，供前端7天趋势图使用）
router.get('/daily-trends', async (req, res) => {
  try {
    const days = parseBoundedInteger(req.query.days, { fallback: 7, min: 1, max: 30 });
    await DatabaseService.initialize();
    const daily = await DatabaseService.getDailyStats(days);
    const dailyCategory = await DatabaseService.getDailyCategoryStats(days);

    res.json({
      success: true,
      data: buildDailyTrendSeries({ daily, dailyCategory, days, timeZone: 'Asia/Shanghai' })
    });
  } catch (error) {
    console.error('获取每日趋势失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 多样化推荐（破除信息茧房）
router.get('/recommendations', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    const limit = parseBoundedInteger(req.query.limit, { fallback: 10, min: 1, max: 30 });
    const recommendations = await NewsService.getDiversifiedRecommendations(userId, limit);
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('获取多样化推荐失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
