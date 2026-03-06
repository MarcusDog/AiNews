const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '../data/ainews.db');
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
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('数据库连接失败:', err);
          reject(err);
          return;
        }
        
        console.log('SQLite数据库连接成功:', this.dbPath);
        this.createTables()
          .then(() => {
            this.isInitialized = true;
            resolve();
          })
          .catch(reject);
      });
    });
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

      -- 系统配置表
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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

  // 执行SQL（Promise封装）
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // 查询单行
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // 查询多行
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
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
    
    for (const article of articles) {
      try {
        // 跳过已存在的URL（除非是更新操作）
        if (existingUrls.has(article.url)) {
          // 检查是否需要更新（24小时内的文章可能更新）
          const existing = await this.get(
            'SELECT id, published_at FROM news WHERE url = ?',
            [article.url]
          );
          
          if (existing) {
            const existingDate = new Date(existing.published_at);
            const articleDate = new Date(article.publishedAt);
            const hoursDiff = (articleDate - existingDate) / (1000 * 60 * 60);
            
            // 如果发布时间相差超过24小时，认为是不同文章
            if (hoursDiff > 24) {
              // 生成新ID保存为新文章
              await this.run(sql, [
                article.id + '_' + Date.now(),
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
            } else {
              skippedCount++;
            }
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
        GROUP BY url
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
    const countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT url FROM news 
        GROUP BY url
        HAVING 1=1
        ${category && category !== '全部' ? 'AND category = ?' : ''}
        ${search ? 'AND (title LIKE ? OR description LIKE ?)' : ''}
      )
    `;
    const countParams = [];
    if (category && category !== '全部') countParams.push(category);
    if (search) {
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
    const result = await this.get('SELECT COUNT(*) as count FROM news');
    return result ? result.count : 0;
  }

  // 获取分类统计
  async getCategoryStats() {
    const rows = await this.all(`
      SELECT category, COUNT(*) as count 
      FROM news 
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
      GROUP BY source 
      ORDER BY count DESC
    `);
    return rows;
  }

  // 清理旧新闻（保留最近7天）
  async cleanOldNews(daysToKeep = 7) {
    const result = await this.run(`
      DELETE FROM news 
      WHERE published_at < datetime('now', '-' || ? || ' days')
    `, [daysToKeep]);
    
    console.log(`清理了 ${result.changes} 条过期新闻`);
    return result.changes;
  }

  // ============ RSS源状态管理 ============

  // 更新RSS源状态
  async updateRssSourceStatus(name, url, success, errorMessage = null) {
    const sql = `
      INSERT INTO rss_sources (name, url, last_fetch, last_success, fail_count, error_message)
      VALUES (?, ?, datetime('now'), ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        last_fetch = datetime('now'),
        last_success = CASE WHEN ? THEN datetime('now') ELSE last_success END,
        fail_count = CASE WHEN ? THEN 0 ELSE fail_count + 1 END,
        error_message = ?,
        is_active = CASE WHEN fail_count >= 10 THEN 0 ELSE 1 END
    `;
    
    await this.run(sql, [
      name, url,
      success ? new Date().toISOString() : null,
      success ? 0 : 1,
      errorMessage,
      success, success,
      errorMessage
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
      VALUES (?, ?, datetime('now'))
    `, [key, value]);
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

  // 关闭数据库连接
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else {
            console.log('数据库连接已关闭');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

// 单例模式
const databaseService = new DatabaseService();

module.exports = databaseService;
