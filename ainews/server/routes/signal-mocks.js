/**
 * Local mock signal sources.
 *
 * Returns deterministic dev fixtures for the L2 / L3 / L4 source
 * adapters. Mounted under /api/_mock/* so it never collides with
 * real signal routes.
 *
 * This is **not** a production signal pipeline. The fixtures here are
 * clearly labelled `source_confidence: 'mock'` and marked as such on
 * every record. Real-world deploys must set:
 *   YOUTUBE_API_KEY, X_BEARER_TOKEN, RSSHUB_BASE_URL,
 *   NEWSNOW_BASE_URL, SIGNAL_BRIDGES_JSON,
 *   MEDIACRAWLER_URL, AGENT_REACH_URL
 * to real values and disable this router.
 */

const express = require('express');

const nowIso = () => new Date().toISOString();
const isoMinus = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();

function youtubeSearch() {
  return {
    items: [
      {
        id: { kind: 'youtube#video', videoId: 'mock-yt-1' },
        snippet: {
          title: 'Mock · Run an open-source LLM locally with Ollama',
          description: 'Demo fixture — real YouTube Data API key required for production.',
          channelTitle: 'mock-channel',
          publishedAt: isoMinus(2),
          thumbnails: { medium: { url: 'https://example.com/thumb-1.jpg' } }
        }
      },
      {
        id: { videoId: 'mock-yt-2' },
        snippet: {
          title: 'Mock · Anthropic Claude Code in production',
          description: 'Demo fixture.',
          channelTitle: 'mock-channel',
          publishedAt: isoMinus(8)
        }
      },
      {
        id: { videoId: 'mock-yt-3' },
        snippet: {
          title: 'Mock · Hugging Face Transformers 5 minute intro',
          description: 'Demo fixture.',
          channelTitle: 'mock-channel',
          publishedAt: isoMinus(20)
        }
      },
      {
        id: { videoId: 'mock-yt-4' },
        snippet: {
          title: 'Mock · LangChain agent evaluation patterns',
          description: 'Demo fixture.',
          channelTitle: 'mock-channel',
          publishedAt: isoMinus(34)
        }
      },
      {
        id: { videoId: 'mock-yt-5' },
        snippet: {
          title: 'Mock · OpenAI Whisper on consumer hardware',
          description: 'Demo fixture.',
          channelTitle: 'mock-channel',
          publishedAt: isoMinus(50)
        }
      }
    ]
  };
}

function xRecentSearch() {
  const tweets = [
    'Mock · Released an open-source LLM with 128k context today.',
    'Mock · Working on a multi-agent LangGraph runtime.',
    'Mock · Comparing Claude vs GPT-4o on agent benchmarks.',
    'Mock · Whisper v3 turbo is significantly faster than v2.',
    'Mock · The new open-weights Llama variant is impressive.'
  ];
  return {
    data: tweets.map((text, index) => ({
      id: `mock-x-${index}`,
      text,
      author_id: `mock_user_${index}`,
      created_at: isoMinus(index * 6 + 1),
      public_metrics: { like_count: 100 + index * 30, retweet_count: 20 + index * 5, reply_count: 5 }
    }))
  };
}

function rsshubRss(feedTitle, items) {
  const buildItem = (item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.url}</link>
      <description><![CDATA[${item.summary}]]></description>
      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
      <guid isPermaLink="false">${item.id}</guid>
    </item>`;
  const buildItems = items.map(buildItem).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${feedTitle}</title>
    <link>https://example.com/${feedTitle}</link>
    <description>RSSHub mock fixture</description>
    ${buildItems}
  </channel>
</rss>`;
}

function rsshubWeiboHot() {
  return rsshubRss('微博热搜', [
    { id: 'mock-wb-1', title: 'Mock · 微博热搜 1', url: 'https://example.com/wb/1', summary: 'demo fixture', publishedAt: isoMinus(1) },
    { id: 'mock-wb-2', title: 'Mock · 微博热搜 2', url: 'https://example.com/wb/2', summary: 'demo fixture', publishedAt: isoMinus(2) },
    { id: 'mock-wb-3', title: 'Mock · 微博热搜 3', url: 'https://example.com/wb/3', summary: 'demo fixture', publishedAt: isoMinus(3) }
  ]);
}

