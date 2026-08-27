// Trending 缓存服务 - 每天 04:00 cron 重建，全天 5min 缓存复用
const path = require('path');
const fs = require('fs');
const { SearchTrendingService } = require('./SearchTrendingService');

const CACHE_FILE = path.join(__dirname, '../cache/trending-cache.json');
const TTL_HOURS = 4;  // 4 小时内直接读缓存

class TrendingCache {
  static buildCache(days = 14, limit = 25, minCount = 2) {
    const svc = new SearchTrendingService();
    const data = svc.getTrending({ days, limit, minCount });
    const payload = {
      generatedAt: new Date().toISOString(),
      ttlHours: TTL_HOURS,
      days,
      limit,
      minCount,
      data
    };
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2));
      console.log('[TrendingCache] 已重建缓存:', CACHE_FILE);
    } catch (e) {
      console.error('[TrendingCache] 写缓存失败:', e.message);
    }
    return payload;
  }

  static readCache() {
    try {
      if (!fs.existsSync(CACHE_FILE)) return null;
      const stat = fs.statSync(CACHE_FILE);
      const ageHours = (Date.now() - stat.mtime.getTime()) / 1000 / 3600;
      if (ageHours > TTL_HOURS) {
        console.log(`[TrendingCache] 缓存已过期（${ageHours.toFixed(1)}h > ${TTL_HOURS}h），需重建`);
        return null;
      }
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      console.error('[TrendingCache] 读缓存失败:', e.message);
      return null;
    }
  }

  static get() {
    return this.readCache() || this.buildCache();
  }
}

module.exports = TrendingCache;