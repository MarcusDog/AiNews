const express = require('express');

function sendError(res, error) {
  const status = Number(error.statusCode) || 500;
  res.status(status).json({ success: false, error: status >= 500 ? 'websub_internal_error' : error.code || error.message });
}

function createYoutubeWebSubRouter({ service }) {
  if (!service) throw new TypeError('YouTube WebSub service is required');
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const challenge = await service.verifyChallenge(req.query);
      res.type('text/plain').send(challenge);
    } catch (error) {
      sendError(res, error);
    }
  });
  router.post(
    '/',
    express.raw({
      type: ['application/atom+xml', 'application/xml', 'text/xml', 'application/rss+xml'],
      limit: '1mb'
    }),
    async (req, res) => {
      try {
        const result = await service.handleNotification({ rawBody: req.body, headers: req.headers });
        res.status(202).json({ success: true, ...result });
      } catch (error) {
        sendError(res, error);
      }
    }
  );
  return router;
}

module.exports = {
  createYoutubeWebSubRouter
};