function rsshubZhihuHot() {
  return rsshubRss('知乎热榜', [
    { id: 'mock-zh-1', title: 'Mock · 知乎热榜 1', url: 'https://example.com/zh/1', summary: 'demo fixture', publishedAt: isoMinus(1) },
    { id: 'mock-zh-2', title: 'Mock · 知乎热榜 2', url: 'https://example.com/zh/2', summary: 'demo fixture', publishedAt: isoMinus(2) },
    { id: 'mock-zh-3', title: 'Mock · 知乎热榜 3', url: 'https://example.com/zh/3', summary: 'demo fixture', publishedAt: isoMinus(3) }
  ]);
}

function rsshubDouyinHot() {
  return rsshubRss('抖音热榜', [
    { id: 'mock-dy-1', title: 'Mock · 抖音热榜 1', url: 'https://example.com/dy/1', summary: 'demo fixture', publishedAt: isoMinus(1) },
    { id: 'mock-dy-2', title: 'Mock · 抖音热榜 2', url: 'https://example.com/dy/2', summary: 'demo fixture', publishedAt: isoMinus(2) },
    { id: 'mock-dy-3', title: 'Mock · 抖音热榜 3', url: 'https://example.com/dy/3', summary: 'demo fixture', publishedAt: isoMinus(3) }
  ]);
}

function newsnowJson(platformName, count = 3) {
  return {
    items: Array.from({ length: count }).map((_, index) => ({
      id: `mock-${platformName}-${index}`,
      title: `Mock · ${platformName} 热榜 #${index + 1}`,
      url: `https://example.com/${platformName}/${index}`,
      summary: 'demo fixture from local mock service',
      publishedAt: isoMinus(index + 1),
      hot: 10000 - index * 1000,
      source: platformName,
      source_confidence: 'mock'
    }))
  };
}

function jsonBridgeResponse() {
  return {
    items: [
      { id: 'mock-bridge-1', title: 'Mock · JSON Bridge #1', url: 'https://example.com/bridge/1', summary: 'demo fixture', publishedAt: isoMinus(1), source_confidence: 'mock' },
      { id: 'mock-bridge-2', title: 'Mock · JSON Bridge #2', url: 'https://example.com/bridge/2', summary: 'demo fixture', publishedAt: isoMinus(2), source_confidence: 'mock' }
    ]
  };
}

function mediaCrawlerResponse() {
  return {
    items: [
      { id: 'mock-mc-1', platform: 'xhs',  title: 'Mock · 小红书深挖 #1', url: 'https://example.com/mc/xhs/1', summary: 'demo fixture (login-sidecar mode)', publishedAt: isoMinus(1), source_confidence: 'mock' },
      { id: 'mock-mc-2', platform: 'dy',   title: 'Mock · 抖音深挖 #1',     url: 'https://example.com/mc/dy/1',  summary: 'demo fixture', publishedAt: isoMinus(2), source_confidence: 'mock' }
    ]
  };
}

function agentReachResponse() {
  return {
    items: [
      { id: 'mock-ar-1', platform: 'agent-reach', title: 'Mock · 工作站深挖 #1', url: 'https://example.com/ar/1', summary: 'demo fixture', publishedAt: isoMinus(1), source_confidence: 'mock' }
    ]
  };
}

function createSignalMockRouter() {
  const router = express.Router();
  // YouTube Data API search mock
  router.get('/youtube/search', (req, res) => {
    const q = String(req.query.q || 'AI');
    const items = youtubeSearch().items.map((item) => ({
      ...item,
      snippet: { ...item.snippet, title: `${item.snippet.title} (q=${q})` }
    }));
    res.json({ items });
  });
  // X (Twitter) recent search mock
  router.get('/x/tweets/search/recent', (req, res) => res.json(xRecentSearch()));
  // RSSHub (RSS XML) mock
  router.get('/rsshub/weibo/search/hot', (req, res) => {
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rsshubWeiboHot());
  });
  router.get('/rsshub/zhihu/hotlist', (req, res) => {
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rsshubZhihuHot());
  });
  router.get('/rsshub/douyin/hot', (req, res) => {
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rsshubDouyinHot());
  });
  // NewsNow mock
  router.get('/newsnow/api/s', (req, res) => {
    const platform = String(req.query.id || 'weibo');
    res.json(newsnowJson(platform, 3));
  });
  // JSON Bridge mock (used by SIGNAL_BRIDGES_JSON)
  router.get('/bridge', (req, res) => res.json(jsonBridgeResponse()));
  // Sidecar mocks (L4)
  router.get('/mediacrawler', (req, res) => res.json(mediaCrawlerResponse()));
  router.get('/agent-reach', (req, res) => res.json(agentReachResponse()));
  return router;
}

module.exports = { createSignalMockRouter };