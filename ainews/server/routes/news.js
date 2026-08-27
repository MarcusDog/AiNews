const express = require('express');
const router = express.Router();
const NewsService = require('../services/NewsService');
const { adminAuth } = require('../middleware/adminAuth');

// ========== 具体路由（必须放在参数路由之前）==========

// 获取最新新闻列表
router.get('/latest', async (req, res) => {
  try {
    // diversify=true（默认开）让源均匀分散，避免同源扎堆
    const { page = 1, limit = 20, category, search, diversify = 'true' } = req.query;
    const news = await NewsService.getLatestNews({
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      search,
      diversify: diversify !== 'false'
    });
    res.json({
      success: true,
      data: news,
      meta: { diversified: diversify !== 'false' },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: news.total || news.length
      }
    });
  } catch (error) {
    console.error('获取最新新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取系统状态 - 必须放在 /:id 之前
router.get('/status', async (req, res) => {
  try {
    const newsCount = await NewsService.getNewsCount();
    const categories = await NewsService.getCategories();
    const lastUpdate = NewsService.getLastUpdateTime();
    const isUsingDemo = newsCount === 0;
    const isUpdating = NewsService.isUpdating || false;

    res.json({
      success: true,
      data: {
        newsCount,
        categories,
        lastUpdate,
        isUsingDemo,
        isUpdating,
        isDemo: isUsingDemo,
        status: isUpdating ? '更新中' : (isUsingDemo ? '演示模式' : '正常运行'),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取系统状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取分类列表 - 必须放在 /:id 之前
router.get('/categories', async (req, res) => {
  try {
    const categories = await NewsService.getCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 搜索新闻 - 必须放在 /:id 之前
router.get('/search', async (req, res) => {
  try {
    const { 
      q, 
      page = 1, 
      limit = 20,
      category,
      source,
      startDate,
      endDate,
      sortBy = 'publishedAt',
      sortOrder = 'desc'
    } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '搜索关键词不能为空'
      });
    }
    
    const results = await NewsService.advancedSearch(q, {
      page: parseInt(page),
      limit: parseInt(limit),
      category,
      source,
      startDate,
      endDate,
      sortBy,
      sortOrder
    });
    
    res.json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: results.total || results.length
      }
    });
  } catch (error) {
    console.error('搜索新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有来源列表 - 必须放在 /:id 之前
router.get('/sources', async (req, res) => {
  try {
    const sources = await NewsService.getSources();
    res.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('获取来源列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取推荐新闻 - 必须放在 /:id 之前
router.get('/recommendations', async (req, res) => {
  try {
    const { userId = 'default', limit = 10 } = req.query;
    const recommendations = await NewsService.getRecommendations(userId, parseInt(limit));
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('获取推荐新闻失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== 热门排行 + 随机发现 API ==========

// 热门排行（基于"被收藏/阅读次数"或"最新命中"加权）
router.get('/hot-rank', async (req, res) => {
  try {
    const { window = '7d', limit = 20, category } = req.query;
    const lim = Math.min(parseInt(limit) || 20, 100);
    const days = window === '24h' ? 1 : window === '30d' ? 30 : 7;
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    // 热度公式：published_at 近 + 标题信息密度（长度）+ 同源去重
    let sql = `
      SELECT n.*,
        (CASE WHEN n.published_at > datetime('now','-1 day') THEN 10
              WHEN n.published_at > datetime('now','-3 day') THEN 5
              WHEN n.published_at > datetime('now','-7 day') THEN 2
              ELSE 1 END) AS recency_score,
        (SELECT COUNT(*) FROM user_read_history h WHERE h.news_id = n.id) AS read_count,
        (SELECT COUNT(*) FROM user_favorites f WHERE f.news_id = n.id) AS fav_count
      FROM news n
      WHERE n.published_at > datetime('now', '-' || ? || ' day')
    `;
    const params = [days];
    if (category && category !== '全部') {
      sql += ' AND n.category = ?';
      params.push(category);
    }
    sql += ' ORDER BY n.published_at DESC LIMIT ?';
    params.push(lim * 5);  // 多取再 round-robin
    const raw = db.db.prepare(sql).all(...params);
    // 按 recency_score + fav_count*3 + read_count 排序，再 round-robin 分散
    raw.forEach(r => {
      r.hot_score = (r.recency_score || 0) + (r.fav_count || 0) * 3 + (r.read_count || 0) * 0.1;
    });
    raw.sort((a, b) => b.hot_score - a.hot_score);
    const items = db._interleaveBySource(raw).slice(0, lim);
    res.json({
      success: true,
      data: {
        items,
        count: items.length,
        window: window,
        algorithm: 'recency_score + favorites*3 + reads*0.1 + source-diversify'
      }
    });
  } catch (e) {
    console.error('热门排行失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 随机发现（用于"换一批"按钮 / 探索页）
router.get('/discover', async (req, res) => {
  try {
    const { limit = 10, region = 'all', seed } = req.query;
    const lim = Math.min(parseInt(limit) || 10, 50);
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    // 用 ROWID + RANDOM 抽样最近 30 天的文章
    let where = `published_at > datetime('now','-30 day')`;
    const params = [];
    if (region === 'domestic') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      where += ` AND (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    } else if (region === 'overseas') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      where += ` AND NOT (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    }
    // seed 让随机可复现（前端可缓存同一 seed 的结果）
    const randomOffset = seed ? Math.abs(hashCode(seed)) % 1000 : Math.floor(Math.random() * 1000);
    // 用模 hash 选定 LIMIT/OFFSET 后再用 source 打散
    const rawItems = db.db.prepare(
      `SELECT * FROM news WHERE ${where} ORDER BY RANDOM() LIMIT ?`
    ).all(...params, lim * 5);
    // 二次 seed 打散：按 seed 字符数 mod 偏移
    const startIdx = seed ? Math.abs(hashCode(seed + '_v2')) % Math.max(rawItems.length - lim, 1) : 0;
    const sliced = rawItems.slice(startIdx, startIdx + lim);
    const items = db._interleaveBySource(sliced).slice(0, lim);
    const result = db._interleaveBySource(items).slice(0, lim);
    res.json({
      success: true,
      data: {
        items: result,
        count: result.length,
        region,
        seed: seed || null,
        offset: randomOffset
      }
    });
  } catch (e) {
    console.error('随机发现失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 关键词相关推荐：基于标题/描述全文搜索 + TF-IDF 简化版
router.get('/related', async (req, res) => {
  try {
    const { keyword, limit = 8 } = req.query;
    const lim = Math.min(parseInt(limit) || 8, 30);
    if (!keyword) return res.status(400).json({ success: false, error: 'keyword 必填' });
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    // 拆词（简单：中文 2-gram + 英文单词）
    const tokens = [];
    const enWords = keyword.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
    enWords.forEach(w => tokens.push(w));
    const cnMatches = keyword.match(/[\u4e00-\u9fa5]/g) || [];
    for (let i = 0; i < cnMatches.length - 1; i++) {
      tokens.push(cnMatches[i] + cnMatches[i + 1]);
    }
    if (tokens.length === 0) tokens.push(keyword);
    // 按 token 在标题中出现次数加权排序
    const conditions = tokens.map(() => '(title LIKE ? OR description LIKE ?)').join(' OR ');
    const params = [];
    tokens.forEach(t => {
      const p = `%${t}%`;
      params.push(p, p);
    });
    // 构造 relevance 表达式（每个 token 占 2 个 ? 占位）
    const relevanceExpr = tokens.map(() => '(CASE WHEN title LIKE ? THEN 2 ELSE 0 END) + (CASE WHEN description LIKE ? THEN 1 ELSE 0 END)').join(' + ');
    const sqlParams = [...params, ...params, lim * 5];  // conditions 用一次，relevance 用一次，limit 用一个
    const rows = db.db.prepare(
      `SELECT *, (${relevanceExpr}) AS relevance
       FROM news WHERE ${conditions}
       ORDER BY relevance DESC, published_at DESC LIMIT ?`
    ).all(...sqlParams);
    const items = db._interleaveBySource(rows).slice(0, lim);
    res.json({
      success: true,
      data: {
        keyword,
        tokens,
        items,
        count: items.length
      }
    });
  } catch (e) {
    console.error('相关推荐失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

// ========== 国内新闻聚合 API ==========

// 国内新闻白名单（source 名称匹配关键词）
const DOMESTIC_SOURCE_KEYWORDS = [
  '量子位', '机器之心', 'AI科技大本营', 'AI前线', 'InfoQ', '硬地骇客', '36氪',
  '雷峰网', '极客时间', '阿里达摩院', '腾讯AI', '百度研究', '百度AI',
  '智谱', 'Qwen', 'DeepSeek', 'PaddleNLP', 'Paddle', 'InternLM',
  'MiniMax', '开源中国', 'OSChina', 'HelloGitHub', 'GitCode',
  '掘金', 'SegmentFault', '少数派', '爱范儿', '钛媒体',
  '极客公园', 'Datawhale'
];

function isDomesticSource(sourceName) {
  if (!sourceName) return false;
  return DOMESTIC_SOURCE_KEYWORDS.some(kw => sourceName.includes(kw));
}

// 国内新闻列表
router.get('/domestic', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, diversify = 'true' } = req.query;
    const shouldDiversify = diversify !== 'false';
    const lim = Math.min(parseInt(limit) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
    const params = DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`);
    let sql = `SELECT * FROM news WHERE (${placeholders})`;
    const qParams = [...params];
    if (category) { sql += ' AND category = ?'; qParams.push(category); }
    // 总数
    const countSql = `SELECT COUNT(*) AS c FROM news WHERE (${placeholders})` + (category ? ' AND category = ?' : '');
    const total = db.db.prepare(countSql).get(...qParams).c;
    let items;
    if (shouldDiversify) {
      // 多元化：多取 5 倍再 round-robin
      sql += ' ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?';
      qParams.push(lim * 5);
      const rawItems = db.db.prepare(sql).all(...qParams);
      items = db._interleaveBySource(rawItems).slice(0, lim);
    } else {
      sql += ' ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ? OFFSET ?';
      qParams.push(lim, offset);
      items = db.db.prepare(sql).all(...qParams);
    }
    res.json({
      success: true,
      data: { data: items, total, page: parseInt(page), limit: lim },
      meta: { region: 'domestic', sourceCount: DOMESTIC_SOURCE_KEYWORDS.length, diversified: shouldDiversify }
    });
  } catch (e) {
    console.error('国内新闻失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 按来源查询新闻
router.get('/by-source', async (req, res) => {
  try {
    const { source, page = 1, limit = 20 } = req.query;
    if (!source) return res.status(400).json({ success: false, error: 'source 参数必填' });
    const lim = Math.min(parseInt(limit) || 20, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const total = db.db.prepare('SELECT COUNT(*) AS c FROM news WHERE source = ?').get(source).c;
    const items = db.db.prepare('SELECT * FROM news WHERE source = ? ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ? OFFSET ?')
      .all(source, lim, offset);
    res.json({
      success: true,
      data: { data: items, total, page: parseInt(page), limit: lim, source }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 国内外分布统计
router.get('/region-stats', async (req, res) => {
  try {
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
    const params = DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`);
    const domestic = db.db.prepare(`SELECT COUNT(*) AS c FROM news WHERE ${placeholders}`).get(...params).c;
    const overseas = db.db.prepare(`SELECT COUNT(*) AS c FROM news WHERE NOT (${placeholders})`).get(...params).c;
    const domesticSources = db.db.prepare(`SELECT COUNT(DISTINCT source) AS c FROM news WHERE ${placeholders}`).get(...params).c;
    const overseasSources = db.db.prepare(`SELECT COUNT(DISTINCT source) AS c FROM news WHERE NOT (${placeholders})`).get(...params).c;
    // 国内分类分布
    const domesticByCategory = db.db.prepare(
      `SELECT category, COUNT(*) AS count FROM news WHERE ${placeholders} GROUP BY category ORDER BY count DESC`
    ).all(...params);
    res.json({
      success: true,
      data: {
        domestic: { articles: domestic, sources: domesticSources },
        overseas: { articles: overseas, sources: overseasSources },
        ratio: domestic / Math.max(domestic + overseas, 1),
        domesticByCategory
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 国内 Top 来源（按文章数）
router.get('/domestic-top-sources', async (req, res) => {
  try {
    const { limit = 15 } = req.query;
    const lim = Math.min(parseInt(limit) || 15, 50);
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
    const params = DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`);
    const top = db.db.prepare(
      `SELECT source, COUNT(*) AS count, MAX(published_at) AS latest FROM news WHERE ${placeholders} GROUP BY source ORDER BY count DESC LIMIT ?`
    ).all(...params, lim);
    res.json({ success: true, data: top });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ========== 公开场景补充 API ==========

// 多元化最新新闻（同源均匀分散）
router.get('/diversified', async (req, res) => {
  try {
    const { page = 1, limit = 20, category } = req.query;
    const result = await NewsService.getLatestNews({
      page: parseInt(page),
      limit: Math.min(parseInt(limit) || 20, 100),
      category,
      diversify: true
    });
    res.json({ success: true, data: result, meta: { diversified: true } });
  } catch (e) {
    console.error('多元化新闻失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 增量同步 API：since 参数拉取 N 分钟前到现在的新文章（适合客户端定时轮询）
router.get('/feed', async (req, res) => {
  try {
    const { since, limit = 50, region = 'all', diversify = 'true' } = req.query;
    const shouldDiversify = diversify !== 'false';
    const lim = Math.min(parseInt(limit) || 50, 200);
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    // since 支持 ISO 时间或分钟数
    let sinceDate;
    if (!since) sinceDate = new Date(Date.now() - 60 * 60 * 1000);  // 默认最近1小时
    else if (/^\d+$/.test(since)) sinceDate = new Date(Date.now() - parseInt(since) * 60 * 1000);
    else sinceDate = new Date(since);
    const iso = sinceDate.toISOString();
    let where = 'published_at > ?';
    const params = [iso];
    if (region === 'domestic') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      where += ` AND (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    } else if (region === 'overseas') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      where += ` AND NOT (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    }
    let items;
    if (shouldDiversify) {
      // 多元化：多取 5 倍
      const rawItems = db.db.prepare(
        `SELECT * FROM news WHERE ${where} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`
      ).all(...params, lim * 5);
      items = db._interleaveBySource(rawItems).slice(0, lim);
    } else {
      items = db.db.prepare(
        `SELECT * FROM news WHERE ${where} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`
      ).all(...params, lim);
    }
    res.json({
      success: true,
      data: { items, count: items.length, since: iso, region, diversified: shouldDiversify }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 智能摘要：按 category 聚合每个分类的最近 N 条标题（用于首页 widget / Email digest）
router.get('/digest', async (req, res) => {
  try {
    const { limit = 5, region = 'all' } = req.query;
    const perCat = Math.min(parseInt(limit) || 5, 20);
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    let regionFilter = '';
    const params = [];
    if (region === 'domestic') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      regionFilter = ` AND (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    } else if (region === 'overseas') {
      const placeholders = DOMESTIC_SOURCE_KEYWORDS.map(() => 'source LIKE ?').join(' OR ');
      regionFilter = ` AND NOT (${placeholders})`;
      params.push(...DOMESTIC_SOURCE_KEYWORDS.map(kw => `%${kw}%`));
    }
    const cats = db.db.prepare(
      `SELECT category, COUNT(*) AS total FROM news WHERE 1=1 ${regionFilter} GROUP BY category ORDER BY total DESC`
    ).all(...params);
    const digest = [];
    for (const c of cats) {
      const items = db.db.prepare(
        `SELECT id, title, source, published_at, url FROM news WHERE category = ? ${regionFilter} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`
      ).all(c.category, ...params, perCat);
      digest.push({
        category: c.category,
        total: c.total,
        items
      });
    }
    res.json({ success: true, data: digest });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// RSS 调度健康度：返回所有 is_active=1 源的最近抓取情况（监控面板用）
router.get('/sources-health', async (req, res) => {
  try {
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const rows = db.db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN fail_count >= 6 THEN 1 ELSE 0 END) AS failing,
         SUM(CASE WHEN fail_count = 0 THEN 1 ELSE 0 END) AS healthy
       FROM rss_sources`
    ).get();
    const byCategory = db.db.prepare(
      `SELECT category,
        SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active,
        COUNT(*) AS total
       FROM rss_sources GROUP BY category ORDER BY active DESC`
    ).all();
    res.json({ success: true, data: { ...rows, byCategory } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 搜索热词（基于最近 N 天真实新闻标题挖掘）
router.get('/trending-keywords', async (req, res) => {
  try {
    const TrendingCache = require('../services/TrendingCache');
    // 默认参数 → 读缓存（cron 每天 04:00 重建）；非默认参数 → 实时算
    const days = Math.min(parseInt(req.query.days) || 14, 30);
    const limit = Math.min(parseInt(req.query.limit) || 25, 50);
    const minCount = Math.min(parseInt(req.query.minCount) || 2, 10);
    let data, cached = false, generatedAt = null;
    if (days === 14 && limit === 25 && minCount === 2) {
      // 命中缓存路径（默认请求）
      const cached2 = TrendingCache.get();
      if (cached2) { data = cached2.data; generatedAt = cached2.generatedAt; cached = true; }
    }
    if (!data) {
      const { SearchTrendingService } = require('../services/SearchTrendingService');
      const svc = new SearchTrendingService();
      data = svc.getTrending({ days, limit, minCount });
      generatedAt = new Date().toISOString();
    }
    res.set('Cache-Control', 'public, max-age=300');  // 5min HTTP 缓存
    res.set('X-Cache', cached ? 'HIT' : 'MISS');
    res.json({ success: true, data: { ...data, generatedAt }, cached });
  } catch (e) {
    console.error('搜索热词失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 搜索提示（短文本，返回最新分类 + 提示语）
router.get('/search-tips', async (req, res) => {
  try {
    const TrendingCache = require('../services/TrendingCache');
    const cached = TrendingCache.readCache();
    let data, generatedAt;
    if (cached) {
      data = cached.data;
      generatedAt = cached.generatedAt;
    } else {
      const { SearchTrendingService } = require('../services/SearchTrendingService');
      const svc = new SearchTrendingService();
      data = svc.getTrending({ days: 7, limit: 6, minCount: 2 });
      generatedAt = new Date().toISOString();
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Cache', cached ? 'HIT' : 'MISS');
    res.json({
      success: true,
      data: {
        tips: data.searchTips,
        hotCategories: data.hotCategories.slice(0, 5),
        hotKeywords: data.hotKeywords.slice(0, 6).map(k => k.keyword),
        generatedAt,
        cached: !!cached
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ========== Dashboard / 监控 API ==========

// 详细 source 健康度（按 fail_count 排序）
router.get('/sources-detail', async (req, res) => {
  try {
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const rows = db.db.prepare(`
      SELECT s.name, s.url, s.category, s.is_active, s.fail_count, s.last_fetch, s.last_success, s.error_message,
        (SELECT COUNT(*) FROM news WHERE source = s.name) AS article_count,
        (SELECT MAX(published_at) FROM news WHERE source = s.name) AS latest_article
      FROM rss_sources s
      ORDER BY s.fail_count DESC, s.last_fetch DESC
      LIMIT 200
    `).all();
    res.json({ success: true, data: rows, count: rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 全站统计仪表盘
router.get('/dashboard', async (req, res) => {
  try {
    const db = require('../services/DatabaseService');
    if (!db.isInitialized) await db.initialize();
    const stats = db.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM news) AS total_articles,
        (SELECT COUNT(*) FROM news WHERE published_at > datetime('now','-1 day')) AS last_24h,
        (SELECT COUNT(*) FROM news WHERE published_at > datetime('now','-7 day')) AS last_7d,
        (SELECT COUNT(*) FROM news WHERE published_at > datetime('now','-30 day')) AS last_30d,
        (SELECT COUNT(*) FROM rss_sources) AS total_sources,
        (SELECT COUNT(*) FROM rss_sources WHERE is_active=1) AS active_sources,
        (SELECT COUNT(*) FROM rss_sources WHERE is_active=1 AND fail_count=0) AS healthy_sources,
        (SELECT COUNT(DISTINCT source) FROM news) AS unique_sources,
        (SELECT MAX(published_at) FROM news) AS latest_article_at,
        (SELECT MAX(updated_at) FROM news) AS last_ingest_at
    `).get();
    const sourcesByCategory = db.db.prepare(`
      SELECT category,
        COUNT(*) AS total,
        SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active
      FROM rss_sources GROUP BY category ORDER BY active DESC
    `).all();
    const topSourcesByArticles = db.db.prepare(`
      SELECT source, COUNT(*) AS count FROM news GROUP BY source ORDER BY count DESC LIMIT 10
    `).all();
    res.json({ success: true, data: { ...stats, sourcesByCategory, topSourcesByArticles } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取模拟新闻数据（用于演示）- 必须放在 /:id 之前
router.get('/demo', async (req, res) => {
  try {
    const { page = 1, limit = 10, category } = req.query;

    // 模拟AI新闻数据
    const mockNews = [
      {
        id: 'demo_1',
        title: 'GPT-5即将发布：OpenAI宣布重大突破',
        description: 'OpenAI宣布其下一代语言模型GPT-5在推理能力、多模态处理和代码生成方面实现了革命性突破。该模型预计将在2026年第一季度正式发布，标志着人工智能进入新纪元。',
        url: 'https://example.com/gpt5-announcement',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'OpenAI官方',
        imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=300&fit=crop',
        author: 'OpenAI Team'
      },
      {
        id: 'demo_2',
        title: 'PyTorch 3.0发布：AI开发新标准',
        description: 'PyTorch团队宣布推出PyTorch 3.0，这是一个里程碑版本，引入了全新的动态图优化、自动混合精度训练和分布式训练增强功能。',
        url: 'https://example.com/pytorch3-release',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'PyTorch Foundation',
        imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=400&h=300&fit=crop',
        author: 'PyTorch Team'
      },
      {
        id: 'demo_3',
        title: '新型Transformer架构：效率提升300%',
        description: '研究团队提出了一种全新的注意力机制设计，将Transformer模型的计算效率提升了300%，同时保持了模型性能。这一突破性研究将大大降低AI训练成本。',
        url: 'https://example.com/efficient-transformer',
        publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        category: '新算法',
        source: 'arXiv',
        imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=400&h=300&fit=crop',
        author: 'Research Team'
      },
      {
        id: 'demo_4',
        title: '多模态AI：文本、图像、音频统一理解',
        description: '最新研究展示了能够同时处理文本、图像和音频的统一AI模型，在跨模态理解和生成任务中取得了前所未有的性能。',
        url: 'https://example.com/multimodal-ai',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        category: '新思路',
        source: 'Google Research',
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=300&fit=crop',
        author: 'Google AI Team'
      },
      {
        id: 'demo_5',
        title: 'AI编程助手Copilot X：支持全栈开发',
        description: 'GitHub发布Copilot X，将AI编程助手的边界扩展到全栈开发，支持前端、后端、数据库设计和部署等整个开发生命周期。',
        url: 'https://example.com/copilot-x',
        publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        category: '新工具',
        source: 'GitHub',
        imageUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=300&fit=crop',
        author: 'GitHub Team'
      }
    ];

    let filteredNews = mockNews;

    // 按分类过滤
    if (category && category !== '全部') {
      filteredNews = mockNews.filter(item => item.category === category);
    }

    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedNews = filteredNews.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        data: paginatedNews,
        total: filteredNews.length
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredNews.length
      }
    });
  } catch (error) {
    console.error('获取演示数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动更新新闻 - 必须放在 /:id 之前
router.post('/update', adminAuth, async (req, res) => {
  try {
    console.log('收到手动更新请求');
    const result = await NewsService.updateAllNews();
    res.json({
      success: true,
      message: '新闻更新完成',
      data: result
    });
  } catch (error) {
    console.error('更新新闻时发生错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== 参数路由（必须放在最后）==========

// 获取新闻详情 - 参数路由必须放在所有具体路由之后
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const news = await NewsService.getNewsById(id);
    if (!news) {
      return res.status(404).json({
        success: false,
        error: '新闻不存在'
      });
    }
    
    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    console.error('获取新闻详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
