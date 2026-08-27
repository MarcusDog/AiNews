const express = require('express');
const NewsService = require('../services/NewsService');
const SignalService = require('../services/signals/signal-service');
const {
  buildJsonFeed,
  buildOpenApiDocument,
  buildPublicSkillMarkdown,
  buildRssFeed,
  buildTopicJsonFeed,
  buildTopicRssFeed
} = require('../services/PublicDiscoveryService');

function requestOrigin(req) {
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProtocol || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

function feedLimit(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(Math.max(number, 1), 100) : 50;
}

async function latestFeedItems(req, newsService) {
  const result = await newsService.getLatestNews({ page: 1, limit: feedLimit(req.query.limit) });
  return Array.isArray(result?.data) ? result.data : [];
}

function topicFeedItems(req, signalService) {
  const topics = signalService.listTopics({ windowHours: 72, limit: feedLimit(req.query.limit), offset: 0 });
  return topics.map((topic) => signalService.getTopic(topic.id)).filter(Boolean);
}

function createPublicRouter(options = {}) {
  const router = express.Router();
  const newsService = options.newsService || NewsService;
  const signalService = options.signalService || new SignalService();

  router.get('/skill.md', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('text/markdown').send(buildPublicSkillMarkdown({ origin: requestOrigin(req) }));
  });

  router.get('/openapi.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=900');
    res.json(buildOpenApiDocument({ origin: requestOrigin(req) }));
  });

  router.get('/feed.json', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.type('application/feed+json').send(buildJsonFeed(await latestFeedItems(req, newsService), { origin: requestOrigin(req) }));
    } catch (error) { next(error); }
  });

  router.get('/rss.xml', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.type('application/rss+xml').send(buildRssFeed(await latestFeedItems(req, newsService), { origin: requestOrigin(req) }));
    } catch (error) { next(error); }
  });

  router.get('/topics/feed.json', (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.type('application/feed+json').send(buildTopicJsonFeed(topicFeedItems(req, signalService), { origin: requestOrigin(req) }));
    } catch (error) { next(error); }
  });

  router.get('/topics/rss.xml', (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.type('application/rss+xml').send(buildTopicRssFeed(topicFeedItems(req, signalService), { origin: requestOrigin(req) }));
    } catch (error) { next(error); }
  });
  return router;
}

const router = createPublicRouter();
router.createPublicRouter = createPublicRouter;
module.exports = router;
module.exports.createPublicRouter = createPublicRouter;
