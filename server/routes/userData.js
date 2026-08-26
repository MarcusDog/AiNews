const express = require('express');

const DatabaseService = require('../services/DatabaseService');
const { requireSessionUser } = require('../middleware/sessionAuth');

const router = express.Router();
router.use(requireSessionUser);

function sendError(res, error) {
  const status = /缺少/.test(error.message || '') ? 400 : 500;
  res.status(status).json({ success: false, error: error.message || '用户数据操作失败' });
}

async function getUserData(userId) {
  const [favorites, readHistory] = await Promise.all([
    DatabaseService.getUserFavorites(userId),
    DatabaseService.getUserReadHistory(userId)
  ]);
  return { favorites, readHistory };
}

router.get('/', async (req, res) => {
  try {
    res.json({ success: true, data: await getUserData(req.authUser.id) });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/favorites', async (req, res) => {
  try {
    const favorite = await DatabaseService.upsertUserFavorite(req.authUser.id, req.body?.article);
    res.json({ success: true, data: { favorite } });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/favorites/:newsId', async (req, res) => {
  try {
    const removed = await DatabaseService.removeUserFavorite(req.authUser.id, req.params.newsId);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/favorites', async (req, res) => {
  try {
    const removed = await DatabaseService.clearUserFavorites(req.authUser.id);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/read-history/:newsId', async (req, res) => {
  try {
    await DatabaseService.markUserNewsRead(req.authUser.id, req.params.newsId, req.body?.readAt);
    res.json({ success: true, data: { recorded: true } });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/read-history', async (req, res) => {
  try {
    const removed = await DatabaseService.clearUserReadHistory(req.authUser.id);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/import', async (req, res) => {
  try {
    const favorites = Array.isArray(req.body?.favorites) ? req.body.favorites.slice(0, 500) : [];
    const readHistory = Array.isArray(req.body?.readHistory) ? req.body.readHistory.slice(0, 500) : [];

    for (const article of favorites) {
      if (article?.id && article?.title) {
        await DatabaseService.upsertUserFavorite(req.authUser.id, article);
      }
    }
    for (const record of readHistory) {
      if (record?.id) {
        const existing = await DatabaseService.get(
          'SELECT 1 FROM user_read_history WHERE user_id = ? AND news_id = ?',
          [req.authUser.id, String(record.id)]
        );
        if (!existing) {
          await DatabaseService.markUserNewsRead(req.authUser.id, record.id, record.readAt);
        }
      }
    }

    res.json({ success: true, data: await getUserData(req.authUser.id) });
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = router;
