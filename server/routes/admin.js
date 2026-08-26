const express = require('express');
const rateLimit = require('express-rate-limit');
const NewsService = require('../services/NewsService');
const DatabaseService = require('../services/DatabaseService');
const { agentService } = require('../services/AgentService');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '管理请求过于频繁，请稍后再试' }
}));
router.use(adminAuth);

async function ensureContactsTable() {
  await DatabaseService.initialize();
  await DatabaseService.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      delivery TEXT NOT NULL,
      problem TEXT NOT NULL,
      timeline TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      language TEXT DEFAULT 'zh',
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'unread'
    )
  `);
}

function fail(res, operation, error) {
  console.error(`管理后台${operation}失败:`, error.message);
  return res.status(500).json({ success: false, error: `${operation}失败，请稍后重试` });
}

router.post('/verify', (req, res) => {
  res.json({ success: true, data: { authenticated: true } });
});

router.get('/overview', async (req, res) => {
  try {
    const [health, statistics, sources] = await Promise.all([
      NewsService.healthCheck(),
      NewsService.getStatistics(),
      NewsService.getAdminSources()
    ]);
    res.json({
      success: true,
      data: {
        health,
        statistics,
        agent: agentService.getStatus(),
        sources: {
          total: sources.length,
          healthy: sources.filter((source) => source.is_healthy).length,
          inactive: sources.filter((source) => !source.is_active).length,
          failing: sources.filter((source) => Number(source.fail_count) > 0).length
        },
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return fail(res, '读取概览', error);
  }
});

router.get('/sources', async (req, res) => {
  try {
    const sources = await NewsService.getAdminSources();
    res.json({ success: true, data: sources });
  } catch (error) {
    return fail(res, '读取数据源', error);
  }
});

router.get('/logs', async (req, res) => {
  try {
    await DatabaseService.initialize();
    const logs = await DatabaseService.getRequestStats(60);
    res.json({ success: true, data: logs });
  } catch (error) {
    return fail(res, '读取请求日志', error);
  }
});

router.get('/contacts', async (req, res) => {
  try {
    await ensureContactsTable();
    const contacts = await DatabaseService.all(
      'SELECT id, role, delivery, problem, timeline, contact_info, language, created_at, status FROM contacts ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ success: true, data: contacts, total: contacts.length });
  } catch (error) {
    return fail(res, '读取联系表单', error);
  }
});

router.post('/sources/reset', async (req, res) => {
  try {
    await DatabaseService.initialize();
    await DatabaseService.resetFailedSources();
    res.json({ success: true, message: '失败计数已重置' });
  } catch (error) {
    return fail(res, '重置数据源', error);
  }
});

router.post('/recovery', async (req, res) => {
  try {
    const result = await NewsService.manualRecovery();
    res.json({ success: true, data: result });
  } catch (error) {
    return fail(res, '恢复采集', error);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const result = await NewsService.updateAllNews();
    res.json({ success: true, data: result });
  } catch (error) {
    return fail(res, '刷新资讯', error);
  }
});

module.exports = router;
