const express = require('express');
const rateLimit = require('express-rate-limit');
const { agentService } = require('../services/AgentService');
const { agentContextService } = require('../services/AgentContextService');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Agent 请求较多，请稍后再试' }
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: agentService.getStatus() });
});

router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!message) return res.status(400).json({ success: false, error: '问题不能为空' });
    if (message.length > 3000) return res.status(400).json({ success: false, error: '问题不能超过 3000 个字符' });
    if (history.length > 20) return res.status(400).json({ success: false, error: '对话历史过长，请开启新对话' });

    const context = await agentContextService.build(message);
    const result = await agentService.chat({ message, history, context });
    res.json({
      success: true,
      data: {
        ...result,
        context: {
          generatedAt: context.generatedAt,
          selectedSources: context.sources.length,
          analyzedArticles: context.retrieval.analyzedArticles,
          queryTerms: context.retrieval.queryTerms
        }
      }
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    if (status >= 500) console.error('Agent 请求失败:', error.message);
    res.status(status).json({
      success: false,
      error: status === 503
        ? 'Agent 尚未配置，请在服务端设置 MINIMAX_API_KEY'
        : status === 400 ? error.message : 'Agent 暂时无法回答，请稍后重试'
    });
  }
});

module.exports = router;
