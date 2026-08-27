const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/DatabaseService');
const { adminAuth } = require('../middleware/adminAuth');

// 创建 contacts 表（如果不存在）
async function initContactsTable() {
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
  console.log('✅ Contacts 表已初始化');
}

// 提交联系表单
router.post('/submit', async (req, res) => {
  try {
    const { role, delivery, problem, timeline, contact, language = 'zh' } = req.body;

    // 验证必填字段
    if (!role || !delivery || !problem || !timeline || !contact) {
      return res.status(400).json({
        success: false,
        error: '所有字段均为必填项'
      });
    }

    await initContactsTable();

    const id = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    await DatabaseService.run(
      `INSERT INTO contacts (id, role, delivery, problem, timeline, contact_info, language, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, role, delivery, problem, timeline, contact, language, ipAddress, userAgent]
    );

    console.log(`📩 新联系表单提交: ${id}`);

    res.json({
      success: true,
      message: '已收到您的消息，将在24-48小时内回复',
      id
    });
  } catch (error) {
    console.error('❌ 联系表单提交失败:', error);
    res.status(500).json({
      success: false,
      error: '提交失败，请稍后重试或直接发邮件到 hi@xiaotianaya.com'
    });
  }
});

// 获取所有联系表单（管理用）
router.get('/list', adminAuth, async (req, res) => {
  try {
    await initContactsTable();

    const contacts = await DatabaseService.all(
      'SELECT * FROM contacts ORDER BY created_at DESC LIMIT 100'
    );

    res.json({
      success: true,
      data: contacts,
      total: contacts.length
    });
  } catch (error) {
    console.error('❌ 获取联系列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
