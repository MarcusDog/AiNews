// 增量批量抓取脚本 - 由 cron 或手动调用
// 把所有 is_active=1 源依次抓取，命中后入库
const ns = require('../services/NewsService');
const db = require('../services/DatabaseService');

(async () => {
  await db.initialize();
  const sources = db.db.prepare('SELECT * FROM rss_sources WHERE is_active=1').all();
  console.log(`[BulkFetch] 开始批量抓取 ${sources.length} 个源`);
  let totalPull = 0, totalSave = 0, okCount = 0;
  const startMs = Date.now();
  for (const row of sources) {
    const t0 = Date.now();
    try {
      const items = await ns.fetchRSSFeed(row, 1);
      const dt = Date.now() - t0;
      if (items.length > 0) {
        const arts = items.map(it => ({
          id: it.id, title: it.title, description: it.description || it.title,
          url: it.url,
          published_at: typeof it.publishedAt === 'string' ? it.publishedAt : (it.publishedAt?.toISOString?.() || new Date().toISOString()),
          category: it.category || 'AI新闻', source: it.source,
          image_url: it.imageUrl || null, author: it.author || null
        }));
        const saved = await db.saveNews(arts);
        totalPull += items.length;
        totalSave += saved;
        if (saved > 0) okCount++;
      }
    } catch (e) {
      // 静默失败，单源错误不影响后续
    }
  }
  const totalMs = Date.now() - startMs;
  console.log(`[BulkFetch] 完成 | 总源 ${sources.length} | 拉到 ${totalPull} 条 | 入库 ${totalSave} 条 | 命中源 ${okCount} 个 | 耗时 ${Math.round(totalMs/1000)}s`);
  process.exit(0);
})().catch(e => { console.error('[BulkFetch] Fatal:', e); process.exit(1); });