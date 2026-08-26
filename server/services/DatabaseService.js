const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.dbPath = process.env.AINEWS_DB_PATH || path.join(__dirname, '../data/ainews.db');
    this.db = null;
    this.isInitialized = false;
    
    // 确保数据目录存在
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // 初始化数据库
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      console.log('SQLite数据库连接成功:', this.dbPath);
      await this.createTables();
      this.isInitialized = true;
    } catch (err) {
      console.error('数据库连接失败:', err);
      throw err;
    }
  }

  // 创建表结构
  async createTables() {
    const tables = `
      -- 新闻表
      CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT,
        published_at DATETIME,
        category TEXT,
        source TEXT,
        image_url TEXT,
        author TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 新闻表索引
      CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);
      CREATE INDEX IF NOT EXISTS idx_news_source ON news(source);
      CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at DESC);

      -- RSS源状态表
      CREATE TABLE IF NOT EXISTS rss_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        category TEXT,
        priority INTEGER DEFAULT 3,
        last_fetch DATETIME,
        last_success DATETIME,
        fail_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 用户偏好表
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT DEFAULT 'default',
        preference_key TEXT NOT NULL,
        preference_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, preference_key)
      );

      -- 用户认证表
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        provider TEXT DEFAULT 'password',
        google_id TEXT UNIQUE,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

      -- 登录会话表
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

      -- 用户收藏保存文章快照，不依赖新闻保留周期；账号删除时自动清理。
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id TEXT NOT NULL,
        news_id TEXT NOT NULL,
        article_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, news_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_favorites_created_at
        ON user_favorites(user_id, created_at DESC);

      -- 阅读历史按账号隔离，并记录重复阅读次数。
      CREATE TABLE IF NOT EXISTS user_read_history (
        user_id TEXT NOT NULL,
        news_id TEXT NOT NULL,
        first_read_at INTEGER NOT NULL,
        last_read_at INTEGER NOT NULL,
        read_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(user_id, news_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_read_history_last_read
        ON user_read_history(user_id, last_read_at DESC);

      -- 系统配置表
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 每日信息茧房审查：保存模型结论和其实际引用，供前台只读展示。
      CREATE TABLE IF NOT EXISTS diversity_audits (
        audit_date TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        score INTEGER,
        risk_level TEXT,
        model TEXT,
        summary TEXT NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]',
        metrics_json TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_diversity_audits_updated_at
        ON diversity_audits(updated_at DESC);

      -- 请求日志表（用于限流和监控）
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT,
        request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        success INTEGER,
        response_time INTEGER,
        error_message TEXT
      );

    `;

    // 先执行普通表和索引创建
    await this.runMultiple(tables);
    
    // 单独执行TRIGGER创建（因为内部包含分号，不能用split分割）
    const triggerSql = `
      CREATE TRIGGER IF NOT EXISTS cleanup_old_logs
      AFTER INSERT ON request_logs
      BEGIN
        DELETE FROM request_logs WHERE request_time < datetime('now', '-30 days');
      END
    `;
    
    try {
      await this.run(triggerSql);
    } catch (err) {
      // TRIGGER可能已存在，忽略错误
      console.log('Trigger creation:', err.message);
    }
  }

  // 执行多条SQL语句
  async runMultiple(sql) {
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await this.run(statement);
      }
    }
  }

  async ensureInitialized() {
    if (!this.db) {
      await this.initialize();
    }
  }

  normalizeParams(params = []) {
    return params.map((param) => {
      if (param === undefined || param === null) return null;
      if (typeof param === 'boolean') return param ? 1 : 0;
      if (param instanceof Date) return param.toISOString();
      if (Buffer.isBuffer(param)) return param;
      if (['string', 'number', 'bigint'].includes(typeof param)) return param;
      return JSON.stringify(param);
    });
  }

  // 执行SQL（Promise封装）
  async run(sql, params = []) {
    await this.ensureInitialized();
    return this.db.prepare(sql).run(...this.normalizeParams(params));
  }

  // 查询单行
  async get(sql, params = []) {
    await this.ensureInitialized();
    return this.db.prepare(sql).get(...this.normalizeParams(params));
  }

  // 查询多行
  async all(sql, params = []) {
    await this.ensureInitialized();
    return this.db.prepare(sql).all(...this.normalizeParams(params));
  }

  // ============ 新闻相关操作 ============

  // 保存新闻（批量upsert，带URL去重检查）
  async saveNews(articles) {
    if (!articles || articles.length === 0) return 0;
    
    let savedCount = 0;
    let skippedCount = 0;
    
    // 先检查哪些URL已存在
    const urls = articles.map(a => a.url).filter(Boolean);
    let existingUrls = new Set();
    
    if (urls.length > 0) {
      // 批量查询已存在的URL
      const placeholders = urls.map(() => '?').join(',');
      const existingRows = await this.all(
        `SELECT url FROM news WHERE url IN (${placeholders})`,
        urls
      );
      existingUrls = new Set(existingRows.map(r => r.url));
    }
    
    const sql = `
      INSERT OR REPLACE INTO news 
      (id, title, description, url, published_at, category, source, image_url, author, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    const updateSql = `
      UPDATE news SET
        title = ?,
        description = ?,
        published_at = ?,
        category = ?,
        source = ?,
        image_url = COALESCE(NULLIF(?, ''), image_url),
        author = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `;
    
    for (const article of articles) {
      try {
        // URL 是文章身份：上游修订发布时间时更新原记录，绝不复制出第二篇。
        if (existingUrls.has(article.url)) {
          const existing = await this.get(
            'SELECT id FROM news WHERE url = ? ORDER BY updated_at DESC LIMIT 1',
            [article.url]
          );
          
          if (existing) {
            await this.run(updateSql, [
              article.title,
              article.description || '',
              article.publishedAt ? new Date(article.publishedAt).toISOString() : null,
              article.category || '',
              article.source || '',
              article.imageUrl || '',
              article.author || '',
              existing.id
            ]);
            skippedCount++;
            continue;
          }
        }
        
        await this.run(sql, [
          article.id,
          article.title,
          article.description || '',
          article.url || '',
          article.publishedAt ? new Date(article.publishedAt).toISOString() : null,
          article.category || '',
          article.source || '',
          article.imageUrl || null,
          article.author || ''
        ]);
        savedCount++;
      } catch (err) {
        console.error('保存新闻失败:', article.id, err.message);
      }
    }
    
    if (skippedCount > 0) {
      console.log(`跳过 ${skippedCount} 条重复文章`);
    }
    
    return savedCount;
  }

  // 获取新闻列表（添加URL去重）
  async getNews({ page = 1, limit = 20, category = null, search = null } = {}) {
    // 使用GROUP BY去重，保留最新的一条
    let sql = `
      SELECT * FROM news 
      WHERE id IN (
        SELECT MAX(id) FROM news 
        GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
      )
    `;
    const params = [];
    
    if (category && category !== '全部') {
      sql += ' AND category = ?';
      params.push(category);
    }
    
    if (search) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    // 获取总数（去重后）
    let countSql = `
      SELECT COUNT(*) as total FROM news
      WHERE id IN (
        SELECT MAX(id) FROM news
        GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
      )
    `;
    const countParams = [];
    if (category && category !== '全部') {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    if (search) {
      countSql += ' AND (title LIKE ? OR description LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern);
    }
    
    const countResult = await this.get(countSql, countParams);
    const total = countResult ? countResult.total : 0;
    
    // 添加排序和分页
    sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);
    
    const data = await this.all(sql, params);
    
    // 转换字段名为驼峰
    const formattedData = data.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      publishedAt: row.published_at,
      category: row.category,
      source: row.source,
      imageUrl: row.image_url,
      author: row.author
    }));
    
    return { data: formattedData, total, page, limit };
  }

  // 获取新闻数量
  async getNewsCount() {
    const result = await this.get(`
      SELECT COUNT(*) as count FROM (
        SELECT COALESCE(NULLIF(TRIM(url), ''), id) AS article_identity
        FROM news
        GROUP BY article_identity
      )
    `);
    return result ? result.count : 0;
  }

  // 获取分类统计
  async getCategoryStats() {
    const rows = await this.all(`
      SELECT category, COUNT(*) as count 
      FROM news
      WHERE id IN (
        SELECT MAX(id) FROM news
        GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
      )
      GROUP BY category 
      ORDER BY count DESC
    `);
    return rows;
  }

  // 获取来源统计
  async getSourceStats() {
    const rows = await this.all(`
      SELECT source, COUNT(*) as count
      FROM news
      WHERE id IN (
        SELECT MAX(id) FROM news
        GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
      )
      GROUP BY source
      ORDER BY count DESC
    `);
    return rows;
  }

  // 获取最近N天每日新闻数量趋势（用于近7天趋势图等真实数据）
  async getDailyStats(days = 7) {
    const rows = await this.all(`
      SELECT date(published_at, '+8 hours') as date, COUNT(*) as count
      FROM news
      WHERE published_at >= datetime('now', '+8 hours', 'start of day', '-' || (? - 1) || ' days', '-8 hours')
        AND published_at IS NOT NULL
        AND id IN (
          SELECT MAX(id) FROM news
          GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
        )
      GROUP BY date(published_at, '+8 hours')
      ORDER BY date ASC
    `, [days]);
    return rows;
  }

  // 获取最近N天分类趋势（每日各分类数量）
  async getDailyCategoryStats(days = 7) {
    const rows = await this.all(`
      SELECT date(published_at, '+8 hours') as date, category, COUNT(*) as count
      FROM news
      WHERE published_at >= datetime('now', '+8 hours', 'start of day', '-' || (? - 1) || ' days', '-8 hours')
        AND published_at IS NOT NULL
        AND id IN (
          SELECT MAX(id) FROM news
          GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
        )
      GROUP BY date(published_at, '+8 hours'), category
      ORDER BY date ASC
    `, [days]);
    return rows;
  }

  // 清理旧新闻；默认保留足够长的趋势比较与回溯窗口。
  async cleanOldNews(daysToKeep = 45) {
    const result = await this.run(`
      DELETE FROM news 
      WHERE published_at < datetime('now', '-' || ? || ' days')
    `, [daysToKeep]);
    
    console.log(`清理了 ${result.changes} 条过期新闻`);
    return result.changes;
  }

  // ============ RSS源状态管理 ============

  // 更新RSS源状态
  async updateRssSourceStatus(name, url, category, success, errorMessage = null) {
    // 兼容旧调用签名：(name, url, success, errorMessage)
    if (typeof category === 'boolean') {
      errorMessage = success || null;
      success = category;
      category = null;
    }

    const successFlag = success ? 1 : 0;
    const sql = `
      INSERT INTO rss_sources (name, url, category, last_fetch, last_success, fail_count, error_message)
      VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        category = COALESCE(?, category),
        last_fetch = datetime('now'),
        last_success = CASE WHEN ? THEN datetime('now') ELSE last_success END,
        fail_count = CASE WHEN ? THEN 0 ELSE fail_count + 1 END,
        error_message = ?,
        is_active = CASE WHEN fail_count >= 10 THEN 0 ELSE 1 END
    `;
    
    await this.run(sql, [
      // INSERT VALUES
      name, url, category || null,
      success ? new Date().toISOString() : null,  // last_success
      success ? 0 : 1,  // fail_count
      errorMessage,  // error_message
      // UPDATE SET
      category || null,  // category = COALESCE(?, category)
      successFlag,  // last_success CASE WHEN ?
      successFlag,  // fail_count CASE WHEN ?
      errorMessage  // error_message = ?
    ]);
  }

  // 获取活跃的RSS源
  async getActiveRssSources() {
    return await this.all(`
      SELECT * FROM rss_sources 
      WHERE is_active = 1 
      ORDER BY priority ASC, fail_count ASC
    `);
  }

  // 重置失败的RSS源
  async resetFailedSources() {
    await this.run(`
      UPDATE rss_sources 
      SET fail_count = 0, is_active = 1, error_message = NULL
      WHERE fail_count > 0
    `);
  }

  // ============ 请求日志 ============

  // 记录请求
  async logRequest(sourceName, success, responseTime, errorMessage = null) {
    await this.run(`
      INSERT INTO request_logs (source_name, success, response_time, error_message)
      VALUES (?, ?, ?, ?)
    `, [sourceName, success ? 1 : 0, responseTime, errorMessage]);
  }

  // 获取最近请求统计
  async getRequestStats(minutes = 60) {
    const rows = await this.all(`
      SELECT 
        source_name,
        COUNT(*) as total_requests,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        AVG(response_time) as avg_response_time
      FROM request_logs
      WHERE request_time > datetime('now', '-' || ? || ' minutes')
      GROUP BY source_name
    `, [minutes]);
    return rows;
  }

  // 检查是否应该限流（最近1分钟内请求过多）
  async shouldThrottle(sourceName, maxRequestsPerMinute = 5) {
    const result = await this.get(`
      SELECT COUNT(*) as count 
      FROM request_logs 
      WHERE source_name = ? 
      AND request_time > datetime('now', '-1 minute')
    `, [sourceName]);
    
    return result && result.count >= maxRequestsPerMinute;
  }

  // ============ 系统配置 ============

  // 获取配置
  async getConfig(key, defaultValue = null) {
    const row = await this.get('SELECT value FROM system_config WHERE key = ?', [key]);
    return row ? row.value : defaultValue;
  }

  // 设置配置
  async setConfig(key, value) {
    await this.run(`
      INSERT OR REPLACE INTO system_config (key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `, [key, value]);
  }

  // ============ 每日信息茧房审查 ============

  async saveDiversityAudit(audit = {}) {
    if (!audit.auditDate || !audit.status || !audit.summary) {
      throw new Error('信息茧房审查缺少日期、状态或摘要');
    }
    await this.run(`
      INSERT INTO diversity_audits
        (audit_date, status, score, risk_level, model, summary, sources_json, metrics_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(audit_date) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        risk_level = excluded.risk_level,
        model = excluded.model,
        summary = excluded.summary,
        sources_json = excluded.sources_json,
        metrics_json = excluded.metrics_json,
        updated_at = datetime('now')
    `, [
      audit.auditDate,
      audit.status,
      Number.isFinite(Number(audit.score)) ? Math.round(Number(audit.score)) : null,
      audit.riskLevel || null,
      audit.model || null,
      audit.summary,
      JSON.stringify(Array.isArray(audit.sources) ? audit.sources : []),
      JSON.stringify(audit.metrics || {})
    ]);
    return this.getDiversityAuditByDate(audit.auditDate);
  }

  formatDiversityAudit(row) {
    if (!row) return null;
    const parseJson = (value, fallback) => {
      try { return JSON.parse(value); } catch { return fallback; }
    };
    return {
      auditDate: row.audit_date,
      status: row.status,
      score: row.score,
      riskLevel: row.risk_level,
      model: row.model,
      summary: row.summary,
      sources: parseJson(row.sources_json, []),
      metrics: parseJson(row.metrics_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getDiversityAuditByDate(auditDate) {
    const row = await this.get('SELECT * FROM diversity_audits WHERE audit_date = ?', [auditDate]);
    return this.formatDiversityAudit(row);
  }

  async getLatestDiversityAudit() {
    const row = await this.get('SELECT * FROM diversity_audits ORDER BY audit_date DESC, updated_at DESC LIMIT 1');
    return this.formatDiversityAudit(row);
  }

  // ============ 用户偏好 ============

  // 获取用户偏好
  async getUserPreference(userId, key, defaultValue = null) {
    const row = await this.get(
      'SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = ?',
      [userId, key]
    );
    return row ? row.preference_value : defaultValue;
  }

  // 设置用户偏好
  async setUserPreference(userId, key, value) {
    await this.run(`
      INSERT OR REPLACE INTO user_preferences (user_id, preference_key, preference_value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `, [userId, key, value]);
  }

  // 获取所有用户偏好
  async getAllUserPreferences(userId = 'default') {
    const rows = await this.all(
      'SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    
    const prefs = {};
    rows.forEach(row => {
      prefs[row.preference_key] = row.preference_value;
    });
    return prefs;
  }

  // ============ 用户收藏与阅读历史 ============

  normalizeFavoriteSnapshot(article = {}) {
    return {
      id: String(article.id || ''),
      title: String(article.title || ''),
      description: String(article.description || ''),
      url: String(article.url || ''),
      publishedAt: article.publishedAt || null,
      category: String(article.category || 'AI新闻'),
      source: String(article.source || ''),
      imageUrl: article.imageUrl || null,
      favoritedAt: Number(article.favoritedAt) || Date.now()
    };
  }

  async upsertUserFavorite(userId, article) {
    const snapshot = this.normalizeFavoriteSnapshot(article);
    if (!userId || !snapshot.id || !snapshot.title) {
      throw new Error('收藏缺少用户、新闻 ID 或标题');
    }

    await this.run(`
      INSERT INTO user_favorites (user_id, news_id, article_json, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, news_id) DO UPDATE SET
        article_json = excluded.article_json,
        updated_at = datetime('now')
    `, [userId, snapshot.id, JSON.stringify(snapshot)]);

    return snapshot;
  }

  async getUserFavorites(userId) {
    const rows = await this.all(`
      SELECT article_json, created_at
      FROM user_favorites
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    return rows.flatMap((row) => {
      try {
        return [{ ...JSON.parse(row.article_json), favoritedAt: JSON.parse(row.article_json).favoritedAt || Date.parse(row.created_at) }];
      } catch {
        return [];
      }
    });
  }

  async removeUserFavorite(userId, newsId) {
    const result = await this.run(
      'DELETE FROM user_favorites WHERE user_id = ? AND news_id = ?',
      [userId, newsId]
    );
    return result.changes > 0;
  }

  async clearUserFavorites(userId) {
    const result = await this.run('DELETE FROM user_favorites WHERE user_id = ?', [userId]);
    return result.changes;
  }

  async markUserNewsRead(userId, newsId, readAt = Date.now(), maxEntries = 500) {
    if (!userId || !newsId) throw new Error('阅读历史缺少用户或新闻 ID');
    const timestamp = Number(readAt) || Date.now();

    await this.run(`
      INSERT INTO user_read_history (user_id, news_id, first_read_at, last_read_at, read_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(user_id, news_id) DO UPDATE SET
        last_read_at = excluded.last_read_at,
        read_count = user_read_history.read_count + 1
    `, [userId, String(newsId), timestamp, timestamp]);

    await this.run(`
      DELETE FROM user_read_history
      WHERE user_id = ? AND news_id NOT IN (
        SELECT news_id FROM user_read_history
        WHERE user_id = ?
        ORDER BY last_read_at DESC
        LIMIT ?
      )
    `, [userId, userId, Math.max(1, Number(maxEntries) || 500)]);
  }

  async getUserReadHistory(userId, limit = 500) {
    const rows = await this.all(`
      SELECT news_id, last_read_at, read_count
      FROM user_read_history
      WHERE user_id = ?
      ORDER BY last_read_at DESC
      LIMIT ?
    `, [userId, Math.max(1, Math.min(1000, Number(limit) || 500))]);

    return rows.map((row) => ({
      id: row.news_id,
      readAt: Number(row.last_read_at),
      readCount: Number(row.read_count)
    }));
  }

  async clearUserReadHistory(userId) {
    const result = await this.run('DELETE FROM user_read_history WHERE user_id = ?', [userId]);
    return result.changes;
  }

  // ============ 用户认证 ============

  async createUser({ id, email, passwordHash, displayName, provider = 'password', googleId = null }) {
    await this.run(`
      INSERT INTO users (id, email, password_hash, display_name, provider, google_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [id, email, passwordHash, displayName, provider, googleId]);

    return this.getUserById(id);
  }

  async getUserById(userId) {
    return this.get(`
      SELECT
        id,
        email,
        password_hash,
        display_name,
        provider,
        google_id,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
    `, [userId]);
  }

  async getUserByEmail(email) {
    return this.get(`
      SELECT
        id,
        email,
        password_hash,
        display_name,
        provider,
        google_id,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE email = ?
    `, [email]);
  }

  async updateUserLastLogin(userId) {
    await this.run(`
      UPDATE users
      SET last_login_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `, [userId]);
  }

  async updateUserProfile(userId, { displayName }) {
    await this.run(`
      UPDATE users
      SET display_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [displayName, userId]);

    return this.getUserById(userId);
  }

  async updateUserPassword(userId, passwordHash) {
    await this.run(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [passwordHash, userId]);

    return this.getUserById(userId);
  }

  async createAuthSession({ id, userId, tokenHash, expiresAt, userAgent = null, ipAddress = null }) {
    await this.run(`
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, user_agent, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [id, userId, tokenHash, expiresAt, userAgent, ipAddress]);
  }

  async getAuthSessionWithUser(tokenHash) {
    return this.get(`
      SELECT
        s.id AS session_id,
        s.user_id,
        s.token_hash,
        s.expires_at,
        s.user_agent,
        s.ip_address,
        u.id,
        u.email,
        u.password_hash,
        u.display_name,
        u.provider,
        u.google_id,
        u.last_login_at,
        u.created_at,
        u.updated_at
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `, [tokenHash]);
  }

  async deleteAuthSession(tokenHash) {
    await this.run('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
  }

  async deleteExpiredAuthSessions(referenceTime = new Date().toISOString()) {
    const result = await this.run('DELETE FROM auth_sessions WHERE expires_at <= ?', [referenceTime]);
    return result.changes;
  }

  // 关闭数据库连接
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('数据库连接已关闭');
    }
  }
}

// 单例模式
const databaseService = new DatabaseService();

module.exports = databaseService;
